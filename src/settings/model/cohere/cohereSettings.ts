import QuizGenerator from "../../../main";
import { cohereEmbeddingModels, cohereTextGenModels } from "../../../generators/cohere/cohereModels";
import { DEFAULT_COHERE_SETTINGS } from "./cohereConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayCohereSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "Cohere",
		apiKeyField: "cohereApiKey",
		apiKeyDescription: "Enter your Cohere API key here.",
		baseURLField: "cohereBaseURL",
		baseURLDescription: "Enter your Cohere API base URL here.",
		defaultBaseURL: DEFAULT_COHERE_SETTINGS.cohereBaseURL,
		textGenModelField: "cohereTextGenModel",
		textGenModels: cohereTextGenModels,
		embeddingModelField: "cohereEmbeddingModel",
		embeddingModels: cohereEmbeddingModels,
		hasEmbedding: true,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayCohereSettings;
