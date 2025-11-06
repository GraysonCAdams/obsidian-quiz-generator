import { Setting } from "obsidian";

/**
 * Creates a password input setting for API keys
 * @param containerEl - The container element to add the setting to
 * @param name - The name/title of the setting
 * @param description - The description text for the setting
 * @param value - The current value of the setting
 * @param onChange - Callback function called when the value changes
 * @returns The created Setting instance
 */
export const createPasswordSetting = (
	containerEl: HTMLElement,
	name: string,
	description: string,
	value: string,
	onChange: (value: string) => Promise<void>
): Setting => {
	const setting = new Setting(containerEl)
		.setName(name)
		.setDesc(description)
		.addText(text => {
			text
				.setValue(value)
				.onChange(async (value) => {
					await onChange(value.trim());
				});
			text.inputEl.type = "password";
		});
	
	return setting;
};

/**
 * Creates a base URL setting with a reset button
 * @param containerEl - The container element to add the setting to
 * @param name - The name/title of the setting
 * @param description - The description text for the setting
 * @param value - The current value of the setting
 * @param defaultValue - The default value to restore when reset button is clicked
 * @param onChange - Callback function called when the value changes
 * @param onReset - Optional callback function called when reset button is clicked
 * @returns The created Setting instance
 */
export const createBaseURLSetting = (
	containerEl: HTMLElement,
	name: string,
	description: string,
	value: string,
	defaultValue: string,
	onChange: (value: string) => Promise<void>,
	onReset?: () => Promise<void>
): Setting => {
	const setting = new Setting(containerEl)
		.setName(name)
		.setDesc(description);
	
	if (onReset) {
		setting.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("rotate-ccw")
				.setTooltip("Restore default")
				.onClick(async () => {
					await onReset();
				})
		);
	}
	
	setting.addText(text =>
		text
			.setValue(value)
			.onChange(async (value) => {
				await onChange(value.trim());
			})
	);
	
	return setting;
};

/**
 * Creates a dropdown setting for model selection
 * @param containerEl - The container element to add the setting to
 * @param name - The name/title of the setting
 * @param description - The description text for the setting
 * @param models - Record mapping model values to display names
 * @param value - The current selected value
 * @param onChange - Callback function called when the selection changes
 * @returns The created Setting instance
 */
export const createModelDropdownSetting = (
	containerEl: HTMLElement,
	name: string,
	description: string,
	models: Record<string, string>,
	value: string,
	onChange: (value: string) => Promise<void>
): Setting => {
	return new Setting(containerEl)
		.setName(name)
		.setDesc(description)
		.addDropdown(dropdown =>
			dropdown
				.addOptions(models)
				.setValue(value)
				.onChange(async (value) => {
					await onChange(value);
				})
		);
};

