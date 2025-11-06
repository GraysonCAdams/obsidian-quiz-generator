import QuizGenerator from "../../../main";
import { googleEmbeddingModels, googleTextGenModels } from "../../../generators/google/googleModels";
import { DEFAULT_GOOGLE_SETTINGS } from "./googleConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayGoogleSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "Google",
		apiKeyField: "googleApiKey",
		apiKeyDescription: "Enter your Google API key here.",
		baseURLField: "googleBaseURL",
		baseURLDescription: "Enter your Google API base URL here.",
		defaultBaseURL: DEFAULT_GOOGLE_SETTINGS.googleBaseURL,
		textGenModelField: "googleTextGenModel",
		textGenModels: googleTextGenModels,
		embeddingModelField: "googleEmbeddingModel",
		embeddingModels: googleEmbeddingModels,
		hasEmbedding: true,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayGoogleSettings;
