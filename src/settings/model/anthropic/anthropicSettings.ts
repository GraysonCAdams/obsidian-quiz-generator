import QuizGenerator from "../../../main";
import { anthropicTextGenModels } from "../../../generators/anthropic/anthropicModels";
import { DEFAULT_ANTHROPIC_SETTINGS } from "./anthropicConfig";
import { createProviderSettings, ProviderSettingsConfig } from "../providerSettingsFactory";

const displayAnthropicSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void, showAdvanced?: boolean): void => {
	const config: ProviderSettingsConfig = {
		providerName: "Anthropic",
		apiKeyField: "anthropicApiKey",
		apiKeyDescription: "Enter your Anthropic API key here.",
		baseURLField: "anthropicBaseURL",
		baseURLDescription: "Enter your Anthropic API base URL here.",
		defaultBaseURL: DEFAULT_ANTHROPIC_SETTINGS.anthropicBaseURL,
		textGenModelField: "anthropicTextGenModel",
		textGenModels: anthropicTextGenModels,
		hasEmbedding: false,
	};

	createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
};

export default displayAnthropicSettings;
