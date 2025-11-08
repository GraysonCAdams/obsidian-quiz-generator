import { App, Modal, Notice, TFile, TFolder, getFrontMatterInfo } from "obsidian";
import { QuizSettings } from "../../settings/config";
import QuizModalLogic from "../quiz/quizModalLogic";
import { Question, QuestionAttempt } from "../../utils/types";
import QuizReviewer from "../../services/quizReviewer";
import { hashString } from "../../utils/helpers";

interface QuizFileInfo {
	file: TFile;
	score: number;
	missedCount: number;
	total: number;
	missedQuestionHashes: Set<string>;
	wrongAnswerCounts: Map<string, number>; // hash -> count of wrong answers
	completedAt?: string;
}

type OrderOption = "most-failed" | "oldest-newest" | "newest-oldest" | "random";

export default class MissedQuestionsModal extends Modal {
	private readonly settings: QuizSettings;
	private quizFiles: QuizFileInfo[] = [];
	private selectedFiles: Set<TFile> = new Set();
	private orderOption: OrderOption = "most-failed";
	private questionWrongCounts: Map<string, number> = new Map(); // Global wrong counts across all quizzes
	private readonly plugin?: any;

	constructor(app: App, settings: QuizSettings, plugin?: any) {
		super(app);
		this.settings = settings;
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		this.modalEl.addClass("missed-questions-modal-qg");
		this.titleEl.setText("Generate Quiz from Missed Questions");

		await this.loadQuizFiles();
		this.renderQuizList();
	}

