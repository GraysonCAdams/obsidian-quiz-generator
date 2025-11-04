export interface SavingConfig {
	autoSave: boolean;
	savePath: string;
	quizMaterialProperty: string;
}

export const DEFAULT_SAVING_SETTINGS: SavingConfig = {
	autoSave: false,
	savePath: "/",
	quizMaterialProperty: "sources",
};
