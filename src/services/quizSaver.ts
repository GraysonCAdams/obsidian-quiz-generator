import { App, normalizePath, Notice, TFile, TFolder, getFrontMatterInfo } from "obsidian";
import { QuizSettings } from "../settings/config";
import { Question, QuizResult, QuizStatistics, QuestionAttempt } from "../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../utils/typeGuards";
import { shuffleArray } from "../utils/helpers";

export default class QuizSaver {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly quizSources: TFile[];
	private readonly saveFilePath: string;
	private readonly validSavePath: boolean;
	private readonly existingQuizFile?: TFile;
	private readonly contentSelectionMode?: string; // "full" or "changes"
	private readonly quizTitle?: string | null; // Custom quiz title

	constructor(app: App, settings: QuizSettings, quizSources: TFile[], existingQuizFile?: TFile, contentSelectionMode?: string, quizTitle?: string | null) {
		this.app = app;
		this.settings = settings;
		this.quizSources = quizSources;
		this.existingQuizFile = existingQuizFile;
		this.contentSelectionMode = contentSelectionMode;
		this.quizTitle = quizTitle;
		this.saveFilePath = existingQuizFile?.path ?? this.getSaveFilePath();
		this.validSavePath = this.app.vault.getAbstractFileByPath(this.settings.savePath) instanceof TFolder;
	}

	public async saveQuestion(question: Question): Promise<void> {
		const saveFile = await this.getSaveFile();
		const questionBlock = this.createCalloutQuestion(question);
		const existingContent = await this.app.vault.read(saveFile);
		const frontmatterInfo = getFrontMatterInfo(existingContent);
		const body = frontmatterInfo.exists
			? existingContent.slice(frontmatterInfo.contentStart)
			: existingContent;
		const hasBodyContent = body.trim().length > 0;

		if (!hasBodyContent) {
			const descriptionLine = this.generateQuizDescription([question]);
			const descriptionBlock = descriptionLine ? `${descriptionLine}\n\n` : "";
			let prefix = existingContent;
			if (prefix.length > 0 && !prefix.endsWith("\n")) {
				prefix += "\n";
			}
			await this.app.vault.modify(saveFile, `${prefix}${descriptionBlock}${questionBlock}`);
		} else {
			await this.app.vault.append(saveFile, questionBlock);
		}

		if (this.validSavePath) {
			new Notice("Question saved");
		} else {
			new Notice("Invalid save path: Question saved in vault root folder");
		}
	}

	public async saveAllQuestions(questions: Question[]): Promise<void> {
		if (questions.length === 0) return;

		const quiz: string[] = [];
		for (const question of questions) {
			quiz.push(this.createCalloutQuestion(question));
		}
		const descriptionLine = this.generateQuizDescription(questions);
		const descriptionBlock = descriptionLine ? `${descriptionLine}\n\n` : "";

		// Get save file (this will ensure contentSelectionMode is in frontmatter if provided)
		const saveFile = await this.getSaveFile();
		
		// If file already exists and has content, we need to append, otherwise create with content
		const existingContent = await this.app.vault.read(saveFile);
		const frontmatterInfo = getFrontMatterInfo(existingContent);
		const body = frontmatterInfo.exists
			? existingContent.slice(frontmatterInfo.contentStart)
			: existingContent;
		const hasBodyContent = body.trim().length > 0;
		const quizContent = quiz.join("");

		if (!hasBodyContent) {
			let prefix = existingContent;
			if (prefix.length > 0 && !prefix.endsWith("\n")) {
				prefix += "\n";
			}
			await this.app.vault.modify(saveFile, `${prefix}${descriptionBlock}${quizContent}`);
		} else {
			await this.app.vault.append(saveFile, quizContent);
		}
		
		if (this.validSavePath) {
			new Notice("All questions saved");
		} else {
			new Notice("Invalid save path: All questions saved in vault root folder");
		}
	}