	private async loadQuizFiles(): Promise<void> {
		const saveFolder = this.app.vault.getAbstractFileByPath(this.settings.savePath);
		if (!(saveFolder instanceof TFolder)) {
			new Notice("Quiz save folder not found");
			return;
		}

		const quizFiles: QuizFileInfo[] = [];
		this.questionWrongCounts.clear(); // Reset global counts

		for (const file of saveFolder.children) {
			if (file instanceof TFile && file.extension === "md") {
				const content = await this.app.vault.read(file);
				const frontmatterInfo = getFrontMatterInfo(content);

				if (frontmatterInfo.exists) {
					const fmLines = frontmatterInfo.frontmatter.split('\n');
					
					// Get completion date
					let completedAt: string | undefined;
					const completedLine = fmLines.find(line => line.trim().startsWith('quiz_completed:'));
					if (completedLine) {
						const match = completedLine.match(/quiz_completed:\s*["']?([^"'\n]+)["']?/);
						if (match) completedAt = match[1];
					}
					
					// Parse question attempts - try new compact JSON format first
					const attempts: QuestionAttempt[] = [];
					const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
					
					if (quizAttemptsLine) {
						// New format: JSON array
						try {
							const jsonMatch = quizAttemptsLine.match(/quiz_attempts:\s*(.+)$/);
							if (jsonMatch) {
								const attemptData = JSON.parse(jsonMatch[1]);
								for (const attempt of attemptData) {
									attempts.push({
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
						// Old format: YAML list
						let inAttempts = false;
						let currentAttempt: Partial<QuestionAttempt> = {};
						
						for (const line of fmLines) {
							if (line.trim().startsWith('question_attempts:')) {
								inAttempts = true;
							} else if (inAttempts && line.match(/^\s{2}-\s*$/)) {
								if (currentAttempt.questionHash) {
									attempts.push(currentAttempt as QuestionAttempt);
								}
								currentAttempt = {};
							} else if (inAttempts && line.includes('hash:')) {
								const match = line.match(/hash:\s*["']?([^"'\n]+)["']?/);
								if (match) currentAttempt.questionHash = match[1];
							} else if (inAttempts && line.includes('correct:')) {
								const match = line.match(/correct:\s*(true|false)/);
								if (match) currentAttempt.correct = match[1] === 'true';
							} else if (inAttempts && line.includes('timestamp:')) {
								const match = line.match(/timestamp:\s*["']?([^"'\n]+)["']?/);
								if (match) currentAttempt.timestamp = match[1];
							} else if (inAttempts && !line.startsWith('  ') && line.trim().length > 0 && !line.trim().startsWith('-')) {
								// Left the attempts section
								if (currentAttempt.questionHash) {
									attempts.push(currentAttempt as QuestionAttempt);
								}
								break;
							}
						}
						
						// Add last attempt if exists
						if (currentAttempt.questionHash && inAttempts) {
							attempts.push(currentAttempt as QuestionAttempt);
						}
					}

					// Count wrong answers per question in this quiz
					const wrongCounts = new Map<string, number>();
					for (const attempt of attempts) {
						if (!attempt.correct) {
							const current = wrongCounts.get(attempt.questionHash) || 0;
							wrongCounts.set(attempt.questionHash, current + 1);
							
							// Also update global count
							const globalCount = this.questionWrongCounts.get(attempt.questionHash) || 0;
							this.questionWrongCounts.set(attempt.questionHash, globalCount + 1);
						}
					}

					// Find questions where latest attempt was incorrect
					const latestAttempts = new Map<string, QuestionAttempt>();
					for (const attempt of attempts) {
						const existing = latestAttempts.get(attempt.questionHash);
						if (!existing || attempt.timestamp > existing.timestamp) {
							latestAttempts.set(attempt.questionHash, attempt);
						}
					}

					// Get questions with failed latest attempts
					const missedQuestionHashes = new Set<string>();
					for (const [hash, attempt] of latestAttempts) {
						if (!attempt.correct) {
							missedQuestionHashes.add(hash);
						}
					}

					// Only show quizzes with missed questions
					if (missedQuestionHashes.size > 0) {
						const score = Math.round(((latestAttempts.size - missedQuestionHashes.size) / latestAttempts.size) * 100);
						quizFiles.push({ 
							file, 
							score, 
							missedCount: missedQuestionHashes.size, 
							total: latestAttempts.size,
							missedQuestionHashes,
							wrongAnswerCounts: wrongCounts,
							completedAt
						});
					}
				}
			}
		}

		// Sort by score (lowest first) - will be re-ordered based on dropdown
		quizFiles.sort((a, b) => a.score - b.score);
		this.quizFiles = quizFiles;
	}

	private renderQuizList(): void {
		this.contentEl.empty();

		if (this.quizFiles.length === 0) {
			const emptyMessage = this.contentEl.createDiv("missed-questions-empty-qg");
			emptyMessage.setText("No quizzes with missed questions found. Complete a quiz to see results here.");
			return;
		}

		// Apply ordering
		const orderedFiles = this.applyOrdering([...this.quizFiles]);

		const listContainer = this.contentEl.createDiv("missed-questions-list-qg");
		
		// Create update function reference that will be set later
		let updateButtonState: () => void = () => {};

		// Create items
		for (const quizInfo of orderedFiles) {
			const itemEl = listContainer.createDiv("missed-questions-item-qg");

			// Determine color class based on score
			let colorClass = "score-white-qg";
			if (quizInfo.score < 70) {
				colorClass = "score-red-qg";
			} else if (quizInfo.score < 80) {
				colorClass = "score-orange-qg";
			} else if (quizInfo.score < 90) {
				colorClass = "score-yellow-qg";
			}

			itemEl.addClass(colorClass);

			// Checkbox for selection
			const checkbox = itemEl.createEl("input", {
				type: "checkbox",
				cls: "missed-quiz-checkbox-qg"
			});
			checkbox.checked = this.selectedFiles.has(quizInfo.file);
			const toggleSelection = (checked: boolean) => {
				if (checked) {
					this.selectedFiles.add(quizInfo.file);
				} else {
					this.selectedFiles.delete(quizInfo.file);
				}
				updateButtonState();
			};
			checkbox.addEventListener("change", (e) => {
				toggleSelection((e.target as HTMLInputElement).checked);
			});
			itemEl.addEventListener("click", (e) => {
				// Don't toggle if clicking the checkbox directly
				if ((e.target as HTMLElement).tagName !== "INPUT") {
					checkbox.checked = !checkbox.checked;
					toggleSelection(checkbox.checked);
				}
			});

			const nameEl = itemEl.createDiv("quiz-file-name-qg");
			nameEl.setText(quizInfo.file.basename);

			const infoEl = itemEl.createDiv("quiz-file-info-qg");
			infoEl.setText(`${quizInfo.missedCount} missed • Score: ${quizInfo.score}%`);
		}

		// Add controls at the bottom
		const controlsContainer = this.contentEl.createDiv("missed-questions-controls-qg");
		
		// Order dropdown
		const orderContainer = controlsContainer.createDiv("order-control-container-qg");
		orderContainer.createEl("label", { text: "Order:", cls: "order-label-qg" });
		const orderDropdown = orderContainer.createEl("select", { cls: "order-dropdown-qg" });
		
		const option1 = orderDropdown.createEl("option", { value: "most-failed", text: "Order by most failed" });
		if (this.orderOption === "most-failed") option1.selected = true;
		
		const option2 = orderDropdown.createEl("option", { value: "oldest-newest", text: "Order by oldest to newest" });
		if (this.orderOption === "oldest-newest") option2.selected = true;
		
		const option3 = orderDropdown.createEl("option", { value: "newest-oldest", text: "Order by newest to oldest" });
		if (this.orderOption === "newest-oldest") option3.selected = true;
		
		const option4 = orderDropdown.createEl("option", { value: "random", text: "Order by random" });
		if (this.orderOption === "random") option4.selected = true;
		orderDropdown.addEventListener("change", (e) => {
			this.orderOption = (e.target as HTMLSelectElement).value as OrderOption;
			this.renderQuizList(); // Re-render with new order
		});

		// Generate button
		const generateBtn = controlsContainer.createEl("button", {
			text: "Generate Quiz",
			cls: "mod-cta generate-quiz-btn-qg"
		});
		
		updateButtonState = () => {
			generateBtn.disabled = this.selectedFiles.size === 0;
		};
		updateButtonState();
		
		generateBtn.addEventListener("click", () => {
			const selectedQuizzes = orderedFiles.filter(q => this.selectedFiles.has(q.file));
			if (selectedQuizzes.length > 0) {
				this.generateQuizFromMissed(selectedQuizzes);
			}
		});
	}

	private applyOrdering(files: QuizFileInfo[]): QuizFileInfo[] {
		const ordered = [...files];
		
		switch (this.orderOption) {
			case "most-failed":
				// Sort by total wrong answer count across all questions in the quiz
				ordered.sort((a, b) => {
					const aTotalWrong = Array.from(a.missedQuestionHashes).reduce((sum, hash) => 
						sum + (this.questionWrongCounts.get(hash) || 0), 0
					);
					const bTotalWrong = Array.from(b.missedQuestionHashes).reduce((sum, hash) => 
						sum + (this.questionWrongCounts.get(hash) || 0), 0
					);
					return bTotalWrong - aTotalWrong; // Descending (most failed first)
				});
				break;
			case "oldest-newest":
				ordered.sort((a, b) => {
					const aDate = a.completedAt || a.file.stat.mtime;
					const bDate = b.completedAt || b.file.stat.mtime;
					return new Date(aDate).getTime() - new Date(bDate).getTime();
				});
				break;
			case "newest-oldest":
				ordered.sort((a, b) => {
					const aDate = a.completedAt || a.file.stat.mtime;
					const bDate = b.completedAt || b.file.stat.mtime;
					return new Date(bDate).getTime() - new Date(aDate).getTime();
				});
				break;
			case "random":
				// Fisher-Yates shuffle
				for (let i = ordered.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[ordered[i], ordered[j]] = [ordered[j], ordered[i]];
				}
				break;
		}
		
		return ordered;
	}

	private async generateQuizFromMissed(quizInfos: QuizFileInfo[]): Promise<void> {
		this.close();

		try {
			const allMissedQuestions: Array<{question: Question, hash: string, wrongCount: number}> = [];
			const questionHashToWrongCount = new Map<string, number>();

			// Collect all missed questions from all selected quizzes
			for (const quizInfo of quizInfos) {
				const content = await this.app.vault.read(quizInfo.file);
				const reviewer = new QuizReviewer(this.app, this.settings);
				
				// Use the QuizReviewer's parsing methods
				(reviewer as any).calloutParser(content);
				
				const allQuestions: Question[] = (reviewer as any).quiz;

				// Filter to only include questions that were missed (latest attempt was incorrect)
				for (const question of allQuestions) {
					const questionHash = hashString(JSON.stringify(question));
					if (quizInfo.missedQuestionHashes.has(questionHash)) {
						// Get wrong count (use global count which includes all quizzes)
						const wrongCount = this.questionWrongCounts.get(questionHash) || 0;
						
						// Only add if not already added (deduplicate across quizzes)
						if (!questionHashToWrongCount.has(questionHash)) {
							allMissedQuestions.push({
								question,
								hash: questionHash,
								wrongCount
							});
							questionHashToWrongCount.set(questionHash, wrongCount);
						}
					}
				}
			}

			if (allMissedQuestions.length === 0) {
				new Notice("No missed questions found in selected quizzes");
				return;
			}

			// Apply ordering to questions
			const orderedQuestions = this.orderQuestions(allMissedQuestions);
			const finalQuestions = orderedQuestions.map(item => item.question);

			// Pass wrong counts and order override to quiz modal
			await new QuizModalLogic(this.app, this.settings, finalQuestions, [], undefined, questionHashToWrongCount, this.orderOption, this.plugin).renderQuiz();
		} catch (error) {
			new Notice("Error loading quiz: " + (error as Error).message);
		}
	}

	private orderQuestions(questions: Array<{question: Question, hash: string, wrongCount: number}>): Array<{question: Question, hash: string, wrongCount: number}> {
		const ordered = [...questions];
		
		switch (this.orderOption) {
			case "most-failed":
				// Sort by wrong count (highest first)
				ordered.sort((a, b) => b.wrongCount - a.wrongCount);
				break;
			case "oldest-newest":
				// Keep original order (first encountered)
				break;
			case "newest-oldest":
				// Reverse order
				ordered.reverse();
				break;
			case "random":
				// Fisher-Yates shuffle
				for (let i = ordered.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[ordered[i], ordered[j]] = [ordered[j], ordered[i]];
				}
				break;
		}
		
		return ordered;
	}

	onClose(): void {
		super.onClose();
	}
}

