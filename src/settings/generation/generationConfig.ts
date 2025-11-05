export type QuestionType = "trueFalse" | "multipleChoice" | "selectAllThatApply" | "fillInTheBlank" | "matching" | "shortAnswer" | "longAnswer";

export interface GenerationConfig {
	generateTrueFalse: boolean;
	numberOfTrueFalse: number;
	generateMultipleChoice: boolean;
	numberOfMultipleChoice: number;
	generateSelectAllThatApply: boolean;
	numberOfSelectAllThatApply: number;
	generateFillInTheBlank: boolean;
	numberOfFillInTheBlank: number;
	generateMatching: boolean;
	numberOfMatching: number;
	generateShortAnswer: boolean;
	numberOfShortAnswer: number;
	generateLongAnswer: boolean;
	numberOfLongAnswer: number;
	randomizeQuestionTypeOrder: boolean;
	questionTypeOrder: QuestionType[];
	surpriseMe: boolean;
	// Proportional ratios (stored as decimals, 0-1)
	questionTypeRatios: {
		trueFalse: number;
		multipleChoice: number;
		selectAllThatApply: number;
		fillInTheBlank: number;
		matching: number;
		shortAnswer: number;
		longAnswer: number;
	};
}

export const DEFAULT_GENERATION_SETTINGS: GenerationConfig = {
	generateTrueFalse: true,
	numberOfTrueFalse: 1,
	generateMultipleChoice: true,
	numberOfMultipleChoice: 1,
	generateSelectAllThatApply: true,
	numberOfSelectAllThatApply: 1,
	generateFillInTheBlank: true,
	numberOfFillInTheBlank: 1,
	generateMatching: true,
	numberOfMatching: 1,
	generateShortAnswer: true,
	numberOfShortAnswer: 1,
	generateLongAnswer: true,
	numberOfLongAnswer: 1,
	randomizeQuestionTypeOrder: false,
	questionTypeOrder: ["trueFalse", "multipleChoice", "selectAllThatApply", "fillInTheBlank", "matching", "shortAnswer", "longAnswer"],
	surpriseMe: false,
	questionTypeRatios: {
		trueFalse: 1/7,
		multipleChoice: 1/7,
		selectAllThatApply: 1/7,
		fillInTheBlank: 1/7,
		matching: 1/7,
		shortAnswer: 1/7,
		longAnswer: 1/7,
	},
};
