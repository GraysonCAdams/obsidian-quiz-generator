import { App, Notice, TFile, TFolder, getFrontMatterInfo } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { QuizSettings } from "../../settings/config";
import { Question, QuizResult, QuestionAttempt } from "../../utils/types";
import QuizSaver from "../../services/quizSaver";
import QuizModalWrapper from "./QuizModalWrapper";
import { shuffleArray, hashString } from "../../utils/helpers";
import type QuizGenerator from "../../main";
import ElevenLabsService from "../../services/elevenLabsService";
import AudioProgressModal from "../progress/audioProgressModal";
import AudioCache from "../../services/audioCache";
import CreditCheckLoadingModal from "./CreditCheckLoadingModal";

type OrderOption = "most-failed" | "oldest-newest" | "newest-oldest" | "random";

export default class QuizModalLogic {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly quiz: Question[];
	private readonly quizSources: TFile[];
	private readonly quizSaver: QuizSaver;
	private container: HTMLDivElement | undefined;
	private root: Root | undefined;
	private readonly handleEscapePressed: (event: KeyboardEvent) => void;
	private readonly existingQuizFile?: TFile;
	private readonly questionWrongCounts?: Map<string, number>;
	private readonly orderOverride?: OrderOption;
	private readonly plugin?: QuizGenerator;

