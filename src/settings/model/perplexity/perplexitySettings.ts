import QuizGenerator from "../../../main";
import { perplexityTextGenModels } from "../../../generators/perplexity/perplexityModels";
import { DEFAULT_PERPLEXITY_SETTINGS } from "./perplexityConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayPerplexitySettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "Perplexity",
		apiKeyField: "perplexityApiKey",
		apiKeyDescription: "Enter your Perplexity API key here.",
		baseURLField: "perplexityBaseURL",
		baseURLDescription: "Enter your Perplexity API base URL here.",
		defaultBaseURL: DEFAULT_PERPLEXITY_SETTINGS.perplexityBaseURL,
		textGenModelField: "perplexityTextGenModel",
		textGenModels: perplexityTextGenModels,
		hasEmbedding: false,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayPerplexitySettings;
