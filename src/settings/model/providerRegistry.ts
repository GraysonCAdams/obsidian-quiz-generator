import QuizGenerator from "../../../main";
import { Provider } from "../../generators/providers";
import displayOllamaSettings from "./ollama/ollamaSettings";
import { createProviderSettings } from "./providerSettingsFactory";
import { providerSettingsMetadata } from "./providerMetadata";

/**
 * Type for provider settings display functions
 */
type ProviderSettingsDisplay = (
	containerEl: HTMLElement,
	plugin: InstanceType<typeof QuizGenerator>,
	refreshSettings: () => void,
	showAdvanced?: boolean
) => void;

/**
 * Registry mapping providers to their settings display functions
 */
const customProviderDisplays: Partial<Record<Provider, ProviderSettingsDisplay>> = {
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
	plugin: InstanceType<typeof QuizGenerator>,
	refreshSettings: () => void,
	showAdvanced?: boolean
): void => {
	const provider = Provider[plugin.settings.provider as keyof typeof Provider];
	const customDisplay = customProviderDisplays[provider];

	if (customDisplay) {
		customDisplay(containerEl, plugin, refreshSettings, showAdvanced);
		return;
	}

	const config = providerSettingsMetadata[provider];

	if (config) {
		createProviderSettings(containerEl, plugin, refreshSettings, config, showAdvanced);
	}
};
