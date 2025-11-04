export type Question = TrueFalse | MultipleChoice | SelectAllThatApply | FillInTheBlank | Matching | ShortOrLongAnswer;

export interface Quiz {
	questions: Question[];
}

export interface TrueFalse {
	question: string;
	answer: boolean;
}

export interface MultipleChoice {
	question: string;
	options: string[];
	answer: number;
}

export interface SelectAllThatApply {
	question: string;
	options: string[];
	answer: number[];
}

export interface FillInTheBlank {
	question: string;
	answer: string[];
}

export interface Matching {
	question: string;
	answer: {
		leftOption: string;
		rightOption: string;
	}[];
}

export interface ShortOrLongAnswer {
	question: string;
	answer: string;
}

export interface QuizResult {
	questionIndex: number;
	correct: boolean;
}

export interface QuestionAttempt {
	questionHash: string;
	correct: boolean;
	timestamp: string;
}

export interface QuizStatistics {
	totalQuestions: number;
	correctAnswers: number;
	incorrectAnswers: number;
	score: number; // percentage
	completedAt?: string; // ISO timestamp
	questionAttempts?: QuestionAttempt[];
}
