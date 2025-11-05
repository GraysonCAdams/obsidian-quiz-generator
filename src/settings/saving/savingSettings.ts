import { normalizePath, Setting } from "obsidian";
import QuizGenerator from "../../main";
import FolderSuggester from "./folderSuggester";

const displaySavingSettings = (containerEl: HTMLElement, plugin: QuizGenerator, showAdvanced?: boolean): void => {
	const advanced = showAdvanced ?? false;
	new Setting(containerEl).setName("Saving").setHeading();

	new Setting(containerEl)
		.setName("Automatically save questions")
		.setDesc("Autosave all questions upon generation.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.autoSave)
				.onChange(async (value) => {
					plugin.settings.autoSave = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Save location")
		.setDesc("Enter vault path to folder where questions are saved.")
		.addSearch(search => {
			new FolderSuggester(plugin.app, search.inputEl);
			search
				.setValue(plugin.settings.savePath)
				.onChange(async (value) => {
					plugin.settings.savePath = normalizePath(value.trim());
					await plugin.saveSettings();
				})
		});

	if (advanced) {
		new Setting(containerEl)
			.setName("Quiz material property")
			.setDesc("Property name for links to notes used in quiz generation. Leave empty to disable. Note: Disabling this will prevent the ability to regenerate a quiz from an existing quiz.")
			.addText(text =>
				text
					.setValue(plugin.settings.quizMaterialProperty)
					.onChange(async (value) => {
						plugin.settings.quizMaterialProperty = value.trim();
						await plugin.saveSettings();
					})
			);
	}
};

export default displaySavingSettings;
