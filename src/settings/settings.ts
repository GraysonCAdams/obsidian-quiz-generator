import { App, Modal, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import QuizGenerator from "../main";
import { displayGeneralSettings, displayGamificationSettings, displayTimersSettings, displayTextToSpeechSettings, displaySoundNavigationSettings } from "./general/generalSettings";
import displaySavingSettings from "./saving/savingSettings";
import displayFilterSettings from "./filter/filterSettings";
import { DEFAULT_SETTINGS } from "./config";
import { DEFAULT_GAMIFICATION_CONFIG } from "./general/generalConfig";
import { DEFAULT_GENERATION_SETTINGS } from "./generation/generationConfig";
import { DEFAULT_SAVING_SETTINGS } from "./saving/savingConfig";
import { DEFAULT_FILTER_SETTINGS } from "./filter/filterConfig";
import { DEFAULT_MODEL_SETTINGS } from "./model/modelConfig";

export default class QuizSettingsTab extends PluginSettingTab {
	private readonly plugin: QuizGenerator;
	private activeTabName: string | null = null;

	constructor(app: App, plugin: QuizGenerator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const refreshSettings = (): void => {
			// Store current active tab before refreshing (before display() empties the container)
			const activeTab = containerEl.querySelector(".settings-tab-qg.is-active") as HTMLElement;
			if (activeTab && activeTab.textContent) {
				this.activeTabName = activeTab.textContent.trim();
			}
			this.display();
		};

		// Create plugin banner
		const banner = containerEl.createDiv("plugin-banner-qg");
		
		// Icon and name section
		const leftSection = banner.createDiv("plugin-banner-left-qg");
		const iconContainer = leftSection.createDiv("plugin-banner-icon-qg");
		setIcon(iconContainer, "brain-circuit");
		
		const nameSection = leftSection.createDiv("plugin-banner-name-qg");
		const name = nameSection.createDiv("plugin-banner-title-qg");
		name.textContent = "Quiz Generator Reborn";
		
		// Badges section
		const badgesSection = nameSection.createDiv("plugin-banner-badges-qg");
		const versionBadge = badgesSection.createDiv("plugin-banner-badge-qg");
		versionBadge.textContent = `v${this.plugin.manifest.version}`;
		const communityBadge = badgesSection.createDiv("plugin-banner-badge-qg");
		communityBadge.textContent = "COMMUNITY";
		
		// Advanced settings toggle (top right)
		const advancedToggleContainer = banner.createDiv("plugin-banner-advanced-toggle-qg");
		const advancedToggleSetting = new Setting(advancedToggleContainer)
			.setName("Show advanced settings")
			.setDesc("Display additional configuration options")
			.addToggle((toggle: any) => {
				const showAdvanced = this.plugin.settings.showAdvancedSettings ?? false;
				toggle.setValue(showAdvanced);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.showAdvancedSettings = value;
					await this.plugin.saveSettings();
					refreshSettings(); // Re-render to show/hide advanced settings
				});
			});
		
		// Action links section
		const actionLinks = banner.createDiv("plugin-banner-actions-qg");
		
		// GitHub link
		const githubLink = actionLinks.createEl("a", { cls: "plugin-banner-action-qg" });
		githubLink.href = "https://github.com/ECuiDev/obsidian-quiz-generator";
		githubLink.target = "_blank";
		githubLink.rel = "noopener noreferrer";
		const githubSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		githubSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		githubSvg.setAttribute("width", "16");
		githubSvg.setAttribute("height", "16");
		githubSvg.setAttribute("viewBox", "0 0 24 24");
		githubSvg.setAttribute("fill", "none");
		githubSvg.setAttribute("stroke", "currentColor");
		githubSvg.setAttribute("stroke-width", "2");
		githubSvg.setAttribute("stroke-linecap", "round");
		githubSvg.setAttribute("stroke-linejoin", "round");
		const githubPath1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		githubPath1.setAttribute("d", "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4");
		const githubPath2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		githubPath2.setAttribute("d", "M9 18c-4.51 2-5-2-7-2");
		githubSvg.appendChild(githubPath1);
		githubSvg.appendChild(githubPath2);
		githubLink.appendChild(githubSvg);
		githubLink.createSpan().textContent = "GitHub";
		
		// Documentation link
		const docsLink = actionLinks.createEl("a", { cls: "plugin-banner-action-qg" });
		docsLink.href = "https://github.com/ECuiDev/obsidian-quiz-generator#readme";
		docsLink.target = "_blank";
		docsLink.rel = "noopener noreferrer";
		const docsSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		docsSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		docsSvg.setAttribute("width", "16");
		docsSvg.setAttribute("height", "16");
		docsSvg.setAttribute("viewBox", "0 0 24 24");
		docsSvg.setAttribute("fill", "none");
		docsSvg.setAttribute("stroke", "currentColor");
		docsSvg.setAttribute("stroke-width", "2");
		docsSvg.setAttribute("stroke-linecap", "round");
		docsSvg.setAttribute("stroke-linejoin", "round");
		const docsPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
		docsPath.setAttribute("d", "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20");
		docsSvg.appendChild(docsPath);
		docsLink.appendChild(docsSvg);
		docsLink.createSpan().textContent = "Documentation";
		
		// Author link
		const authorLink = actionLinks.createEl("a", { cls: "plugin-banner-action-qg" });
		authorLink.href = "https://grayada.ms";
		authorLink.target = "_blank";
		authorLink.rel = "noopener noreferrer";
		const authorSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		authorSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		authorSvg.setAttribute("width", "16");
		authorSvg.setAttribute("height", "16");
		authorSvg.setAttribute("viewBox", "0 0 24 24");
		authorSvg.setAttribute("fill", "none");
		authorSvg.setAttribute("stroke", "currentColor");
		authorSvg.setAttribute("stroke-width", "2");
		authorSvg.setAttribute("stroke-linecap", "round");
		authorSvg.setAttribute("stroke-linejoin", "round");
		const authorPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
		authorPath.setAttribute("d", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2");
		const authorCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		authorCircle.setAttribute("cx", "12");
		authorCircle.setAttribute("cy", "7");
		authorCircle.setAttribute("r", "4");
		authorSvg.appendChild(authorPath);
		authorSvg.appendChild(authorCircle);
		authorLink.appendChild(authorSvg);
		authorLink.createSpan().textContent = "Grayson";
		
		// Feedback link (Issues page)
		const feedbackLink = actionLinks.createEl("a", { cls: "plugin-banner-action-qg" });
		feedbackLink.href = "https://github.com/ECuiDev/obsidian-quiz-generator/issues";
		feedbackLink.target = "_blank";
		feedbackLink.rel = "noopener noreferrer";
		const feedbackSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		feedbackSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		feedbackSvg.setAttribute("width", "16");
		feedbackSvg.setAttribute("height", "16");
		feedbackSvg.setAttribute("viewBox", "0 0 24 24");
		feedbackSvg.setAttribute("fill", "none");
		feedbackSvg.setAttribute("stroke", "currentColor");
		feedbackSvg.setAttribute("stroke-width", "2");
		feedbackSvg.setAttribute("stroke-linecap", "round");
		feedbackSvg.setAttribute("stroke-linejoin", "round");
		const feedbackPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
		feedbackPath.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
		feedbackSvg.appendChild(feedbackPath);
		feedbackLink.appendChild(feedbackSvg);
		feedbackLink.createSpan().textContent = "Feedback";

		// Create tabs container at the top level
		const tabsContainer = containerEl.createDiv("settings-tabs-container-qg");
		const tabsNav = tabsContainer.createDiv("settings-tabs-nav-qg");
		const tabsContent = tabsContainer.createDiv("settings-tabs-content-qg");
		
		// Tab buttons
		const generalTab = tabsNav.createEl("button", { cls: "settings-tab-qg is-active", text: "General" });
		const gamificationTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Gamification" });
		const timersTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Timers" });
		const textToSpeechTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Text-to-Speech" });
		const soundNavTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Sound & Navigation" });
		const savingTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Saving" });
		const filtersTab = tabsNav.createEl("button", { cls: "settings-tab-qg", text: "Filters" });
		
		// Tab content containers
		const generalContent = tabsContent.createDiv("settings-tab-content-qg is-active");
		const gamificationContent = tabsContent.createDiv("settings-tab-content-qg");
		const timersContent = tabsContent.createDiv("settings-tab-content-qg");
		const textToSpeechContent = tabsContent.createDiv("settings-tab-content-qg");
		const soundNavContent = tabsContent.createDiv("settings-tab-content-qg");
		const savingContent = tabsContent.createDiv("settings-tab-content-qg");
		const filtersContent = tabsContent.createDiv("settings-tab-content-qg");
		
		// Tab switching function
		const switchTab = (activeTab: HTMLElement, activeContent: HTMLElement): void => {
			// Remove active class from all tabs and content
			tabsNav.querySelectorAll(".settings-tab-qg").forEach(tab => tab.classList.remove("is-active"));
			tabsContent.querySelectorAll(".settings-tab-content-qg").forEach(content => content.classList.remove("is-active"));
			
			// Add active class to selected tab and content
			activeTab.classList.add("is-active");
			activeContent.classList.add("is-active");
		};
		
		generalTab.addEventListener("click", () => switchTab(generalTab, generalContent));
		gamificationTab.addEventListener("click", () => switchTab(gamificationTab, gamificationContent));
		timersTab.addEventListener("click", () => switchTab(timersTab, timersContent));
		textToSpeechTab.addEventListener("click", () => switchTab(textToSpeechTab, textToSpeechContent));
		soundNavTab.addEventListener("click", () => switchTab(soundNavTab, soundNavContent));
		savingTab.addEventListener("click", () => switchTab(savingTab, savingContent));
		filtersTab.addEventListener("click", () => switchTab(filtersTab, filtersContent));

		// Restore active tab if it was set before refresh
		if (this.activeTabName) {
			const tabMap: Record<string, { tab: HTMLElement; content: HTMLElement }> = {
				"General": { tab: generalTab, content: generalContent },
				"Gamification": { tab: gamificationTab, content: gamificationContent },
				"Timers": { tab: timersTab, content: timersContent },
				"Text-to-Speech": { tab: textToSpeechTab, content: textToSpeechContent },
				"Sound & Navigation": { tab: soundNavTab, content: soundNavContent },
				"Saving": { tab: savingTab, content: savingContent },
				"Filters": { tab: filtersTab, content: filtersContent },
			};
			
			const tabToRestore = tabMap[this.activeTabName];
			if (tabToRestore) {
				switchTab(tabToRestore.tab, tabToRestore.content);
			}
			// Clear the stored tab name after restoring
			this.activeTabName = null;
		}

		// Modal for confirming reset to defaults
		class ConfirmResetModal extends Modal {
			private resetFunction: () => Promise<void>;
			private refreshCallback: () => void;

			constructor(app: App, resetFunction: () => Promise<void>, refreshCallback: () => void) {
				super(app);
				this.resetFunction = resetFunction;
				this.refreshCallback = refreshCallback;
			}

			onOpen(): void {
				const { contentEl } = this;
				contentEl.empty();
				
				contentEl.createEl("h2", { text: "Reset to Defaults?" });
				
				const message = contentEl.createDiv();
				message.style.marginBottom = "20px";
				message.createEl("p", { text: "Are you sure you want to reset these settings to their default values?" });
				message.createEl("p", { 
					text: "This action cannot be undone.",
					attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
				});
				
				const buttonContainer = contentEl.createDiv();
				buttonContainer.style.display = "flex";
				buttonContainer.style.gap = "10px";
				buttonContainer.style.justifyContent = "flex-end";
				
				const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
				cancelBtn.addEventListener("click", () => this.close());
				
				const resetBtn = buttonContainer.createEl("button", { text: "Reset" });
				resetBtn.classList.add("mod-warning");
				resetBtn.addEventListener("click", async () => {
					this.close();
					await this.resetFunction();
					this.refreshCallback();
					new Notice("Settings reset to defaults");
				});
			}

			onClose(): void {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		// Helper function to create reset button for a tab
		const createResetButton = (container: HTMLElement, resetFunction: () => Promise<void>, isAtDefaults: () => boolean): void => {
			const resetButtonContainer = container.createDiv("settings-reset-button-container-qg");
			resetButtonContainer.style.marginTop = "2em";
			resetButtonContainer.style.marginBottom = "1em";
			resetButtonContainer.style.display = "flex";
			resetButtonContainer.style.justifyContent = "center";
			resetButtonContainer.style.paddingTop = "1em";
			resetButtonContainer.style.borderTop = "1px solid var(--background-modifier-border)";
			
			const resetButton = resetButtonContainer.createEl("button");
			resetButton.style.display = "flex";
			resetButton.style.alignItems = "center";
			resetButton.style.gap = "0.4em";
			resetButton.style.fontSize = "0.85em";
			resetButton.style.padding = "0.4em 0.8em";
			resetButton.style.opacity = "0.7";
			resetButton.style.transition = "opacity 0.2s ease";
			
			const iconContainer = resetButton.createDiv();
			setIcon(iconContainer, "refresh-cw");
			iconContainer.style.fontSize = "0.9em";
			resetButton.createSpan({ text: "Reset to defaults" });
			
			const atDefaults = isAtDefaults();
			if (atDefaults) {
				resetButton.disabled = true;
				resetButton.style.opacity = "0.4";
				resetButton.style.cursor = "not-allowed";
			} else {
				resetButton.addEventListener("mouseenter", () => {
					resetButton.style.opacity = "1";
				});
				resetButton.addEventListener("mouseleave", () => {
					resetButton.style.opacity = "0.7";
				});
				resetButton.addEventListener("click", () => {
					const modal = new ConfirmResetModal(this.app, resetFunction, refreshSettings);
					modal.open();
				});
			}
		};

		// Determine which tabs should be visible based on advanced settings
		const showAdvanced = this.plugin.settings.showAdvancedSettings ?? false;
		
		// All tabs are always visible now
		// Render settings in their respective tabs
		
		// General tab - reset Model, Quiz Behavior, and Generation settings
		displayGeneralSettings(generalContent, this.plugin, refreshSettings, showAdvanced);
		createResetButton(generalContent, async () => {
			Object.assign(this.plugin.settings, {
				...DEFAULT_MODEL_SETTINGS,
				randomizeQuestions: DEFAULT_SETTINGS.randomizeQuestions as "all" | "within-subjects",
				language: DEFAULT_SETTINGS.language,
				autoRenameQuizWithScore: DEFAULT_SETTINGS.autoRenameQuizWithScore,
				customConversationStyles: DEFAULT_SETTINGS.customConversationStyles,
				customConversationPromptDraft: DEFAULT_SETTINGS.customConversationPromptDraft,
				...DEFAULT_GENERATION_SETTINGS,
			});
			await this.plugin.saveSettings();
		}, () => {
			// Check if General tab settings are at defaults
			const modelMatch = Object.keys(DEFAULT_MODEL_SETTINGS).every(key => {
				const defaultKey = key as keyof typeof DEFAULT_MODEL_SETTINGS;
				return this.plugin.settings[defaultKey] === DEFAULT_MODEL_SETTINGS[defaultKey];
			});
			const generalMatch = 
				this.plugin.settings.randomizeQuestions === DEFAULT_SETTINGS.randomizeQuestions &&
				this.plugin.settings.language === DEFAULT_SETTINGS.language &&
				this.plugin.settings.autoRenameQuizWithScore === DEFAULT_SETTINGS.autoRenameQuizWithScore &&
				JSON.stringify(this.plugin.settings.customConversationStyles) === JSON.stringify(DEFAULT_SETTINGS.customConversationStyles) &&
				this.plugin.settings.customConversationPromptDraft === DEFAULT_SETTINGS.customConversationPromptDraft;
			const generationMatch = Object.keys(DEFAULT_GENERATION_SETTINGS).every(key => {
				const defaultKey = key as keyof typeof DEFAULT_GENERATION_SETTINGS;
				if (key === "questionTypeRatios") {
					return JSON.stringify(this.plugin.settings.questionTypeRatios) === JSON.stringify(DEFAULT_GENERATION_SETTINGS.questionTypeRatios);
				}
				if (key === "questionTypeOrder") {
					return JSON.stringify(this.plugin.settings.questionTypeOrder) === JSON.stringify(DEFAULT_GENERATION_SETTINGS.questionTypeOrder);
				}
				return this.plugin.settings[defaultKey] === DEFAULT_GENERATION_SETTINGS[defaultKey];
			});
			return modelMatch && generalMatch && generationMatch;
		});
		
		// Gamification tab - reset gamification settings (except timer and sound)
		displayGamificationSettings(gamificationContent, this.plugin, refreshSettings, showAdvanced);
		createResetButton(gamificationContent, async () => {
			this.plugin.settings.gamification = {
				...this.plugin.settings.gamification,
				enabled: DEFAULT_GAMIFICATION_CONFIG.enabled,
				showStreakCounter: DEFAULT_GAMIFICATION_CONFIG.showStreakCounter,
				showDailyStreak: DEFAULT_GAMIFICATION_CONFIG.showDailyStreak,
				showTimer: DEFAULT_GAMIFICATION_CONFIG.showTimer,
				showTimerDuringQuiz: DEFAULT_GAMIFICATION_CONFIG.showTimerDuringQuiz,
				showAccuracy: DEFAULT_GAMIFICATION_CONFIG.showAccuracy,
				showReflection: DEFAULT_GAMIFICATION_CONFIG.showReflection,
				showStarRating: DEFAULT_GAMIFICATION_CONFIG.showStarRating,
				enableFlameEffect: DEFAULT_GAMIFICATION_CONFIG.enableFlameEffect,
			};
			await this.plugin.saveSettings();
		}, () => {
			// Check if gamification settings are at defaults
			return this.plugin.settings.gamification.enabled === DEFAULT_GAMIFICATION_CONFIG.enabled &&
				this.plugin.settings.gamification.showStreakCounter === DEFAULT_GAMIFICATION_CONFIG.showStreakCounter &&
				this.plugin.settings.gamification.showDailyStreak === DEFAULT_GAMIFICATION_CONFIG.showDailyStreak &&
				this.plugin.settings.gamification.showTimer === DEFAULT_GAMIFICATION_CONFIG.showTimer &&
				this.plugin.settings.gamification.showTimerDuringQuiz === DEFAULT_GAMIFICATION_CONFIG.showTimerDuringQuiz &&
				this.plugin.settings.gamification.showAccuracy === DEFAULT_GAMIFICATION_CONFIG.showAccuracy &&
				this.plugin.settings.gamification.showReflection === DEFAULT_GAMIFICATION_CONFIG.showReflection &&
				this.plugin.settings.gamification.showStarRating === DEFAULT_GAMIFICATION_CONFIG.showStarRating &&
				this.plugin.settings.gamification.enableFlameEffect === DEFAULT_GAMIFICATION_CONFIG.enableFlameEffect;
		});
		
		// Timers tab - reset timer settings
		displayTimersSettings(timersContent, this.plugin, refreshSettings, showAdvanced);
		createResetButton(timersContent, async () => {
			this.plugin.settings.gamification.questionTimerEnabled = DEFAULT_GAMIFICATION_CONFIG.questionTimerEnabled;
			this.plugin.settings.gamification.questionTimerSeconds = DEFAULT_GAMIFICATION_CONFIG.questionTimerSeconds;
			this.plugin.settings.gamification.shortAnswerTimerSeconds = DEFAULT_GAMIFICATION_CONFIG.shortAnswerTimerSeconds;
			this.plugin.settings.gamification.longAnswerTimerSeconds = DEFAULT_GAMIFICATION_CONFIG.longAnswerTimerSeconds;
			await this.plugin.saveSettings();
		}, () => {
			// Check if timer settings are at defaults
			return this.plugin.settings.gamification.questionTimerEnabled === DEFAULT_GAMIFICATION_CONFIG.questionTimerEnabled &&
				this.plugin.settings.gamification.questionTimerSeconds === DEFAULT_GAMIFICATION_CONFIG.questionTimerSeconds &&
				this.plugin.settings.gamification.shortAnswerTimerSeconds === DEFAULT_GAMIFICATION_CONFIG.shortAnswerTimerSeconds &&
				this.plugin.settings.gamification.longAnswerTimerSeconds === DEFAULT_GAMIFICATION_CONFIG.longAnswerTimerSeconds;
		});
		
		// Text-to-Speech tab - reset ElevenLabs settings
		displayTextToSpeechSettings(textToSpeechContent, this.plugin, refreshSettings, showAdvanced);
		createResetButton(textToSpeechContent, async () => {
			this.plugin.settings.gamification.elevenLabsEnabled = DEFAULT_GAMIFICATION_CONFIG.elevenLabsEnabled;
			this.plugin.settings.gamification.elevenLabsApiKey = DEFAULT_GAMIFICATION_CONFIG.elevenLabsApiKey;
			this.plugin.settings.gamification.elevenLabsVoiceId = DEFAULT_GAMIFICATION_CONFIG.elevenLabsVoiceId;
			await this.plugin.saveSettings();
		}, () => {
			// Check if TTS settings are at defaults
			return this.plugin.settings.gamification.elevenLabsEnabled === DEFAULT_GAMIFICATION_CONFIG.elevenLabsEnabled &&
				this.plugin.settings.gamification.elevenLabsApiKey === DEFAULT_GAMIFICATION_CONFIG.elevenLabsApiKey &&
				this.plugin.settings.gamification.elevenLabsVoiceId === DEFAULT_GAMIFICATION_CONFIG.elevenLabsVoiceId;
		});
		
		// Sound & Navigation tab - reset sound and navigation settings
		displaySoundNavigationSettings(soundNavContent, this.plugin, refreshSettings, showAdvanced);
		createResetButton(soundNavContent, async () => {
			this.plugin.settings.gamification.soundEffectsEnabled = DEFAULT_GAMIFICATION_CONFIG.soundEffectsEnabled;
			this.plugin.settings.gamification.soundVolume = DEFAULT_GAMIFICATION_CONFIG.soundVolume;
			this.plugin.settings.gamification.tickingSoundEnabled = DEFAULT_GAMIFICATION_CONFIG.tickingSoundEnabled;
			this.plugin.settings.gamification.paginationEnabled = DEFAULT_GAMIFICATION_CONFIG.paginationEnabled;
			this.plugin.settings.gamification.autoProgressEnabled = DEFAULT_GAMIFICATION_CONFIG.autoProgressEnabled;
			this.plugin.settings.gamification.autoProgressSeconds = DEFAULT_GAMIFICATION_CONFIG.autoProgressSeconds;
			await this.plugin.saveSettings();
		}, () => {
			// Check if sound & navigation settings are at defaults
			return this.plugin.settings.gamification.soundEffectsEnabled === DEFAULT_GAMIFICATION_CONFIG.soundEffectsEnabled &&
				this.plugin.settings.gamification.soundVolume === DEFAULT_GAMIFICATION_CONFIG.soundVolume &&
				this.plugin.settings.gamification.tickingSoundEnabled === DEFAULT_GAMIFICATION_CONFIG.tickingSoundEnabled &&
				this.plugin.settings.gamification.paginationEnabled === DEFAULT_GAMIFICATION_CONFIG.paginationEnabled &&
				this.plugin.settings.gamification.autoProgressEnabled === DEFAULT_GAMIFICATION_CONFIG.autoProgressEnabled &&
				this.plugin.settings.gamification.autoProgressSeconds === DEFAULT_GAMIFICATION_CONFIG.autoProgressSeconds;
		});
		
		// Saving tab - reset saving settings
		displaySavingSettings(savingContent, this.plugin, showAdvanced);
		createResetButton(savingContent, async () => {
			Object.assign(this.plugin.settings, DEFAULT_SAVING_SETTINGS);
			await this.plugin.saveSettings();
		}, () => {
			// Check if saving settings are at defaults
			return this.plugin.settings.autoSave === DEFAULT_SAVING_SETTINGS.autoSave &&
				this.plugin.settings.savePath === DEFAULT_SAVING_SETTINGS.savePath &&
				this.plugin.settings.quizMaterialProperty === DEFAULT_SAVING_SETTINGS.quizMaterialProperty;
		});
		
		// Filters tab - reset filter bookmarks
		displayFilterSettings(filtersContent, this.plugin, showAdvanced);
		createResetButton(filtersContent, async () => {
			this.plugin.settings.bookmarkedFilters = [...DEFAULT_FILTER_SETTINGS.bookmarkedFilters];
			await this.plugin.saveSettings();
		}, () => {
			// Check if filter settings are at defaults
			return this.plugin.settings.bookmarkedFilters.length === DEFAULT_FILTER_SETTINGS.bookmarkedFilters.length;
		});
	}
}
