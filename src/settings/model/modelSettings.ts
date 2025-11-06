import { Setting } from "obsidian";
import QuizGenerator from "../../main";
import { providers } from "../../generators/providers";
import { displayProviderSettings } from "./providerRegistry";

const displayModelSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void): void => {
	new Setting(containerEl).setName("Model").setHeading();

	new Setting(containerEl)
		.setName("Provider")
		.setDesc("Model provider to use.")
		.addDropdown(dropdown =>
			dropdown
				.addOptions(providers)
				.setValue(plugin.settings.provider)
				.onChange(async (value) => {
					plugin.settings.provider = value;
					await plugin.saveSettings();
					refreshSettings();
				})
		);

	displayProviderSettings(containerEl, plugin, refreshSettings);
};

export default displayModelSettings;
