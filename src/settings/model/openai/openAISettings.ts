import QuizGenerator from "../../../main";
import { openAIEmbeddingModels, openAITextGenModels } from "../../../generators/openai/openAIModels";
import { DEFAULT_OPENAI_SETTINGS } from "./openAIConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayOpenAISettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "OpenAI",
		apiKeyField: "openAIApiKey",
		apiKeyDescription: "Enter your OpenAI API key here.",
		baseURLField: "openAIBaseURL",
		baseURLDescription: "Enter your OpenAI API base URL here.",
		defaultBaseURL: DEFAULT_OPENAI_SETTINGS.openAIBaseURL,
		textGenModelField: "openAITextGenModel",
		textGenModels: openAITextGenModels,
		embeddingModelField: "openAIEmbeddingModel",
		embeddingModels: openAIEmbeddingModels,
		hasEmbedding: true,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayOpenAISettings;
