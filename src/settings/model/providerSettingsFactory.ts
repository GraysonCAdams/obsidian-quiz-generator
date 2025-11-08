import { Setting } from "obsidian";
import QuizGenerator from "../../../main";
import { createPasswordSetting, createBaseURLSetting, createModelDropdownSetting } from "../settingsHelpers";

/**
 * Configuration for creating provider settings
 */
export interface ProviderSettingsConfig {
	providerName: string;
	apiKeyField: keyof InstanceType<typeof QuizGenerator>["settings"];
	apiKeyDescription: string;
	baseURLField: keyof InstanceType<typeof QuizGenerator>["settings"];
	baseURLDescription: string;
	defaultBaseURL: string;
	textGenModelField: keyof InstanceType<typeof QuizGenerator>["settings"];
	textGenModels: Record<string, string>;
	embeddingModelField?: keyof InstanceType<typeof QuizGenerator>["settings"];
	embeddingModels?: Record<string, string>;
	hasEmbedding: boolean;
}

/**
 * Creates standardized provider settings UI
 */
export const createProviderSettings = (
	containerEl: HTMLElement,
	plugin: InstanceType<typeof QuizGenerator>,
	refreshSettings: () => void,
	config: ProviderSettingsConfig,
	showAdvanced?: boolean
): void => {
	const advanced = showAdvanced ?? false;
	
	// API key is essential - always show
	createPasswordSetting(
		containerEl,
		`${config.providerName} API key`,
		config.apiKeyDescription,
		plugin.settings[config.apiKeyField] as string,
		async (value: string) => {
			(plugin.settings[config.apiKeyField] as string) = value;
			await plugin.saveSettings();
		}
	);

	if (advanced) {
		// Base URL setting with reset button
		createBaseURLSetting(
			containerEl,
			`${config.providerName} API base url`,
			config.baseURLDescription,
			plugin.settings[config.baseURLField] as string,
			config.defaultBaseURL,
			async (value: string) => {
				(plugin.settings[config.baseURLField] as string) = value;
				await plugin.saveSettings();
			},
			async () => {
				(plugin.settings[config.baseURLField] as string) = config.defaultBaseURL;
				await plugin.saveSettings();
				refreshSettings();
			}
		);

		// Generation model dropdown
		createModelDropdownSetting(
			containerEl,
			"Generation model",
			"Model used for quiz generation.",
			config.textGenModels,
			plugin.settings[config.textGenModelField] as string,
			async (value: string) => {
				(plugin.settings[config.textGenModelField] as string) = value;
				await plugin.saveSettings();
			}
		);

		// Embedding model dropdown (if provider supports it)
		if (config.hasEmbedding && config.embeddingModelField && config.embeddingModels) {
			createModelDropdownSetting(
				containerEl,
				"Embedding model",
				"Model used for evaluating short and long answer questions.",
				config.embeddingModels,
				plugin.settings[config.embeddingModelField] as string,
				async (value: string) => {
					(plugin.settings[config.embeddingModelField!] as string) = value;
					await plugin.saveSettings();
				}
			);
		}
	}
};

