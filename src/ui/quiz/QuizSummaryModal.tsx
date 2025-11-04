import { App, Modal, Notice } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { QuizResult } from "../../utils/types";
import { StreakData } from "../../services/streakTracker";

export default class QuizSummaryModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly results: QuizResult[];
	private readonly elapsedTime: number;
	private readonly streakData: StreakData;
	private readonly correctStreak: number;
	private readonly onCloseCallback: () => void;
	private currentRating: number = 0;

	constructor(
		app: App,
		settings: QuizSettings,
		results: QuizResult[],
		elapsedTime: number,
		streakData: StreakData,
		correctStreak: number,
		onCloseCallback: () => void
	) {
		super(app);
		this.settings = settings;
		this.results = results;
		this.elapsedTime = elapsedTime;
		this.streakData = streakData;
		this.correctStreak = correctStreak;
		this.onCloseCallback = onCloseCallback;
		
		// Calculate initial star rating based on accuracy
		const correct = results.filter(r => r.correct).length;
		const total = results.length;
		const accuracy = total > 0 ? (correct / total) * 100 : 0;
		this.currentRating = this.calculateStarRating(accuracy);
		
		this.modalEl.addClass("quiz-summary-modal-qg");
	}

	private calculateStarRating(accuracy: number): number {
		if (accuracy >= 95) return 5;
		if (accuracy >= 85) return 4.5;
		if (accuracy >= 75) return 4;
		if (accuracy >= 65) return 3.5;
		if (accuracy >= 55) return 3;
		if (accuracy >= 45) return 2.5;
		if (accuracy >= 35) return 2;
		if (accuracy >= 25) return 1.5;
		if (accuracy >= 15) return 1;
		if (accuracy >= 5) return 0.5;
		return 0;
	}

	onOpen(): void {
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
		const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
		
		// Format time
		const formatTime = (seconds: number): string => {
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		};
		
		// Create summary card
		const card = this.contentEl.createDiv("quiz-summary-card-qg");
		
		// Title
		card.createEl("h2", { text: "Quiz Complete! 🎉" });
		
		// Star Rating
		if (gamification.showStarRating) {
			const ratingContainer = card.createDiv("summary-rating-container-qg");
			ratingContainer.createEl("div", { text: "Your Performance:", cls: "summary-label-qg" });
			const starContainer = ratingContainer.createDiv("star-rating-qg");
			
			const fullStars = Math.floor(this.currentRating);
			const hasHalfStar = this.currentRating % 1 >= 0.5;
			
			for (let i = 0; i < 5; i++) {
				const star = starContainer.createSpan("star-rating-star-qg");
				star.style.cursor = "pointer";
				
				if (i < fullStars) {
					star.textContent = "⭐";
					star.addClass("full");
				} else if (i === fullStars && hasHalfStar) {
					star.textContent = "⭐";
					star.addClass("half");
				} else {
					star.textContent = "☆";
					star.addClass("empty");
				}
				
			star.addEventListener("click", (e) => {
				// Check if clicking on the right half for half-star selection
				const rect = star.getBoundingClientRect();
				const clickX = e.clientX - rect.left;
				const isRightHalf = clickX > rect.width / 2;
				
				let newRating: number;
				if (i < fullStars) {
					// Clicking on full star - set to that position or half
					newRating = isRightHalf ? i + 1 : i + 0.5;
				} else if (i === fullStars && hasHalfStar) {
					// Clicking on half star
					newRating = isRightHalf ? i + 1 : i + 0.5;
				} else {
					// Clicking on empty star
					newRating = isRightHalf ? i + 1 : i + 0.5;
				}
				
				this.currentRating = Math.min(5, Math.max(0, newRating));
				starContainer.empty();
				this.renderStars(starContainer, this.currentRating);
			});
			}
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
		
		// Share button
		const shareButton = card.createEl("button", {
			text: "📸 Share Results",
			cls: "mod-cta share-results-btn-qg"
		});
		
		shareButton.addEventListener("click", () => {
			this.shareResults(card, gamification, accuracy, formatTime(this.elapsedTime));
		});
		
		// Reflection prompt if wrong answers
		if (gamification.showReflection && correct < total) {
			setTimeout(() => {
				this.showReflectionPrompt(correct < total);
			}, 1000);
		}
		
		// Close button
		const closeButton = card.createEl("button", {
			text: "Close",
			cls: "mod-secondary"
		});
		
		closeButton.addEventListener("click", () => {
			this.close();
		});
	}

	private renderStars(container: HTMLElement, rating: number): void {
		const fullStars = Math.floor(rating);
		const hasHalfStar = rating % 1 >= 0.5;
		
		for (let i = 0; i < 5; i++) {
			const star = container.createSpan("star-rating-star-qg");
			star.style.cursor = "pointer";
			
			if (i < fullStars) {
				star.textContent = "⭐";
				star.addClass("full");
			} else if (i === fullStars && hasHalfStar) {
				star.textContent = "⭐";
				star.addClass("half");
			} else {
				star.textContent = "☆";
				star.addClass("empty");
			}
			
			star.addEventListener("click", (e) => {
				const rect = star.getBoundingClientRect();
				const clickX = e.clientX - rect.left;
				const isRightHalf = clickX > rect.width / 2;
				
				let newRating: number;
				if (i < fullStars) {
					newRating = isRightHalf ? i + 1 : i + 0.5;
				} else if (i === fullStars && hasHalfStar) {
					newRating = isRightHalf ? i + 1 : i + 0.5;
				} else {
					newRating = isRightHalf ? i + 1 : i + 0.5;
				}
				
				this.currentRating = Math.min(5, Math.max(0, newRating));
				container.empty();
				this.renderStars(container, this.currentRating);
			});
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

	onClose(): void {
		this.contentEl.empty();
		this.onCloseCallback();
		super.onClose();
	}
}