	public async saveQuizResults(results: QuizResult[], questionHashes: string[], timestamp: string): Promise<void> {
		// Use existing quiz file if reviewing, otherwise get/create the file
		const saveFile = this.existingQuizFile ?? this.app.vault.getAbstractFileByPath(this.saveFilePath);
		if (!(saveFile instanceof TFile)) {
			new Notice("Could not find quiz file to save results");
			return;
		}

		const correctAnswers = results.filter(r => r.correct).length;
		const incorrectAnswers = results.length - correctAnswers;
		const score = Math.round((correctAnswers / results.length) * 100);

		// Create new attempts for this quiz session
		const newAttempts: QuestionAttempt[] = results.map((result) => ({
			questionHash: questionHashes[result.questionIndex],
			correct: result.correct,
			timestamp
		}));

		// Track which hashes we're adding in this save to prevent duplicates
		const newAttemptsSet = new Set(newAttempts.map(a => a.questionHash));

		// Read current file content
		const content = await this.app.vault.read(saveFile);
		const frontmatterInfo = getFrontMatterInfo(content);

		// Parse existing question attempts if they exist - try new format first
		let existingAttempts: QuestionAttempt[] = [];
		if (frontmatterInfo.exists) {
			const fmLines = frontmatterInfo.frontmatter.split('\n');
			
			// Try new compact JSON format
			const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
			if (quizAttemptsLine) {
				try {
					const jsonMatch = quizAttemptsLine.match(/quiz_attempts:\s*(.+)$/);
					if (jsonMatch) {
						const attemptData = JSON.parse(jsonMatch[1]);
						for (const attempt of attemptData) {
							existingAttempts.push({
								questionHash: attempt.h,
								correct: attempt.c,
								timestamp: attempt.t
							});
						}
					}
				} catch (error) {
					console.error("Error parsing quiz_attempts JSON:", error);
				}
			} else {
				// Fall back to old YAML format
				let inAttempts = false;
				let currentHash = "";
				let currentCorrect = false;
				let currentTimestamp = "";
				let currentAttempt: Partial<QuestionAttempt> = {};
				
				for (const line of fmLines) {
					if (line.trim().startsWith('question_attempts:')) {
						inAttempts = true;
					} else if (inAttempts && line.match(/^\s{2}-\s*$/)) {
						// Save previous attempt
						if (currentHash) {
							existingAttempts.push({
								questionHash: currentHash,
								correct: currentCorrect,
								timestamp: currentTimestamp
							});
						}
						// Reset for next attempt
						currentHash = "";
						currentCorrect = false;
						currentTimestamp = "";
					} else if (inAttempts && line.includes('hash:')) {
						const match = line.match(/hash:\s*["']?([^"'\n]+)["']?/);
						if (match) currentHash = match[1];
					} else if (inAttempts && line.includes('correct:')) {
						const match = line.match(/correct:\s*(true|false)/);
						if (match) currentCorrect = match[1] === 'true';
					} else if (inAttempts && line.includes('timestamp:')) {
						const match = line.match(/timestamp:\s*["']?([^"'\n]+)["']?/);
						if (match) currentTimestamp = match[1];
					} else if (inAttempts && !line.startsWith('  ') && line.trim().length > 0 && !line.trim().startsWith('-')) {
						// Save last attempt and exit
						if (currentHash) {
							existingAttempts.push({
								questionHash: currentHash,
								correct: currentCorrect,
								timestamp: currentTimestamp
							});
						}
						break;
					}
				}
				
				// Save last attempt if still pending
				if (currentHash && inAttempts) {
					existingAttempts.push({
						questionHash: currentHash,
						correct: currentCorrect,
						timestamp: currentTimestamp
					});
				}
			}
		}

		// Combine existing and new attempts
		// Remove any existing attempts from this session (same timestamp) that are being re-saved
		const filteredExisting = existingAttempts.filter(attempt => 
			!(attempt.timestamp === timestamp && newAttemptsSet.has(attempt.questionHash))
		);
		const allAttempts = [...filteredExisting, ...newAttempts];

		// Build new frontmatter - store attempts as compact JSON array
		let newContent: string;
		const attemptData: any[] = [];
		if (allAttempts.length > 0) {
			for (const attempt of allAttempts) {
				attemptData.push({
					h: attempt.questionHash,
					c: attempt.correct,
					t: attempt.timestamp
				});
			}
		}

		if (frontmatterInfo.exists) {
			// Update existing frontmatter - remove old quiz_results and question_attempts
			const frontmatterLines = frontmatterInfo.frontmatter.split('\n');
			const filteredLines: string[] = [];
			let skipUntilNextKey = false;
			
			for (let i = 1; i < frontmatterLines.length - 1; i++) {
				const line = frontmatterLines[i];
				// Remove old quiz_results, question_attempts, and new quiz_* fields
				if (line.trim().startsWith('quiz_results:') || 
				    line.trim().startsWith('question_attempts:') ||
				    line.trim().startsWith('quiz_score:') ||
				    line.trim().startsWith('quiz_total:') ||
				    line.trim().startsWith('quiz_correct:') ||
				    line.trim().startsWith('quiz_incorrect:') ||
				    line.trim().startsWith('quiz_completed:') ||
				    line.trim().startsWith('quiz_attempts:')) {
					skipUntilNextKey = true;
					continue;
				}
				if (skipUntilNextKey && line.match(/^[a-zA-Z_]/)) {
					skipUntilNextKey = false;
				}
				if (!skipUntilNextKey) {
					filteredLines.push(line);
				}
			}
			
			// Format quiz_results as inline properties for better rendering
			const updatedFrontmatter = [
				"---",
				...filteredLines,
				`quiz_score: ${score}`,
				`quiz_total: ${results.length}`,
				`quiz_correct: ${correctAnswers}`,
				`quiz_incorrect: ${incorrectAnswers}`,
				`quiz_completed: "${timestamp}"`,
				...(attemptData.length > 0 ? [`quiz_attempts: ${JSON.stringify(attemptData)}`] : []),
				"---"
			].join('\n');
			
			newContent = updatedFrontmatter + '\n' + content.slice(frontmatterInfo.contentStart);
		} else {
			// Add new frontmatter
			const newFrontmatter = [
				"---",
				`quiz_score: ${score}`,
				`quiz_total: ${results.length}`,
				`quiz_correct: ${correctAnswers}`,
				`quiz_incorrect: ${incorrectAnswers}`,
				`quiz_completed: "${timestamp}"`,
				...(attemptData.length > 0 ? [`quiz_attempts: ${JSON.stringify(attemptData)}`] : []),
				"---\n"
			].join('\n');
			
			newContent = newFrontmatter + content;
		}

		await this.app.vault.modify(saveFile, newContent);
		
		// Only notify when quiz is complete (all questions answered in this file)
		// Count total questions in the file by checking content
		const totalQuestionsInFile = (content.match(/>\s*\[!question\]/gi) || []).length + 
		                             (content.match(/\[!question\]/gi) || []).length;
		
		if (results.length >= totalQuestionsInFile) {
			const scoreDisplay = score >= 70 ? "✓" : "✗";
			new Notice(`${scoreDisplay} Quiz complete: ${correctAnswers}/${results.length} correct (${score}%)`);
			
			// Auto-rename file with score if setting is enabled
			if (this.settings.autoRenameQuizWithScore) {
				await this.renameFileWithScore(saveFile, score);
			}
		}
	}

