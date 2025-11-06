import { Notice } from "obsidian";

/**
 * Shows an error notification to the user
 */
export const showError = (message: string): void => {
	new Notice(`Error: ${message}`, 5000);
};

/**
 * Shows a success notification to the user
 */
export const showSuccess = (message: string): void => {
	new Notice(message, 3000);
};

/**
 * Shows a warning notification to the user
 */
export const showWarning = (message: string): void => {
	new Notice(`Warning: ${message}`, 4000);
};

/**
 * Shows an info notification to the user
 */
export const showInfo = (message: string): void => {
	new Notice(message, 3000);
};

/**
 * Shows a notification with custom duration
 */
export const showNotice = (message: string, duration?: number): void => {
	new Notice(message, duration);
};

