export const languages: Record<string, string> = {
	English: "English",
	German: "Deutsch",
	Spanish: "Español",
	French: "Français",
	Russian: "Pусский",
	Chinese: "中文",
	Portuguese: "Português",
	Korean: "한국어",
	Japanese: "日本語",
	Arabic: "العربية",
	Danish: "Dansk",
	Norwegian: "Norsk",
	Dutch: "Nederlands",
	Italian: "Italiano",
	Polish: "Polski",
	Hindi: "हिन्दी",
	Vietnamese: "Tiếng Việt",
	Ukrainian: "українська",
	Swedish: "Svenska",
	Persian: "فارسی",
	Greek: "Ελληνικά",
	Indonesian: "Bahasa Indonesia",
};

export interface ConversationStyle {
	id: string;
	name: string;
	description: string;
	prompt: string;
	isCustom: boolean;
}

export interface GamificationConfig {
	enabled: boolean;
	showStreakCounter: boolean;
	showDailyStreak: boolean;
	showTimer: boolean;
	showTimerDuringQuiz: boolean;
	showAccuracy: boolean;
	showReflection: boolean;
	showStarRating: boolean;
	enableFlameEffect: boolean;
	questionTimerEnabled: boolean;
	questionTimerSeconds: number;
	shortAnswerTimerEnabled: boolean;
	shortAnswerTimerSeconds: number;
	longAnswerTimerEnabled: boolean;
	longAnswerTimerSeconds: number;
	elevenLabsEnabled: boolean;
	elevenLabsApiKey: string;
	elevenLabsVoiceId: string;
	soundEffectsEnabled: boolean;
	tickingSoundEnabled: boolean;
	soundVolume: number; // 0-100
	autoProgressEnabled: boolean;
	autoProgressSeconds: number;
	paginationEnabled: boolean; // Allow manual navigation between questions
	soundsMuted: boolean; // Session-level mute for sound effects
	voiceMuted: boolean; // Session-level mute for voice
	maxHintsPerQuiz: number | null; // Maximum hints allowed per quiz session (null = unlimited)
	noCheatingMode: boolean; // When enabled, end quiz if window loses focus or cursor leaves quiz area
}

export type QuestionRandomizationMode = "all" | "within-subjects";

export interface GeneralConfig {
	showNotePath: boolean;
	showFolderPath: boolean;
	includeSubfolderNotes: boolean;
	randomizeQuestions: QuestionRandomizationMode;
	language: string;
	autoRenameQuizWithScore: boolean;
	customConversationStyles: ConversationStyle[];
	customConversationPromptDraft: string;
	gamification: GamificationConfig;
	showAdvancedSettings: boolean;
	hintsEnabled: boolean; // Enable AI-generated hints for quiz questions
	moreDetailsExpanded: boolean; // Track whether "More details" section is expanded in quiz summary
	showResultsAtEndOnly: boolean; // Show results only at end vs upon submission
}

export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
	enabled: true,
	showStreakCounter: true,
	showDailyStreak: true,
	showTimer: true,
	showTimerDuringQuiz: false,
	showAccuracy: true,
	showReflection: true,
	showStarRating: true,
	enableFlameEffect: true,
	questionTimerEnabled: false,
	questionTimerSeconds: 30,
	shortAnswerTimerEnabled: false,
	shortAnswerTimerSeconds: 120, // 2 minutes default
	longAnswerTimerEnabled: false,
	longAnswerTimerSeconds: 300, // 5 minutes default
	elevenLabsEnabled: false,
	elevenLabsApiKey: "",
	elevenLabsVoiceId: "",
	soundEffectsEnabled: false,
	tickingSoundEnabled: false,
	soundVolume: 50, // Default 50%
	autoProgressEnabled: true,
	autoProgressSeconds: 3,
	paginationEnabled: false, // Disabled by default - forces auto-progress
	soundsMuted: false,
	voiceMuted: false,
	maxHintsPerQuiz: null, // Default: unlimited
	noCheatingMode: false, // Default: no cheating mode disabled
};

export const DEFAULT_GENERAL_SETTINGS: GeneralConfig = {
	showNotePath: false,
	showFolderPath: false,
	includeSubfolderNotes: true,
	randomizeQuestions: "all", // Default to "Randomize all questions and subjects"
	language: "English",
	autoRenameQuizWithScore: false,
	customConversationStyles: [],
	customConversationPromptDraft: "",
	gamification: DEFAULT_GAMIFICATION_CONFIG,
	showAdvancedSettings: false,
	hintsEnabled: false, // Default: hints disabled
	moreDetailsExpanded: true, // Default: expanded
	showResultsAtEndOnly: false, // Default: show results upon submission
};