	private async renameFileWithScore(file: TFile, score: number): Promise<void> {
		try {
			// Get the current filename without extension
			const currentBasename = file.basename;
			
			// Remove any existing [XX%] pattern from the filename
			const baseNameWithoutScore = currentBasename.replace(/\s*\[\d+%\]\s*$/, "").trim();
			
			// Create new filename with score
			const newBasename = `${baseNameWithoutScore} [${score}%]`;
			
			// Only rename if the name actually changed
			if (newBasename !== currentBasename) {
				const newPath = file.parent ? `${file.parent.path}/${newBasename}.${file.extension}` : `${newBasename}.${file.extension}`;
				await this.app.vault.rename(file, newPath);
			}
		} catch (error) {
			console.error("Error renaming quiz file with score:", error);
			// Don't show notice to user - silent failure
		}
	}

	private getFileNames(folder: TFolder): string[] {
		return folder.children
			.filter(file => file instanceof TFile)
			.map(file => file.name.toLowerCase())
			.filter(name => name.startsWith("quiz"));
	}

	private getSaveFilePath(): string {
		// Use custom title if provided
		if (this.quizTitle && this.quizTitle.trim()) {
			const sanitizedTitle = this.sanitizeFileName(this.quizTitle.trim());
			const saveFolder = this.app.vault.getAbstractFileByPath(this.settings.savePath);
			const validSavePath = saveFolder instanceof TFolder;
			const basePath = validSavePath ? normalizePath(`${this.settings.savePath}/${sanitizedTitle}.md`) : `${sanitizedTitle}.md`;
			
			// Check if file exists, if so append number
			const existingFile = this.app.vault.getAbstractFileByPath(basePath);
			if (!(existingFile instanceof TFile)) {
				return basePath;
			}
			
			// File exists, append number
			let count = 1;
			let newPath = basePath;
			while (this.app.vault.getAbstractFileByPath(newPath) instanceof TFile) {
				const baseName = sanitizedTitle.replace(/\.md$/, "");
				newPath = validSavePath 
					? normalizePath(`${this.settings.savePath}/${baseName} ${count}.md`) 
					: `${baseName} ${count}.md`;
				count++;
			}
			return newPath;
		}
		
		// Fallback to incremental naming
		let count = 1;
		const saveFolder = this.app.vault.getAbstractFileByPath(this.settings.savePath);
		const validSavePath = saveFolder instanceof TFolder;
		const fileNames = validSavePath ? this.getFileNames(saveFolder) : this.getFileNames(this.app.vault.getRoot());

		while (fileNames.includes(`quiz ${count}.md`)) {
			count++;
		}

		return validSavePath ? normalizePath(`${this.settings.savePath}/Quiz ${count}.md`) : `Quiz ${count}.md`;
	}
	
