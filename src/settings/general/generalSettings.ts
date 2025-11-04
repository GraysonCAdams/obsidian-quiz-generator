import { App, Notice, Setting } from "obsidian";
import QuizGenerator from "../../main";
import { languages } from "./generalConfig";
import ElevenLabsService, { ElevenLabsVoice } from "../../services/elevenLabsService";
import SoundManager from "../../services/soundManager";
import { ElevenLabsApiKeyInfoModal } from "./elevenLabsApiKeyInfoModal";

const displayGeneralSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings?: () => void): void => {
	const app = plugin.app;
	
	// Display Settings
	new Setting(containerEl).setName("Display").setHeading();
	
	new Setting(containerEl)
		.setName("Show note path")
		.setDesc("Turn this off to only show the name of selected notes.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showNotePath)
				.onChange(async (value) => {
					plugin.settings.showNotePath = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Show folder path")
		.setDesc("Turn this off to only show the name of selected folders.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showFolderPath)
				.onChange(async (value) => {
					plugin.settings.showFolderPath = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Include notes in subfolders")
		.setDesc("Turn this off to only include notes in the selected folders.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.includeSubfolderNotes)
				.onChange(async (value) => {
					plugin.settings.includeSubfolderNotes = value;
					await plugin.saveSettings();
				})
		);

	// Quiz Behavior
	new Setting(containerEl).setName("Quiz Behavior").setHeading();
	
	new Setting(containerEl)
		.setName("Randomize question order")
		.setDesc("Turn this off to answer questions in their generated/saved order.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.randomizeQuestions)
				.onChange(async (value) => {
					plugin.settings.randomizeQuestions = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Language")
		.setDesc("Language questions are generated in.")
		.addDropdown(dropdown =>
			dropdown
				.addOptions(languages)
				.setValue(plugin.settings.language)
				.onChange(async (value: string) => {
					plugin.settings.language = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Auto-rename quiz files with score")
		.setDesc("Automatically rename quiz files to include the score percentage (e.g., 'Quiz 1 [85%]') when fully completed.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.autoRenameQuizWithScore)
				.onChange(async (value) => {
					plugin.settings.autoRenameQuizWithScore = value;
					await plugin.saveSettings();
				})
		);

	// Gamification section
	new Setting(containerEl).setName("Gamification").setHeading();
	
	new Setting(containerEl)
		.setName("Enable gamification")
		.setDesc("Enable all gamification features including streaks, timers, and ratings.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.enabled)
				.onChange(async (value) => {
					plugin.settings.gamification.enabled = value;
					await plugin.saveSettings();
				})
		);
	
	// Gamification Core Features
	new Setting(containerEl).setName("Core Features").setHeading();
	
	new Setting(containerEl)
		.setName("Show streak counter")
		.setDesc("Display a counter showing consecutive correct answers during quiz.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showStreakCounter)
				.onChange(async (value) => {
					plugin.settings.gamification.showStreakCounter = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show daily streak")
		.setDesc("Track and display consecutive days with quiz activity.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showDailyStreak)
				.onChange(async (value) => {
					plugin.settings.gamification.showDailyStreak = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show timer")
		.setDesc("Track and display elapsed time for quizzes.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showTimer)
				.onChange(async (value) => {
					plugin.settings.gamification.showTimer = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show timer during quiz")
		.setDesc("Display the timer while taking the quiz (in addition to at the end).")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showTimerDuringQuiz)
				.onChange(async (value) => {
					plugin.settings.gamification.showTimerDuringQuiz = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show accuracy")
		.setDesc("Display accuracy percentage in quiz summary.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showAccuracy)
				.onChange(async (value) => {
					plugin.settings.gamification.showAccuracy = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show reflection prompt")
		.setDesc("Ask for reflection on wrong answers at the end of quiz.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showReflection)
				.onChange(async (value) => {
					plugin.settings.gamification.showReflection = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Show star rating")
		.setDesc("Display interactive star rating (0-5 with half stars) in quiz summary.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.showStarRating)
				.onChange(async (value) => {
					plugin.settings.gamification.showStarRating = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Enable flame effect")
		.setDesc("Show animated flame effect around quiz card when reaching 5+ correct answers in a row.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.enableFlameEffect)
				.onChange(async (value) => {
					plugin.settings.gamification.enableFlameEffect = value;
					await plugin.saveSettings();
				})
		);

	// Question Timer
	new Setting(containerEl).setName("Question Timer").setHeading();
	
	new Setting(containerEl)
		.setName("Enable question timer")
		.setDesc("Set a maximum time limit per question. Questions will auto-advance as incorrect when time expires.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.questionTimerEnabled)
				.onChange(async (value) => {
					plugin.settings.gamification.questionTimerEnabled = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName("Timer duration (seconds)")
		.setDesc("Maximum time allowed per question.")
		.addText(text =>
			text
				.setPlaceholder("30")
				.setValue((plugin.settings.gamification.questionTimerSeconds ?? 30).toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						plugin.settings.gamification.questionTimerSeconds = num;
						await plugin.saveSettings();
					}
				})
		);

	// Short Answer Timer Duration
	new Setting(containerEl).setName("Short Answer Timer").setHeading();
	
	new Setting(containerEl)
		.setName("Short answer timer duration (seconds)")
		.setDesc("Time limit for short answer questions when question timer is enabled.")
		.addText(text =>
			text
				.setPlaceholder("120")
				.setValue((plugin.settings.gamification.shortAnswerTimerSeconds ?? 120).toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						plugin.settings.gamification.shortAnswerTimerSeconds = num;
						await plugin.saveSettings();
					}
				})
		);

	// Long Answer Timer Duration
	new Setting(containerEl).setName("Long Answer Timer").setHeading();
	
	new Setting(containerEl)
		.setName("Long answer timer duration (seconds)")
		.setDesc("Time limit for long answer questions when question timer is enabled.")
		.addText(text =>
			text
				.setPlaceholder("300")
				.setValue((plugin.settings.gamification.longAnswerTimerSeconds ?? 300).toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						plugin.settings.gamification.longAnswerTimerSeconds = num;
						await plugin.saveSettings();
					}
				})
		);

	// Text-to-Speech
	new Setting(containerEl).setName("Text-to-Speech").setHeading();
	
	const fetchElevenLabsVoices = async (apiKey: string): Promise<ElevenLabsVoice[]> => {
		if (!apiKey) return [];
		try {
			const service = new ElevenLabsService(apiKey, "");
			return await service.getVoices();
		} catch (error) {
			console.error('Failed to fetch ElevenLabs voices:', error);
			return [];
		}
	};

	const enableDesc = document.createDocumentFragment();
	enableDesc.append("Automatically read questions aloud using ElevenLabs API. Requires API key and voice ID. Learn more at ");
	const enableLink = document.createElement("a");
	enableLink.href = "https://elevenlabs.io/";
	enableLink.textContent = "https://elevenlabs.io/";
	enableLink.setAttribute("target", "_blank");
	enableLink.setAttribute("rel", "noopener noreferrer");
	enableDesc.appendChild(enableLink);
	
	new Setting(containerEl)
		.setName("Enable ElevenLabs text-to-speech")
		.setDesc(enableDesc)
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.elevenLabsEnabled)
				.onChange(async (value) => {
					plugin.settings.gamification.elevenLabsEnabled = value;
					await plugin.saveSettings();
				})
		);
	
	const apiKeyDesc = document.createDocumentFragment();
	apiKeyDesc.append("Your ElevenLabs API key for text-to-speech. The API key must have 'Text to Speech: Access', 'Voices: Read', and 'User: Read' permissions enabled. Get your API key from ");
	const apiKeyLink = document.createElement("a");
	apiKeyLink.href = "https://elevenlabs.io/app/settings/api-keys";
	apiKeyLink.textContent = "https://elevenlabs.io/app/settings/api-keys";
	apiKeyLink.setAttribute("target", "_blank");
	apiKeyLink.setAttribute("rel", "noopener noreferrer");
	apiKeyDesc.appendChild(apiKeyLink);
	
	const apiKeySetting = new Setting(containerEl)
		.setName("ElevenLabs API key")
		.setDesc(apiKeyDesc)
		.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("info")
				.setTooltip("View required API key permissions")
				.onClick(() => {
					new ElevenLabsApiKeyInfoModal(app).open();
				})
		)
		.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("refresh-cw")
				.setTooltip("Refresh voices")
				.onClick(async () => {
					if (plugin.settings.gamification.elevenLabsApiKey) {
						new Notice("Fetching voices...");
						const voices = await fetchElevenLabsVoices(plugin.settings.gamification.elevenLabsApiKey);
						if (voices.length > 0) {
							new Notice(`Found ${voices.length} voices`);
						} else {
							new Notice("No voices found. Check your API key.");
						}
						// Refresh settings to update dropdown
						if (refreshSettings) {
							refreshSettings();
						}
					}
				})
		)
		.addText(text => {
			text
				.setPlaceholder("Enter API key")
				.setValue(plugin.settings.gamification.elevenLabsApiKey || "")
				.inputEl.setAttribute("type", "password");
			text.onChange(async (value) => {
				plugin.settings.gamification.elevenLabsApiKey = value;
				await plugin.saveSettings();
				// Refresh settings to update voice dropdown
				if (refreshSettings) {
					refreshSettings();
				}
			});
		});
	
	const voiceDesc = document.createDocumentFragment();
	voiceDesc.append("Select a voice for text-to-speech. Voices are loaded from your ElevenLabs account. View all voices at ");
	const voiceLink = document.createElement("a");
	voiceLink.href = "https://elevenlabs.io/app/voices";
	voiceLink.textContent = "https://elevenlabs.io/app/voices";
	voiceLink.setAttribute("target", "_blank");
	voiceLink.setAttribute("rel", "noopener noreferrer");
	voiceDesc.appendChild(voiceLink);
	
	new Setting(containerEl)
		.setName("ElevenLabs Voice")
		.setDesc(voiceDesc)
		.addDropdown(async (dropdown) => {
			const hasApiKey = !!plugin.settings.gamification.elevenLabsApiKey;
			
			if (!hasApiKey) {
				dropdown
					.addOption("", "Enter API key first")
					.setValue("")
					.setDisabled(true);
				return;
			}

			const voices = await fetchElevenLabsVoices(plugin.settings.gamification.elevenLabsApiKey);
			
			if (voices.length === 0) {
				dropdown
					.addOption("", "No voices found - check API key")
					.setValue("")
					.setDisabled(true);
				return;
			}

			// Helper function to get country flag emoji from accent/labels
			const getCountryFlag = (voice: ElevenLabsVoice): string => {
				const accent = voice.labels?.accent?.toLowerCase() || '';
				const name = voice.name.toLowerCase();
				
				// Map common accents to flags
				if (accent.includes('american') || accent.includes('us') || accent.includes('united states')) return '🇺🇸';
				if (accent.includes('british') || accent.includes('uk') || accent.includes('english')) return '🇬🇧';
				if (accent.includes('australian') || accent.includes('au')) return '🇦🇺';
				if (accent.includes('canadian') || accent.includes('ca')) return '🇨🇦';
				if (accent.includes('german') || accent.includes('de')) return '🇩🇪';
				if (accent.includes('french') || accent.includes('fr')) return '🇫🇷';
				if (accent.includes('spanish') || accent.includes('es')) return '🇪🇸';
				if (accent.includes('italian') || accent.includes('it')) return '🇮🇹';
				if (accent.includes('japanese') || accent.includes('jp')) return '🇯🇵';
				if (accent.includes('chinese') || accent.includes('cn')) return '🇨🇳';
				if (accent.includes('korean') || accent.includes('kr')) return '🇰🇷';
				if (accent.includes('portuguese') || accent.includes('pt')) return '🇵🇹';
				if (accent.includes('russian') || accent.includes('ru')) return '🇷🇺';
				if (accent.includes('dutch') || accent.includes('nl')) return '🇳🇱';
				if (accent.includes('polish') || accent.includes('pl')) return '🇵🇱';
				if (accent.includes('swedish') || accent.includes('se')) return '🇸🇪';
				if (accent.includes('norwegian') || accent.includes('no')) return '🇳🇴';
				if (accent.includes('danish') || accent.includes('dk')) return '🇩🇰';
				if (accent.includes('finnish') || accent.includes('fi')) return '🇫🇮';
				if (accent.includes('greek') || accent.includes('gr')) return '🇬🇷';
				if (accent.includes('turkish') || accent.includes('tr')) return '🇹🇷';
				if (accent.includes('arabic') || accent.includes('ar')) return '🇸🇦';
				if (accent.includes('hindi') || accent.includes('in')) return '🇮🇳';
				if (accent.includes('brazilian') || accent.includes('br')) return '🇧🇷';
				
				// Fallback: try to infer from name
				if (name.includes('american') || name.includes('us')) return '🇺🇸';
				if (name.includes('british') || name.includes('uk')) return '🇬🇧';
				if (name.includes('australian') || name.includes('au')) return '🇦🇺';
				
				return ''; // No flag if can't determine
			};

			// Create options map: voice_id -> "Flag Name"
			const voiceOptions: Record<string, string> = {};
			voices.forEach(voice => {
				const flag = getCountryFlag(voice);
				voiceOptions[voice.voice_id] = flag ? `${flag} ${voice.name}` : voice.name;
			});

			dropdown
				.addOptions(voiceOptions)
				.setValue(plugin.settings.gamification.elevenLabsVoiceId || "")
				.onChange(async (value) => {
					plugin.settings.gamification.elevenLabsVoiceId = value;
					await plugin.saveSettings();
				});
		});
	
	// Sound Effects
	new Setting(containerEl).setName("Sound Effects").setHeading();
	
	new Setting(containerEl)
		.setName("Enable sound effects")
		.setDesc("Enable sound effects for correct/wrong answers and choosing options.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.soundEffectsEnabled ?? false)
				.onChange(async (value) => {
					plugin.settings.gamification.soundEffectsEnabled = value;
					await plugin.saveSettings();
					// Refresh settings to show/hide volume slider
					if (refreshSettings) {
						refreshSettings();
					}
				})
		);
	
	// Only show volume slider when sound effects are enabled
	if (plugin.settings.gamification.soundEffectsEnabled) {
		new Setting(containerEl)
			.setName("Volume")
			.setDesc("Adjust the volume of sound effects (0-100%).")
			.addSlider(slider => {
				const currentVolume = plugin.settings.gamification.soundVolume ?? 50;
				const tempSoundManager = new SoundManager(true, currentVolume / 100);
				
				slider
					.setValue(currentVolume)
					.setLimits(0, 100, 1)
					.setDynamicTooltip()
					.showTooltip();
				
				slider.onChange(async (value) => {
					plugin.settings.gamification.soundVolume = value;
					await plugin.saveSettings();
					
					// Play dink sound when volume is adjusted
					tempSoundManager.setVolume(value / 100);
					tempSoundManager.playDink();
				});
			});
	}
	
	new Setting(containerEl)
		.setName("Ticking clock sound")
		.setDesc("Play ticking sound when 1/3 of question timer remains (only if question timer is enabled).")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.tickingSoundEnabled ?? false)
				.onChange(async (value) => {
					plugin.settings.gamification.tickingSoundEnabled = value;
					await plugin.saveSettings();
				})
		);

	// Pagination
	new Setting(containerEl).setName("Navigation").setHeading();
	
	new Setting(containerEl)
		.setName("Enable pagination")
		.setDesc("Allow manual navigation between questions using arrow keys and navigation buttons. When disabled, auto-progress is forced on.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.gamification.paginationEnabled ?? false)
				.onChange(async (value) => {
					plugin.settings.gamification.paginationEnabled = value;
					// Force auto-progress when pagination is disabled
					if (!value) {
						plugin.settings.gamification.autoProgressEnabled = true;
					}
					await plugin.saveSettings();
					// Refresh settings to update auto-progress toggle state
					if (refreshSettings) {
						refreshSettings();
					}
				})
		);

	new Setting(containerEl)
		.setName("Auto-progress after answer")
		.setDesc(plugin.settings.gamification.paginationEnabled ?? false
			? "Automatically advance to the next question after answering."
			: "Automatically advance to the next question after answering. (Forced on when pagination is disabled)")
		.addToggle(toggle => {
			const isPaginationEnabled = plugin.settings.gamification.paginationEnabled ?? false;
			toggle
				.setValue(plugin.settings.gamification.autoProgressEnabled ?? true)
				.setDisabled(!isPaginationEnabled)
				.onChange(async (value) => {
					plugin.settings.gamification.autoProgressEnabled = value;
					await plugin.saveSettings();
				});
		});
	
	new Setting(containerEl)
		.setName("Progress delay (seconds)")
		.setDesc("Time to wait before automatically moving to the next question after answering.")
		.addText(text =>
			text
				.setPlaceholder("3")
				.setValue((plugin.settings.gamification.autoProgressSeconds ?? 3).toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						plugin.settings.gamification.autoProgressSeconds = num;
						await plugin.saveSettings();
					}
				})
		);

	// Custom Conversation Styles section
	new Setting(containerEl).setName("Conversation Mode Styles").setHeading();

	const customStylesContainer = containerEl.createDiv("custom-styles-settings-qg");
	
	const refreshCustomStyles = () => {
		customStylesContainer.empty();
		
		if (plugin.settings.customConversationStyles.length === 0) {
			const emptyMsg = customStylesContainer.createDiv("empty-styles-message-qg");
			emptyMsg.setText("No custom styles saved. Create one in Conversation Mode!");
			emptyMsg.style.color = "var(--text-muted)";
			emptyMsg.style.fontStyle = "italic";
			emptyMsg.style.marginTop = "0.5em";
		} else {
			plugin.settings.customConversationStyles.forEach((style, index) => {
				const styleSetting = new Setting(customStylesContainer)
					.setName(style.name)
					.setDesc(`Custom conversation style`);
					
				styleSetting.addButton(button => {
					button
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							plugin.settings.customConversationStyles.splice(index, 1);
							await plugin.saveSettings();
							refreshCustomStyles();
						});
				});
			});
		}
	};
	
	refreshCustomStyles();
};

export default displayGeneralSettings;
