import { App } from "obsidian";

export interface StreakData {
	dailyStreak: number;
	lastQuizDate: string; // ISO date string (YYYY-MM-DD)
	todayAccuracy: number; // 0-100
	todayTotal: number;
	todayCorrect: number;
}

export default class StreakTracker {
	private readonly app: App;
	private readonly storageKey = "quiz-gamification-streaks";

	constructor(app: App) {
		this.app = app;
	}

	public getStreakData(): StreakData {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (!stored) {
				return {
					dailyStreak: 0,
					lastQuizDate: "",
					todayAccuracy: 0,
					todayTotal: 0,
					todayCorrect: 0,
				};
			}
			return JSON.parse(stored);
		} catch {
			return {
				dailyStreak: 0,
				lastQuizDate: "",
				todayAccuracy: 0,
				todayTotal: 0,
				todayCorrect: 0,
			};
		}
	}

	public updateStreak(totalQuestions: number, correctAnswers: number): StreakData {
		const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		const data = this.getStreakData();
		
		// Check if this is a new day
		if (data.lastQuizDate !== today) {
			// Check if streak should continue (yesterday was quizzed)
			const yesterday = new Date();
			yesterday.setDate(yesterday.getDate() - 1);
			const yesterdayStr = yesterday.toISOString().split('T')[0];
			
			if (data.lastQuizDate === yesterdayStr) {
				// Continue streak
				data.dailyStreak += 1;
			} else if (data.lastQuizDate && data.lastQuizDate !== yesterdayStr) {
				// Streak broken
				data.dailyStreak = 1;
			} else {
				// First time or first time today
				data.dailyStreak = data.dailyStreak === 0 ? 1 : data.dailyStreak + 1;
			}
			
			// Reset today's stats for new day
			data.todayTotal = 0;
			data.todayCorrect = 0;
		}
		
		// Update today's stats
		data.todayTotal += totalQuestions;
		data.todayCorrect += correctAnswers;
		data.todayAccuracy = data.todayTotal > 0 
			? Math.round((data.todayCorrect / data.todayTotal) * 100) 
			: 0;
		data.lastQuizDate = today;
		
		// Save
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(data));
		} catch (err) {
			console.error("Failed to save streak data:", err);
		}
		
		return data;
	}

	public getCurrentCorrectStreak(results: boolean[]): number {
		// Count consecutive correct answers from the end
		let streak = 0;
		for (let i = results.length - 1; i >= 0; i--) {
			if (results[i]) {
				streak++;
			} else {
				break;
			}
		}
		return streak;
	}
}