	private sanitizeFileName(fileName: string): string {
		// Remove or replace invalid filename characters
		// Windows: < > : " / \ | ? *
		// macOS/Linux: /
		return fileName
			.replace(/[<>:"/\\|?*]/g, "-")
			.replace(/\s+/g, " ")
			.trim()
			.substring(0, 255); // Limit filename length
	}

	private async getSaveFile(): Promise<TFile> {
		const saveFile = this.app.vault.getAbstractFileByPath(this.saveFilePath);
		
		// If file exists, ensure frontmatter includes sources and contentSelectionMode if provided
		if (saveFile instanceof TFile) {
			const content = await this.app.vault.read(saveFile);
			const frontmatterInfo = getFrontMatterInfo(content);
			
			// Check if we need to add sources or contentSelectionMode
			const needsSources = this.quizSources.length > 0 && this.settings.quizMaterialProperty;
			const needsContentMode = !!this.contentSelectionMode;
			
			if (needsSources || needsContentMode) {
				if (frontmatterInfo.exists) {
					const fmLines = frontmatterInfo.frontmatter.split('\n');
					const hasContentMode = fmLines.some(line => line.trim().startsWith('quiz_content_mode:'));
					const sourcesPropertyName = this.settings.quizMaterialProperty || '';
					const hasSources = sourcesPropertyName && fmLines.some(line => line.trim().startsWith(`${sourcesPropertyName}:`));
					
					const updates: string[] = [];
					
					// Add sources if missing and needed
					if (needsSources && !hasSources) {
						const sourcesProperty = `${sourcesPropertyName}:\n${this.quizSources.map(source => `  - "${this.app.fileManager.generateMarkdownLink(source, this.saveFilePath)}"`).join("\n")}\n`;
						updates.push(sourcesProperty);
					}
					
					// Add contentSelectionMode if missing and needed
					if (needsContentMode && !hasContentMode) {
						updates.push(`quiz_content_mode: ${this.contentSelectionMode}`);
					}
					
					if (updates.length > 0) {
						// Add updates to existing frontmatter
						const updatedFrontmatter = [
							"---",
							...fmLines.slice(1, -1), // All lines except --- boundaries
							...updates,
							"---"
						].join('\n');
						
						const newContent = updatedFrontmatter + '\n' + content.slice(frontmatterInfo.contentStart);
						await this.app.vault.modify(saveFile, newContent);
					}
				} else {
					// Add new frontmatter with sources and/or contentSelectionMode
					const sourcesProperty = needsSources
						? `${this.settings.quizMaterialProperty}:\n${this.quizSources.map(source => `  - "${this.app.fileManager.generateMarkdownLink(source, this.saveFilePath)}"`).join("\n")}\n`
						: "";
					const contentModeProperty = needsContentMode ? `quiz_content_mode: ${this.contentSelectionMode}\n` : "";
					const newFrontmatter = [
						"---",
						sourcesProperty,
						contentModeProperty,
						"---\n"
					].join('');
					await this.app.vault.modify(saveFile, newFrontmatter + content);
				}
			}
			return saveFile;
		}
		
		// Create new file with frontmatter
		const sourcesProperty = this.settings.quizMaterialProperty
			? `${this.settings.quizMaterialProperty}:\n${this.quizSources.map(source => `  - "${this.app.fileManager.generateMarkdownLink(source, this.saveFilePath)}"`).join("\n")}\n`
			: "";
		const contentModeProperty = this.contentSelectionMode 
			? `quiz_content_mode: ${this.contentSelectionMode}\n`
			: "";
		const initialContent = sourcesProperty || contentModeProperty
			? `---\n${sourcesProperty}${contentModeProperty}---\n`
			: "";
		return await this.app.vault.create(this.saveFilePath, initialContent);
	}

	private generateQuizDescription(questions: Question[]): string | null {
		if (this.quizTitle && this.quizTitle.trim().length > 0) {
			return `About this quiz: ${this.quizTitle.trim()}`;
		}

		const firstQuestion = questions[0]?.question ?? "";
		const sanitized = firstQuestion
			.replace(/`_+`/g, "____")
			.replace(/\s+/g, " ")
			.trim();

		if (!sanitized) return null;

		const summary = sanitized.length > 180 ? `${sanitized.slice(0, 177)}…` : sanitized;
		return `About this quiz: Quiz focus: ${summary}`;
	}

	private createCalloutQuestion(question: Question): string {
		if (isTrueFalse(question)) {
			const answer = question.answer.toString().charAt(0).toUpperCase() + question.answer.toString().slice(1);
			return `> [!question] ${question.question}\n` +
				`>> [!success]- Answer\n` +
				`>> ${answer}\n\n`;
		} else if (isMultipleChoice(question)) {
			const options = this.getCalloutOptions(question.options);
			return `> [!question] ${question.question}\n` +
				`${options.join("\n")}\n` +
				`>> [!success]- Answer\n` +
				`${options[question.answer].replace(">", ">>")}\n\n`;
		} else if (isSelectAllThatApply(question)) {
			const options = this.getCalloutOptions(question.options);
			const answers = options.filter((_, index) => question.answer.includes(index));
			return `> [!question] ${question.question}\n` +
				`${options.join("\n")}\n` +
				`>> [!success]- Answer\n` +
				`${answers.map(answer => answer.replace(">", ">>")).join("\n")}\n\n`;
		} else if (isFillInTheBlank(question)) {
			return `> [!question] ${question.question}\n` +
				`>> [!success]- Answer\n` +
				`>> ${question.answer.join(", ")}\n\n`;
		} else if (isMatching(question)) {
			const leftOptions = shuffleArray(question.answer.map(pair => pair.leftOption));
			const rightOptions = shuffleArray(question.answer.map(pair => pair.rightOption));
			const answers = this.getCalloutMatchingAnswers(leftOptions, rightOptions, question.answer);
			return `> [!question] ${question.question}\n` +
				`>> [!example] Group A\n` +
				`${this.getCalloutOptions(leftOptions).map(option => option.replace(">", ">>")).join("\n")}\n` +
				`>\n` +
				`>> [!example] Group B\n` +
				`${this.getCalloutOptions(rightOptions, 13).map(option => option.replace(">", ">>")).join("\n")}\n` +
				`>\n` +
				`>> [!success]- Answer\n` +
				`${answers.join("\n")}\n\n`;
		} else if (isShortOrLongAnswer(question)) {
			return `> [!question] ${question.question}\n` +
				`>> [!success]- Answer\n` +
				`>> ${question.answer}\n\n`;
		} else {
			return "> [!failure] Error saving question\n\n";
		}
	}

	private getCalloutOptions(options: string[], startIndex: number = 0): string[] {
		const letters = "abcdefghijklmnopqrstuvwxyz".slice(startIndex);
		return options.map((option, index) => `> ${letters[index]}) ${option}`);
	}

	private getCalloutMatchingAnswers(leftOptions: string[], rightOptions: string[], answer: { leftOption: string, rightOption: string }[]): string[] {
		const leftOptionIndexMap = new Map<string, number>(leftOptions.map((option, index) => [option, index]));
		const sortedAnswer = [...answer].sort((a, b) => leftOptionIndexMap.get(a.leftOption)! - leftOptionIndexMap.get(b.leftOption)!);

		return sortedAnswer.map(pair => {
			const leftLetter = String.fromCharCode(97 + leftOptions.indexOf(pair.leftOption));
			const rightLetter = String.fromCharCode(110 + rightOptions.indexOf(pair.rightOption));
			return `>> ${leftLetter}) -> ${rightLetter})`;
		});
	}

}
