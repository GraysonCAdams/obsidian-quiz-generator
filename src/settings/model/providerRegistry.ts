import QuizGenerator from "../../../main";
import { Provider } from "../../generators/providers";
import displayOpenAISettings from "./openai/openAISettings";
import displayGoogleSettings from "./google/googleSettings";
import displayAnthropicSettings from "./anthropic/anthropicSettings";
import displayPerplexitySettings from "./perplexity/perplexitySettings";
import displayMistralSettings from "./mistral/mistralSettings";
import displayCohereSettings from "./cohere/cohereSettings";
import displayOllamaSettings from "./ollama/ollamaSettings";

/**
 * Type for provider settings display functions
 */
type ProviderSettingsDisplay = (
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings: () => void,
	showAdvanced?: boolean
) => void;

/**
 * Registry mapping providers to their settings display functions
 */
const providerSettingsRegistry: Record<Provider, ProviderSettingsDisplay> = {
	[Provider.OPENAI]: displayOpenAISettings,
	[Provider.GOOGLE]: displayGoogleSettings,
	[Provider.ANTHROPIC]: displayAnthropicSettings,
	[Provider.PERPLEXITY]: displayPerplexitySettings,
	[Provider.MISTRAL]: displayMistralSettings,
	[Provider.COHERE]: displayCohereSettings,
	[Provider.OLLAMA]: displayOllamaSettings,
};

/**
 * Displays settings for the specified provider
 * @param containerEl - The container element to display settings in
 * @param plugin - The plugin instance
 * @param refreshSettings - Function to refresh the settings display
 * @param showAdvanced - Whether to show advanced settings
 */
export const displayProviderSettings = (
	containerEl: HTMLElement,
	plugin: QuizGenerator,
	refreshSettings: () => void,
	showAdvanced?: boolean
): void => {
	const provider = Provider[plugin.settings.provider as keyof typeof Provider];
	const displayFunction = providerSettingsRegistry[provider];
	
	if (displayFunction) {
		displayFunction(containerEl, plugin, refreshSettings, showAdvanced);
	}
};
