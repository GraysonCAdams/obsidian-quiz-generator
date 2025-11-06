import QuizGenerator from "../../../main";
import { mistralEmbeddingModels, mistralTextGenModels } from "../../../generators/mistral/mistralModels";
import { DEFAULT_MISTRAL_SETTINGS} from "./mistralConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayMistralSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "Mistral",
		apiKeyField: "mistralApiKey",
		apiKeyDescription: "Enter your Mistral API key here.",
		baseURLField: "mistralBaseURL",
		baseURLDescription: "Enter your Mistral API base URL here.",
		defaultBaseURL: DEFAULT_MISTRAL_SETTINGS.mistralBaseURL,
		textGenModelField: "mistralTextGenModel",
		textGenModels: mistralTextGenModels,
		embeddingModelField: "mistralEmbeddingModel",
		embeddingModels: mistralEmbeddingModels,
		hasEmbedding: true,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayMistralSettings;