	constructor(app: App, settings: QuizSettings, quiz: Question[], quizSources: TFile[], existingQuizFile?: TFile, questionWrongCounts?: Map<string, number>, orderOverride?: OrderOption, plugin?: QuizGenerator) {
		this.app = app;
		this.settings = settings;
		this.quiz = quiz;
		this.quizSources = quizSources;
		this.existingQuizFile = existingQuizFile;
		this.questionWrongCounts = questionWrongCounts;
		this.orderOverride = orderOverride;
		this.plugin = plugin;
		this.quizSaver = new QuizSaver(this.app, this.settings, this.quizSources, this.existingQuizFile);
		this.handleEscapePressed = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
				this.removeQuiz();
			}
		};
	}

	public async renderQuiz(): Promise<void> {
		// Check if quiz has been taken before
		const previousAttempts = await this.getPreviousAttempts();
		const hasBeenTaken = previousAttempts.size > 0;

		// Load wrong counts - always load from all quiz files if not provided
		// This ensures wrong counts are shown on all quizzes, including newly generated ones
		let wrongCounts = this.questionWrongCounts;
		if (!wrongCounts) {
			wrongCounts = await this.getWrongCounts();
		}

		// Apply ordering - override takes precedence over plugin settings
		let quiz = [...this.quiz];
		if (this.orderOverride) {
			quiz = this.applyOrdering(quiz);
		} else if (this.settings.randomizeQuestions) {
			quiz = shuffleArray(quiz);
		}

		if (this.settings.autoSave && this.quizSources.length > 0) {
			await this.quizSaver.saveAllQuestions(quiz); // move into QuizModal or QuizModalWrapper?
		}

		// Pre-generate audio if ElevenLabs is enabled - BLOCK until complete
		// This must complete BEFORE rendering the quiz modal
		let audioGenerationCancelled = false;
		if (this.settings.gamification?.elevenLabsEnabled && 
			this.settings.gamification?.elevenLabsApiKey && 
			this.settings.gamification?.elevenLabsVoiceId) {
			const shouldContinue = await this.pregenerateAudioWithProgress(quiz);
			if (!shouldContinue) {
				audioGenerationCancelled = true;
			}
		}

		// Only render quiz if audio generation was not cancelled
		if (!audioGenerationCancelled) {
		this.container = document.body.createDiv();
		this.root = createRoot(this.container);
		this.root.render(QuizModalWrapper({
			app: this.app,
			settings: this.settings,
			quiz: quiz,
			quizSaver: this.quizSaver,
			reviewing: this.quizSources.length === 0,
				hasBeenTaken: hasBeenTaken,
				previousAttempts: previousAttempts,
				questionWrongCounts: wrongCounts,
				plugin: this.plugin,
			handleClose: () => this.removeQuiz(),
				onQuizComplete: async (results: QuizResult[], questionHashes: string[], timestamp: string) => {
					await this.quizSaver.saveQuizResults(results, questionHashes, timestamp);
				},
		}));
		document.body.addEventListener("keydown", this.handleEscapePressed);
		}
	}

	/**
	 * Pre-generate audio for all questions with progress bar
	 * Blocks quiz rendering until audio is ready
	 * Returns true if should continue, false if cancelled
	 */
	private async pregenerateAudioWithProgress(quiz: Question[]): Promise<boolean> {
		const apiKey = this.settings.gamification!.elevenLabsApiKey!;
		const voiceId = this.settings.gamification!.elevenLabsVoiceId!;
		const elevenLabs = new ElevenLabsService(apiKey, voiceId);
		const persistentCache = AudioCache.getInstance();

		// Collect all questions to generate
		const questionsToGenerate: Array<{ text: string; cacheKey: string }> = [];
		quiz.forEach((q, index) => {
			// Replace blank markers with "BLANK" for audio, then clean markdown
			let questionText = q.question.replace(/`_+`/g, ' BLANK ');
			questionText = questionText.replace(/[`*_\[\]()]/g, '').trim();
			if (questionText) {
				const hash = hashString(JSON.stringify(q));
				const cacheKey = `q-${index}-${hash}`;
				questionsToGenerate.push({ text: questionText, cacheKey });
			}
		});

		if (questionsToGenerate.length === 0) {
			return true; // No questions to generate audio for, continue to quiz
		}

		// Check which are already cached
		const cachedKeys = persistentCache.getCachedKeys(questionsToGenerate);
		const cachedCount = cachedKeys.size;

		// If all are cached, skip generation and credit check
		if (cachedCount === questionsToGenerate.length) {
			console.log(`[QuizModalLogic] All ${questionsToGenerate.length} questions already cached, skipping generation`);
			return true; // Continue to quiz
		}

		try {
			// TEMPORARILY DISABLED: Credit check
			// TODO: Re-enable once credit check is fixed
			/*
			// Calculate estimated cost for questions that need generation
			const questionsNeedingGeneration = questionsToGenerate.filter(q => !cachedKeys.has(q.cacheKey));
			const estimatedCost = elevenLabs.calculateCreditCost(
				questionsNeedingGeneration.map(q => q.text).join(' ')
			);
			
			// Show loading modal while checking credits
			const loadingModal = new CreditCheckLoadingModal(this.app);
			loadingModal.open();
			
			let remainingCredits: number | null;
			try {
				remainingCredits = await elevenLabs.getRemainingCredits();
			} finally {
				// Close loading modal regardless of success/failure
				loadingModal.close();
			}

			// Always show credit check modal before generating - this must block
			// Import the modal class first
			const ElevenLabsCreditCheckModal = (await import("./ElevenLabsCreditCheckModal")).default;
			
			return new Promise<boolean>((resolve) => {
				const creditModal = new ElevenLabsCreditCheckModal(
					this.app,
					remainingCredits,
					estimatedCost,
					async () => {
						// Continue - proceed with audio generation
						console.log('[QuizModalLogic] User confirmed - starting audio generation');
						const progressModal = new AudioProgressModal(this.app);
						progressModal.open();
						
						try {
							await this.generateAudioWithProgress(elevenLabs, questionsToGenerate, cachedKeys, progressModal);
							progressModal.complete();
							resolve(true); // Continue to quiz
						} catch (error) {
							console.error('[QuizModalLogic] Error during audio pre-generation:', error);
							progressModal.error(`Error generating audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
							setTimeout(() => {
								progressModal.close();
								resolve(true); // Continue to quiz even if audio generation failed
							}, 2000);
						}
					},
					async () => {
						// Cancel - show prompt to disable audio
						console.log('[QuizModalLogic] User cancelled - showing disable prompt');
						
						// Show a notice with an option to disable
						const shouldDisable = confirm(
							"Audio generation was cancelled.\n\n" +
							"Would you like to disable ElevenLabs audio for future quizzes?\n\n" +
							"You can re-enable it later in plugin settings."
						);
						
						if (shouldDisable && this.plugin) {
							this.plugin.settings.gamification!.elevenLabsEnabled = false;
							await this.plugin.saveSettings();
							new Notice("ElevenLabs audio has been disabled. You can re-enable it in plugin settings.");
						}
						
						resolve(false); // Don't continue to quiz
					},
					async () => {
						// Disable audio
						console.log('[QuizModalLogic] User disabled audio');
						if (this.plugin) {
							this.plugin.settings.gamification!.elevenLabsEnabled = false;
							await this.plugin.saveSettings();
						}
						resolve(true); // Continue to quiz without audio
					}
				);
				creditModal.open();
			});
			*/
			
			// TEMPORARY: Skip credit check and proceed directly to audio generation
			const progressModal = new AudioProgressModal(this.app);
			progressModal.open();
			
			try {
				await this.generateAudioWithProgress(elevenLabs, questionsToGenerate, cachedKeys, progressModal);
				progressModal.complete();
				return true; // Continue to quiz
			} catch (error) {
				console.error('[QuizModalLogic] Error during audio pre-generation:', error);
				progressModal.error(`Error generating audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
				setTimeout(() => {
					progressModal.close();
				}, 2000);
				return true; // Continue to quiz even if audio generation failed
			}
		} catch (error) {
			console.error('[QuizModalLogic] Error during credit check:', error);
			// If credit check fails, still allow quiz to proceed without audio
			new Notice("Unable to check credits. Audio generation skipped. Quiz will continue without audio.");
			return true; // Continue to quiz
		}
	}

	/**
	 * Generate audio for questions not in cache, with progress updates
	 */
	private async generateAudioWithProgress(
		elevenLabs: ElevenLabsService,
		questions: Array<{ text: string; cacheKey: string }>,
		cachedKeys: Set<string>,
		progressModal: AudioProgressModal
	): Promise<void> {
		const questionsToGenerate = questions.filter(q => !cachedKeys.has(q.cacheKey));
		
		if (questionsToGenerate.length === 0) {
			progressModal.updateProgress(questions.length, questions.length, cachedKeys.size);
			return;
		}

		// Initial progress update showing cached count
		progressModal.updateProgress(0, questionsToGenerate.length, cachedKeys.size);

		const generatedAudio = await elevenLabs.pregenerateAudioForQuestions(
			questionsToGenerate,
			(current, total, cached) => {
				progressModal.updateProgress(current, total, cached);
			}
		);

		console.log(`[QuizModalLogic] Audio generation complete: ${generatedAudio.size}/${questionsToGenerate.length} generated`);
	}

	private async getPreviousAttempts(): Promise<Map<string, boolean>> {
		const attempts = new Map<string, boolean>();
		
		if (!this.existingQuizFile) {
			return attempts;
		}

		try {
			const content = await this.app.vault.read(this.existingQuizFile);
			const frontmatterInfo = getFrontMatterInfo(content);

			if (!frontmatterInfo.exists) {
				return attempts;
			}

			const fmLines = frontmatterInfo.frontmatter.split('\n');
			const allAttempts: QuestionAttempt[] = [];

			// Try new compact JSON format first
			const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
			if (quizAttemptsLine) {
				try {
					const jsonMatch = quizAttemptsLine.match(/quiz_attempts:\s*(.+)$/);
					if (jsonMatch) {
						const attemptData = JSON.parse(jsonMatch[1]);
						for (const attempt of attemptData) {
							allAttempts.push({
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

				for (const line of fmLines) {
					if (line.trim().startsWith('question_attempts:')) {
						inAttempts = true;
					} else if (inAttempts && line.match(/^\s{2}-\s*$/)) {
						// Save previous attempt
						if (currentHash) {
							allAttempts.push({
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
							allAttempts.push({
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
					allAttempts.push({
						questionHash: currentHash,
						correct: currentCorrect,
						timestamp: currentTimestamp
					});
				}
			}

			// Get latest attempt for each question
			for (const attempt of allAttempts) {
				const existing = attempts.get(attempt.questionHash);
				if (existing === undefined) {
					attempts.set(attempt.questionHash, attempt.correct);
				} else {
					// Keep only the latest (last in list)
					attempts.set(attempt.questionHash, attempt.correct);
				}
			}

		} catch (error) {
			console.error("Error reading previous attempts:", error);
		}

		return attempts;
	}

	private async getWrongCounts(): Promise<Map<string, number>> {
		const wrongCounts = new Map<string, number>();
		
		// Aggregate wrong counts from ALL quiz files in the save folder
		const saveFolder = this.app.vault.getAbstractFileByPath(this.settings.savePath);
		if (!(saveFolder instanceof TFolder)) {
			return wrongCounts;
		}

		try {
			for (const file of saveFolder.children) {
				if (file instanceof TFile && file.extension === "md") {
					const content = await this.app.vault.read(file);
					const frontmatterInfo = getFrontMatterInfo(content);

					if (!frontmatterInfo.exists) {
						continue;
					}

					const fmLines = frontmatterInfo.frontmatter.split('\n');
					const attempts: QuestionAttempt[] = [];

					// Parse attempts - try new format first
					const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
					if (quizAttemptsLine) {
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
						// Old format - parse YAML
						let inAttempts = false;
						let currentHash = "";
						let currentCorrect = false;
						let currentTimestamp = "";

						for (const line of fmLines) {
							if (line.trim().startsWith('question_attempts:')) {
								inAttempts = true;
							} else if (inAttempts && line.match(/^\s{2}-\s*$/)) {
								if (currentHash) {
									attempts.push({
										questionHash: currentHash,
										correct: currentCorrect,
										timestamp: currentTimestamp
									});
								}
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
								if (currentHash) {
									attempts.push({
										questionHash: currentHash,
										correct: currentCorrect,
										timestamp: currentTimestamp
									});
								}
								break;
							}
						}
						
						if (currentHash && inAttempts) {
							attempts.push({
								questionHash: currentHash,
								correct: currentCorrect,
								timestamp: currentTimestamp
							});
						}
					}

					// Count wrong answers per question across all files
					for (const attempt of attempts) {
						if (!attempt.correct) {
							const current = wrongCounts.get(attempt.questionHash) || 0;
							wrongCounts.set(attempt.questionHash, current + 1);
						}
					}
				}
			}
		} catch (error) {
			console.error("Error reading wrong counts:", error);
		}

		return wrongCounts;
	}

	private applyOrdering(questions: Question[]): Question[] {
		if (!this.orderOverride || !this.questionWrongCounts) {
			return questions;
		}

		const questionData = questions.map(q => ({
			question: q,
			hash: hashString(JSON.stringify(q)),
			wrongCount: this.questionWrongCounts!.get(hashString(JSON.stringify(q))) || 0
		}));

		const ordered = [...questionData];
		
		switch (this.orderOverride) {
			case "most-failed":
				ordered.sort((a, b) => b.wrongCount - a.wrongCount);
				break;
			case "oldest-newest":
				// Keep original order
				break;
			case "newest-oldest":
				ordered.reverse();
				break;
			case "random":
				for (let i = ordered.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[ordered[i], ordered[j]] = [ordered[j], ordered[i]];
				}
				break;
		}
		
		return ordered.map(item => item.question);
	}

	private removeQuiz(): void {
		this.root?.unmount();
		this.container?.remove();
		document.body.removeEventListener("keydown", this.handleEscapePressed);
	}
}
