import { App, Modal, Notice, TFile, getFrontMatterInfo, setIcon } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { QuizResult, Question } from "../../utils/types";
import { StreakData } from "../../services/streakTracker";
import type QuizGenerator from "../../main";
import ReviewModal from "./ReviewModal";
import RecommendationsModal from "./RecommendationsModal";
import GeneratorFactory from "../../generators/generatorFactory";
import {
	isTrueFalse,
	isMultipleChoice,
	isSelectAllThatApply,
	isFillInTheBlank,
	isMatching,
	isShortOrLongAnswer
} from "../../utils/typeGuards";

export default class QuizSummaryModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly results: QuizResult[];
	private readonly elapsedTime: number;
	private readonly streakData: StreakData;
	private readonly correctStreak: number;
	private readonly onCloseCallback: () => void;
	private readonly plugin?: QuizGenerator;
	private readonly failureReason?: string;
	private readonly currentRating: number;
	private readonly existingQuizFile?: TFile;
	private readonly totalQuestions: number;
	private readonly quiz?: Question[];
	private readonly userAnswers?: Map<number, any>;
	private cachedRecommendations: string | null = null;
	private cachedMissedQuestions: Array<{ question: Question; userAnswer: any }> | null = null;

	constructor(
		app: App,
		settings: QuizSettings,
		results: QuizResult[],
		elapsedTime: number,
		streakData: StreakData,
		correctStreak: number,
		onCloseCallback: () => void,
		failureReason?: string,
		plugin?: QuizGenerator,
		existingQuizFile?: TFile,
		quiz?: Question[],
		userAnswers?: Map<number, any>
	) {
		super(app);
		this.settings = settings;
		this.results = results;
		this.elapsedTime = elapsedTime;
		this.streakData = streakData;
		this.correctStreak = correctStreak;
		this.onCloseCallback = onCloseCallback;
		this.failureReason = failureReason;
		this.plugin = plugin;
		this.existingQuizFile = existingQuizFile;
		this.quiz = quiz;
		this.userAnswers = userAnswers;
		
		// Calculate initial star rating based on accuracy (use exact percentage, not rounded)
		const correct = results.filter(r => r.correct).length;
		const total = results.length;
		this.totalQuestions = total;
		const accuracyExact = total > 0 ? (correct / total) * 100 : 0;
		this.currentRating = this.calculateStarRating(accuracyExact);
		
		this.modalEl.addClass("quiz-summary-modal-qg");
	}

	private calculateStarRating(accuracy: number): number {
		// Calculate star rating based on accuracy percentage
		// Supports quarter stars (0.25, 0.5, 0.75) and full stars
		if (accuracy >= 95) return 5;
		if (accuracy >= 90) return 4.75;
		if (accuracy >= 85) return 4.5;
		if (accuracy >= 80) return 4.25;
		if (accuracy >= 75) return 4;
		if (accuracy >= 70) return 3.75;
		if (accuracy >= 65) return 3.5;
		if (accuracy >= 60) return 3.25;
		if (accuracy >= 55) return 3;
		if (accuracy >= 50) return 2.75;
		if (accuracy >= 45) return 2.5;
		if (accuracy >= 40) return 2.25;
		if (accuracy >= 35) return 2;
		if (accuracy >= 30) return 1.75;
		if (accuracy >= 25) return 1.5;
		if (accuracy >= 20) return 1.25;
		if (accuracy >= 15) return 1;
		if (accuracy >= 10) return 0.75;
		if (accuracy >= 5) return 0.5;
		if (accuracy >= 2.5) return 0.25;
		return 0;
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		
		const gamification = this.settings.gamification || {
			enabled: true,
			showStreakCounter: true,
			showDailyStreak: true,
			showTimer: true,
			showTimerDuringQuiz: false,
			showAccuracy: true,
			showReflection: true,
			showStarRating: true,
			enableFlameEffect: true,
		};
		
		// Always show results, even if gamification is disabled
		// Just use minimal gamification defaults for display
		
		const correct = this.results.filter(r => r.correct).length;
		const total = this.results.length;
		// Use exact accuracy for star rating calculation, but round for display
		const accuracyExact = total > 0 ? (correct / total) * 100 : 0;
		const accuracy = Math.round(accuracyExact);
		
		// Format time
		const formatTime = (seconds: number): string => {
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		};
		
		// Create summary card
		const card = this.contentEl.createDiv("quiz-summary-card-qg");
		
		// Title
		if (this.failureReason) {
			// Add failure-specific styling class
			card.addClass("quiz-failure-card-qg");
			
			// Create header container with icon
			const failureHeader = card.createDiv("quiz-failure-header-qg");
			const iconContainer = failureHeader.createDiv("quiz-failure-icon-qg");
			setIcon(iconContainer, "x-circle");
			
			const titleContainer = failureHeader.createDiv("quiz-failure-title-container-qg");
			titleContainer.createEl("h2", { text: "Quiz Failed", cls: "quiz-failure-title-qg" });
			
			// Create failure reason container with better styling
			const failureReasonDiv = card.createDiv("quiz-failure-reason-qg");
			
			// Reason label
			const reasonLabel = failureReasonDiv.createDiv("quiz-failure-reason-label-qg");
			reasonLabel.createSpan({ text: "Reason" });
			
			// Reason value
			const reasonValue = failureReasonDiv.createDiv("quiz-failure-reason-value-qg");
			reasonValue.textContent = this.failureReason;
			
			// Explanation section
			const explanationDiv = card.createDiv("quiz-failure-explanation-qg");
			const explanationIcon = explanationDiv.createSpan("quiz-failure-explanation-icon-qg");
			setIcon(explanationIcon, "info");
			const explanationText = explanationDiv.createSpan("quiz-failure-explanation-text-qg");
			explanationText.textContent = "No cheating mode is enabled in settings. ";
			
			// Add link to settings
			if (this.plugin) {
				const settingsLink = explanationDiv.createEl("a", {
					text: "Open settings to manage this.",
					href: "#",
					cls: "quiz-failure-settings-link-qg"
				});
				settingsLink.addEventListener("click", (e) => {
					e.preventDefault();
					this.close();
					// Open plugin settings
					(this.app as any).setting.open();
					(this.app as any).setting.openTabById("obsidian-quiz-generator");
				});
			} else {
				const settingsText = explanationDiv.createSpan("quiz-failure-settings-text-qg");
				settingsText.textContent = "Go to plugin settings → Gamification → Advanced to disable 'No cheating mode'.";
			}
		} else {
			card.createEl("h2", { text: "Quiz Complete! 🎉" });
		}
		
		// Star Rating (automatic, based on accuracy)
		const passedQuiz = accuracy >= 70;

		if (gamification.showStarRating) {
			const ratingContainer = card.createDiv("summary-rating-container-qg");
			ratingContainer.createEl("div", { text: "Performance Rating:", cls: "summary-label-qg" });
			const starContainer = ratingContainer.createDiv("star-rating-qg");
			// Recalculate rating using exact accuracy for display
			const accuracyForRating = total > 0 ? (correct / total) * 100 : 0;
			const rating = this.calculateStarRating(accuracyForRating);
			this.renderStars(starContainer, rating);
		}
		
		// Stats grid
		const statsGrid = card.createDiv("summary-stats-grid-qg");
		
		if (gamification.showAccuracy) {
			const statCard = statsGrid.createDiv("summary-stat-card-qg");
			statCard.createEl("div", { text: `${accuracy}%`, cls: "stat-value-qg" });
			statCard.createEl("div", { text: "Accuracy", cls: "stat-label-qg" });
		}
		
		if (gamification.showDailyStreak) {
			const statCard = statsGrid.createDiv("summary-stat-card-qg");
			statCard.createEl("div", { text: `${this.streakData.dailyStreak}`, cls: "stat-value-qg" });
			statCard.createEl("div", { text: "Day Streak", cls: "stat-label-qg" });
		}
		
		if (gamification.showStreakCounter && this.correctStreak > 0) {
			const statCard = statsGrid.createDiv("summary-stat-card-qg");
			statCard.createEl("div", { text: `${this.correctStreak}`, cls: "stat-value-qg" });
			statCard.createEl("div", { text: "Correct Streak", cls: "stat-label-qg" });
		}
		
		if (gamification.showTimer) {
			const statCard = statsGrid.createDiv("summary-stat-card-qg");
			statCard.createEl("div", { text: formatTime(this.elapsedTime), cls: "stat-value-qg" });
			statCard.createEl("div", { text: "Time", cls: "stat-label-qg" });
		}
		
		// Score breakdown
		const scoreBreakdown = card.createDiv("summary-score-breakdown-qg");
		scoreBreakdown.createEl("div", { text: `${correct} / ${total} correct`, cls: "score-text-qg" });
		
		// More details section (collapsible)
		await this.renderMoreDetails(card, gamification, formatTime, correct, total);
		
		// Share button - positioned in corner as secondary action
		const shareButton = card.createEl("button", {
			cls: "mod-secondary share-results-btn-qg"
		});
		const shareIcon = shareButton.createSpan({ cls: "share-icon-qg" });
		setIcon(shareIcon, "share-2");
		shareButton.createSpan({ text: "Share" });
		
		shareButton.addEventListener("click", () => {
			this.shareResults(card, gamification, accuracy, formatTime(this.elapsedTime));
		});
		
		// Button container with spacing
		const buttonContainer = card.createDiv("summary-buttons-container-qg");
		
		// Review button (if quiz and userAnswers are available) - primary action
		if (this.quiz && this.userAnswers) {
			const reviewButton = buttonContainer.createEl("button", {
				cls: "mod-cta review-button-qg summary-action-button-qg"
			});
			const reviewIcon = reviewButton.createSpan({ cls: "review-icon-qg" });
			setIcon(reviewIcon, "eye");
			reviewButton.createSpan({ text: "Review" });
			
			reviewButton.addEventListener("click", () => {
				const reviewModal = new ReviewModal(
					this.app,
					this.settings,
					this.quiz!,
					this.results,
					this.userAnswers!
				);
				reviewModal.open();
			});

			// Recommendations button - show only when quiz was failed normally (no failure reason)
			if (!passedQuiz && !this.failureReason) {
				const recommendationsButton = buttonContainer.createEl("button", {
					cls: "mod-secondary recommendations-button-qg summary-action-button-qg"
				});
				const recommendationsIcon = recommendationsButton.createSpan({ cls: "recommendations-icon-qg" });
				setIcon(recommendationsIcon, "brain");
				recommendationsButton.createSpan({ text: "Recommendations" });
				
				recommendationsButton.addEventListener("click", async () => {
					await this.generateAndShowRecommendations();
				});
			}
		}
		
		// Reflection prompt if wrong answers
		if (gamification.showReflection && correct < total) {
			setTimeout(() => {
				this.showReflectionPrompt(correct < total);
			}, 1000);
		}
	}

	private renderStars(container: HTMLElement, rating: number): void {
		// Render stars based on rating (supports quarter, half, three-quarter, and full stars)
		// Rating is automatic based on accuracy, not interactive
		for (let i = 0; i < 5; i++) {
			const star = container.createSpan("star-rating-star-qg");
			star.style.cursor = "default"; // Not interactive
			
			const starValue = i + 1;
			const remainder = rating - i;
			
			if (remainder >= 1) {
				// Full star
				star.textContent = "⭐";
				star.addClass("full");
			} else if (remainder >= 0.75) {
				// Three-quarter star
				star.textContent = "⭐";
				star.addClass("three-quarter");
			} else if (remainder >= 0.5) {
				// Half star
				star.textContent = "⭐";
				star.addClass("half");
			} else if (remainder >= 0.25) {
				// Quarter star
				star.textContent = "⭐";
				star.addClass("quarter");
			} else {
				// Empty star
				star.textContent = "☆";
				star.addClass("empty");
			}
		}
	}

	private showReflectionPrompt(hasWrong: boolean): void {
		if (!hasWrong) return;
		
		const reflection = prompt("What tripped you up the most in this quiz? (Optional)");
		// Could save this reflection somewhere if needed
	}

	private async shareResults(card: HTMLElement, gamification: any, accuracy: number, time: string): Promise<void> {
		const correct = this.results.filter(r => r.correct).length;
		const total = this.results.length;
		
		// Build share text
		let shareText = "📊 Quiz Results\n\n";
		shareText += `Accuracy: ${accuracy}%\n`;
		shareText += `Score: ${correct}/${total}\n`;
		if (gamification.showDailyStreak) {
			shareText += `Daily Streak: ${this.streakData.dailyStreak} days\n`;
		}
		if (gamification.showStreakCounter && this.correctStreak > 0) {
			shareText += `Correct Streak: ${this.correctStreak}\n`;
		}
		if (gamification.showTimer) {
			shareText += `Time: ${time}\n`;
		}
		shareText += `Rating: ${this.currentRating.toFixed(1)}/5 ⭐\n`;
		
		// Try to generate and share an image first
		try {
			const imageBlob = await this.generateShareImage(card, gamification, accuracy, time);
			
			// Use Web Share API if available (native share sheet)
			if (navigator.share && navigator.canShare) {
				const shareData: ShareData = {
					title: "Quiz Results",
					text: shareText,
					files: imageBlob ? [new File([imageBlob], "quiz-results.png", { type: "image/png" })] : undefined
				};
				
				if (navigator.canShare(shareData)) {
					await navigator.share(shareData);
					new Notice("Results shared! 📤");
					return;
				}
			}
			
			// Fallback: if we have an image, try to download it
			if (imageBlob) {
				const url = URL.createObjectURL(imageBlob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "quiz-results.png";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				new Notice("Results image saved! 📸");
				return;
			}
		} catch (error) {
			console.error("Error generating share image:", error);
		}
		
		// Fallback: copy text to clipboard
		try {
			await navigator.clipboard.writeText(shareText);
			new Notice("Results copied to clipboard! 📋");
		} catch (error) {
			console.error("Error copying to clipboard:", error);
			new Notice("Unable to share results");
		}
	}
	
	private async generateShareImage(card: HTMLElement, gamification: any, accuracy: number, time: string): Promise<Blob | null> {
		try {
			// Use html2canvas or similar to capture the card
			// For now, we'll return null and use text sharing
			// In the future, this could use html2canvas library
			return null;
		} catch (error) {
			console.error("Error generating share image:", error);
			return null;
		}
	}

	private async renderMoreDetails(card: HTMLElement, gamification: any, formatTime: (seconds: number) => string, correct: number, total: number): Promise<void> {
		const detailsContainer = card.createDiv("quiz-more-details-container-qg");
		
		// Toggle button
		const toggleButton = detailsContainer.createDiv("quiz-more-details-toggle-qg");
		const isExpanded = this.settings.moreDetailsExpanded ?? true;
		const icon = toggleButton.createSpan("quiz-details-icon-qg");
		setIcon(icon, isExpanded ? "chevron-down" : "chevron-right");
		toggleButton.createSpan({ text: "More details", cls: "quiz-details-label-qg" });
		
		// Content area
		const contentArea = detailsContainer.createDiv("quiz-more-details-content-qg");
		contentArea.style.display = isExpanded ? "block" : "none";
		
		// Toggle handler
		toggleButton.style.cursor = "pointer";
		toggleButton.addEventListener("click", async () => {
			const isCurrentlyExpanded = contentArea.style.display !== "none";
			contentArea.style.display = isCurrentlyExpanded ? "none" : "block";
			setIcon(icon, isCurrentlyExpanded ? "chevron-right" : "chevron-down");
			
			// Save state to settings
			if (this.plugin) {
				this.plugin.settings.moreDetailsExpanded = !isCurrentlyExpanded;
				await this.plugin.saveSettings();
			}
		});
		
		// Load and display stats
		const stats = await this.loadQuizStats();
		this.renderQuizStats(contentArea, stats, gamification, formatTime, correct, total);
	}
	
	private async loadQuizStats(): Promise<QuizStats> {
		const stats: QuizStats = {
			totalQuestions: this.totalQuestions,
			timesTaken: 0,
			legendViewed: false,
			hintsEnabled: this.settings.hintsEnabled,
			maxHints: this.settings.gamification?.maxHintsPerQuiz ?? null,
			bestScore: 0,
			averageScore: 0,
			improvement: null,
			fastestTime: null,
			averageTime: null,
			totalAttempts: 0,
			perfectScores: 0,
			lastTaken: null
		};
		
		if (!this.existingQuizFile) return stats;
		
		try {
			const content = await this.app.vault.read(this.existingQuizFile);
			const frontmatterInfo = getFrontMatterInfo(content);
			
			if (frontmatterInfo.exists) {
				const fmLines = frontmatterInfo.frontmatter.split('\n');
				
				// Check legend viewed
				stats.legendViewed = fmLines.some(line => 
					line.trim().startsWith('quiz_legend_viewed:') && 
					line.trim().includes('true')
				);
				
				// Parse quiz attempts
				const quizAttemptsLine = fmLines.find(line => line.trim().startsWith('quiz_attempts:'));
				if (quizAttemptsLine) {
					try {
						const jsonMatch = quizAttemptsLine.match(/quiz_attempts:\s*(.+)$/);
						if (jsonMatch) {
							const attemptData = JSON.parse(jsonMatch[1]);
							stats.totalAttempts = attemptData.length;
							
							// Group attempts by timestamp to count unique sessions
							const sessionTimestamps = new Set<string>();
							const sessionScores: number[] = [];
							const sessionTimes: number[] = [];
							
							attemptData.forEach((attempt: any) => {
								if (attempt.t) {
									sessionTimestamps.add(attempt.t);
								}
							});
							
							stats.timesTaken = sessionTimestamps.size;
							
							// Calculate scores from attempts
							const scoresBySession = new Map<string, { correct: number; total: number }>();
							attemptData.forEach((attempt: any) => {
								if (!attempt.t) return;
								if (!scoresBySession.has(attempt.t)) {
									scoresBySession.set(attempt.t, { correct: 0, total: 0 });
								}
								const session = scoresBySession.get(attempt.t)!;
								session.total++;
								if (attempt.c) session.correct++;
							});
							
							scoresBySession.forEach((session, timestamp) => {
								const score = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;
								sessionScores.push(score);
								if (score === 100) stats.perfectScores++;
								if (timestamp) {
									const date = new Date(timestamp);
									if (!stats.lastTaken || date > new Date(stats.lastTaken)) {
										stats.lastTaken = timestamp;
									}
								}
							});
							
							if (sessionScores.length > 0) {
								stats.bestScore = Math.max(...sessionScores);
								stats.averageScore = Math.round(
									sessionScores.reduce((sum, score) => sum + score, 0) / sessionScores.length
								);
								
								// Calculate improvement (compare last 2 sessions if available)
								if (sessionScores.length >= 2) {
									const recentScores = sessionScores.slice(-2);
									const improvement = recentScores[1] - recentScores[0];
									stats.improvement = improvement;
								}
							}
							
							// Get time from quiz_completed timestamps
							const completedLines = fmLines.filter(line => line.trim().startsWith('quiz_completed:'));
							if (completedLines.length > 0 && sessionTimes.length === 0) {
								// We don't have time data in frontmatter, so we'll skip time stats
							}
						}
					} catch (error) {
						console.error("Error parsing quiz attempts:", error);
					}
				}
			}
		} catch (error) {
			console.error("Error loading quiz stats:", error);
		}
		
		return stats;
	}
	
	private createDetailItem(container: HTMLElement, iconName: string, label: string, value: string, extraClasses: string = "", dataAttributes: Record<string, string> = {}): void {
		const item = container.createDiv({ cls: `quiz-detail-item-qg ${extraClasses}`, attr: dataAttributes });
		
		const iconSpan = item.createSpan({ cls: 'quiz-detail-icon-qg' });
		setIcon(iconSpan, iconName);
		
		const content = item.createDiv({ cls: 'quiz-detail-content-qg' });
		const labelSpan = content.createSpan({ cls: 'quiz-detail-label-qg', text: label });
		const valueSpan = content.createSpan({ cls: 'quiz-detail-value-qg', text: value });
	}

	private renderQuizStats(container: HTMLElement, stats: QuizStats, gamification: any, formatTime: (seconds: number) => string, currentCorrect: number, currentTotal: number): void {
		const statsGrid = container.createDiv("quiz-details-stats-grid-qg");
		
		// Left column: Quiz Information
		const leftColumn = statsGrid.createDiv("quiz-details-column-qg");
		const basicInfo = leftColumn.createDiv("quiz-details-section-qg");
		basicInfo.createEl("h3", { text: "Quiz Information", cls: "quiz-details-section-title-qg" });
		
		const basicList = basicInfo.createDiv("quiz-details-list-qg");
		
		this.createDetailItem(basicList, "repeat", "Taken", `${stats.timesTaken} time${stats.timesTaken !== 1 ? 's' : ''}`);
		
		const legendIcon = stats.legendViewed ? "check-circle-2" : "x-circle";
		const legendColor = stats.legendViewed ? "true" : "false";
		this.createDetailItem(
			basicList, 
			legendIcon, 
			"Legend/key", 
			stats.legendViewed ? "Viewed" : "Not viewed",
			"",
			{ "data-viewed": legendColor }
		);
		
		const hintsIcon = stats.hintsEnabled ? "lightbulb" : "lightbulb-off";
		const hintsText = stats.hintsEnabled 
			? `${stats.maxHints !== null ? `max: ${stats.maxHints}` : 'unlimited'}` 
			: "Disabled";
		this.createDetailItem(
			basicList,
			hintsIcon,
			"Hints",
			hintsText,
			"",
			{ "data-enabled": stats.hintsEnabled ? "true" : "false" }
		);
		
		// Right column: Performance stats
		if (stats.totalAttempts > 0) {
			const rightColumn = statsGrid.createDiv("quiz-details-column-qg");
			const performanceSection = rightColumn.createDiv("quiz-details-section-qg");
			performanceSection.createEl("h3", { text: "Performance", cls: "quiz-details-section-title-qg" });
			
			const perfList = performanceSection.createDiv("quiz-details-list-qg");
			
			this.createDetailItem(perfList, "trophy", "Best", `${stats.bestScore}%`, "quiz-stat-highlight-qg");
			
			if (stats.timesTaken > 1) {
				this.createDetailItem(perfList, "bar-chart-2", "Average", `${stats.averageScore}%`);
				
				if (stats.improvement !== null) {
					const improvementIcon = stats.improvement > 0 ? "trending-up" : stats.improvement < 0 ? "trending-down" : "minus";
					const improvementText = stats.improvement > 0 
						? `+${stats.improvement}%` 
						: stats.improvement < 0 
						? `${stats.improvement}%` 
						: "No change";
					this.createDetailItem(
						perfList,
						improvementIcon,
						"Change",
						improvementText,
						stats.improvement > 0 ? 'quiz-stat-positive-qg' : stats.improvement < 0 ? 'quiz-stat-negative-qg' : ''
					);
				}
			}
			
			this.createDetailItem(perfList, "star", "Perfect scores", `${stats.perfectScores}`);
			
			if (stats.lastTaken) {
				const lastDate = new Date(stats.lastTaken);
				const formattedDate = lastDate.toLocaleDateString() + ' ' + lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
				this.createDetailItem(perfList, "clock", "Last taken", formattedDate);
			}
		}
		
		// Current session stats (if applicable)
		const currentScore = currentTotal > 0 ? Math.round((currentCorrect / currentTotal) * 100) : 0;
		if (stats.totalAttempts > 0 && currentScore > 0) {
			const rightColumn = statsGrid.querySelector(".quiz-details-column-qg:last-child") || statsGrid.createDiv("quiz-details-column-qg");
			const currentSection = rightColumn.createDiv("quiz-details-section-qg");
			currentSection.createEl("h3", { text: "This Session", cls: "quiz-details-section-title-qg" });
			
			const currentList = currentSection.createDiv("quiz-details-list-qg");
			
			if (currentScore > stats.bestScore) {
				this.createDetailItem(currentList, "sparkles", "New best", `${currentScore}%`, "quiz-stat-new-record-qg");
			} else if (currentScore === stats.bestScore) {
				this.createDetailItem(currentList, "star", "Tied best", `${currentScore}%`, "quiz-stat-match-qg");
			} else {
				const diff = stats.bestScore - currentScore;
				this.createDetailItem(currentList, "target", "Current", `${currentScore}% (${diff}% from best)`);
			}
		}
	}

	private async generateAndShowRecommendations(): Promise<void> {
		if (!this.quiz || !this.userAnswers) return;

		if (this.cachedRecommendations && this.cachedMissedQuestions) {
			const cachedModal = new RecommendationsModal(
				this.app,
				this.settings,
				this.plugin,
				this.cachedRecommendations,
				this.cachedMissedQuestions
			);
			cachedModal.open();
			return;
		}

		// Collect incorrect questions
		const incorrectQuestions: Array<{question: string, userAnswer: any, correctAnswer: any, questionType: string}> = [];
		const missedQuestionDetails: Array<{ question: Question; userAnswer: any }> = [];
		
		this.results.forEach(result => {
			if (!result.correct) {
				const question = this.quiz![result.questionIndex];
				const userAnswer = this.userAnswers!.get(result.questionIndex);
				
				// Determine question type
				let questionType = "unknown";
				if (isTrueFalse(question)) questionType = "True/False";
				else if (isMultipleChoice(question)) questionType = "Multiple Choice";
				else if (isSelectAllThatApply(question)) questionType = "Select All That Apply";
				else if (isFillInTheBlank(question)) questionType = "Fill in the Blank";
				else if (isMatching(question)) questionType = "Matching";
				else if (isShortOrLongAnswer(question)) questionType = "Short Answer";
				else questionType = "Long Answer";
				
				incorrectQuestions.push({
					question: question.question,
					userAnswer: userAnswer,
					correctAnswer: question.answer,
					questionType: questionType
				});

				missedQuestionDetails.push({
					question,
					userAnswer
				});
			}
		});

		if (incorrectQuestions.length === 0) {
			new Notice("No incorrect questions found. Great job!");
			return;
		}

		// Show loading notice
		const loadingNotice = new Notice("Generating recommendations...", 0);

		try {
			// Generate recommendations using the configured AI model
			const generator = GeneratorFactory.createInstance(this.settings);
			const recommendations = await generator.generateRecommendations(incorrectQuestions);

			loadingNotice.hide();

			if (!recommendations) {
				new Notice("Failed to generate recommendations. Please try again.");
				return;
			}

			this.cachedRecommendations = recommendations;
			this.cachedMissedQuestions = missedQuestionDetails;

			// Show recommendations modal
			const recommendationsModal = new RecommendationsModal(
				this.app,
				this.settings,
				this.plugin,
				recommendations,
				missedQuestionDetails
			);
			recommendationsModal.open();
		} catch (error) {
			loadingNotice.hide();
			console.error("Error generating recommendations:", error);
			new Notice("Error generating recommendations. Please try again.");
		}
	}
	
	onClose(): void {
		this.contentEl.empty();
		this.onCloseCallback();
		super.onClose();
	}
}

interface QuizStats {
	totalQuestions: number;
	timesTaken: number;
	legendViewed: boolean;
	hintsEnabled: boolean;
	maxHints: number | null;
	bestScore: number;
	averageScore: number;
	improvement: number | null;
	fastestTime: number | null;
	averageTime: number | null;
	totalAttempts: number;
	perfectScores: number;
	lastTaken: string | null;
}

