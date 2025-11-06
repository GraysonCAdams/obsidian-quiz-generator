import { Command, Menu, MenuItem, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, QuizSettings } from "./settings/config";
import SelectorModal from "./ui/selector/selectorModal";
import QuizSettingsTab from "./settings/settings";
import QuizReviewer from "./services/quizReviewer";
import { FilterEvaluator } from "./filters/filterEvaluator";
import MissedQuestionsModal from "./ui/selector/missedQuestionsModal";
import AudioCache from "./services/audioCache";
import ExportModal from "./ui/export/exportModal";

export default class QuizGenerator extends Plugin {
	public settings: QuizSettings = DEFAULT_SETTINGS;
	private bookmarkCommands: Command[] = [];

	async onload(): Promise<void> {
		this.addCommand({
			id: "open-generator",
			name: "Open generator",
			callback: (): void => {
				new SelectorModal(this.app, this).open();
			}
		});

		this.addRibbonIcon("brain-circuit", "Open generator", (): void => {
			new SelectorModal(this.app, this).open();
		});

		this.addCommand({
			id: "generate-quiz-from-missed",
			name: "Generate a quiz from missed questions",
			callback: (): void => {
				new MissedQuestionsModal(this.app, this.settings, this).open();
			}
		});

		this.addCommand({
			id: "open-quiz-from-active-note",
			name: "Open quiz from active note",
			callback: (): void => {
				new QuizReviewer(this.app, this.settings).openQuiz(this.app.workspace.getActiveFile());
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile): void => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Open quiz from this note")
							.setIcon("scroll-text")
							.onClick((): void => {
								new QuizReviewer(this.app, this.settings).openQuiz(file);
							});
					});

					// Add export menu item
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Export quiz to...")
							.setIcon("download")
							.onClick(async (): Promise<void> => {
								// Check if file contains quiz questions
								const reviewer = new QuizReviewer(this.app, this.settings);
								const fileContents = await this.app.vault.cachedRead(file);
								
								// Parse questions from file
								const parsedQuestions = reviewer.parseQuestions(fileContents);
								
								if (parsedQuestions.length > 0) {
									new ExportModal(this.app, parsedQuestions).open();
								} else {
									new Notice("No quiz questions found in this file");
								}
							});
					});
				}
			})
		);

		// Add menu item to editor header menu ("..." button)
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: any, view: any): void => {
				const file = view.file;
				if (file && file instanceof TFile && file.extension === "md") {
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Generate a quiz from this note")
							.setIcon("brain-circuit")
							.onClick((): void => {
								// Open selector modal with this file pre-selected
								new SelectorModal(this.app, this, [file]).open();
							});
					});
				}
			})
		);

		await this.loadSettings();
		this.registerBookmarkCommands();
		this.addSettingTab(new QuizSettingsTab(this.app, this));
	}

	onunload(): void {
		// Clear audio cache when plugin is disabled or Obsidian is closed
		AudioCache.getInstance().clear();
	}

	async loadSettings(): Promise<void> {
		const savedSettings = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
		
		// Deep merge gamification config to ensure new properties are added
		if (savedSettings && savedSettings.gamification) {
			this.settings.gamification = Object.assign({}, DEFAULT_SETTINGS.gamification, savedSettings.gamification);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.registerBookmarkCommands();
	}

	private registerBookmarkCommands(): void {
		// Remove all existing bookmark commands by their IDs
		// We need to remove commands that might exist in the command registry
		// but are no longer in our bookmarks list
		const currentBookmarkIds = new Set(this.settings.bookmarkedFilters.map(b => b.id));
		
		// Remove commands that are tracked but no longer exist in bookmarks
		this.bookmarkCommands.forEach(command => {
			const commandId = command.id;
			// Extract bookmark ID from command ID (format: "filter-bookmark-{bookmarkId}")
			const bookmarkIdMatch = commandId.match(/^filter-bookmark-(.+)$/);
			if (bookmarkIdMatch) {
				const bookmarkId = bookmarkIdMatch[1];
				if (!currentBookmarkIds.has(bookmarkId)) {
					// This bookmark no longer exists, remove its command
					try {
						// Accessing internal API for command removal
						(this.app.commands as { removeCommand?: (id: string) => void }).removeCommand?.(`${this.manifest.id}:${commandId}`);
					} catch (e) {
						console.error(`Failed to remove command ${commandId}:`, e);
					}
				}
			}
		});
		
		// Clear and rebuild the bookmarkCommands array
		this.bookmarkCommands = [];

		// Register new commands for each bookmark
		this.settings.bookmarkedFilters.forEach(bookmark => {
			const commandId = `filter-bookmark-${bookmark.id}`;
			
			// First, try to remove any existing command with this ID (in case it wasn't tracked)
			try {
				// Accessing internal API for command removal
				(this.app.commands as { removeCommand?: (id: string) => void }).removeCommand?.(`${this.manifest.id}:${commandId}`);
			} catch (e) {
				// Command might not exist, which is fine
			}
			
			// Then add the new command
			const command = this.addCommand({
				id: commandId,
				name: `Generate quiz from filter: ${bookmark.name}`,
				callback: async (): Promise<void> => {
					await this.executeBookmarkedFilter(bookmark.id);
				}
			});
			this.bookmarkCommands.push(command);
		});
	}

	private async executeBookmarkedFilter(bookmarkId: string): Promise<void> {
		const bookmark = this.settings.bookmarkedFilters.find(b => b.id === bookmarkId);
		if (!bookmark) {
			return;
		}

		// Check if bookmark has the old query format or new search format
		const bmData = bookmark as any;
		if (bmData.query) {
			// Old format with FilterQuery
			const evaluator = new FilterEvaluator(this.app);
			const matchingFiles = await evaluator.getMatchingFiles(bmData.query);
			const modal = new SelectorModal(this.app, this, matchingFiles);
			modal.open();
		} else {
			// New format with search parameters - pass bookmark ID to auto-load
			const modal = new SelectorModal(this.app, this, undefined, bookmarkId);
			modal.open();
		}
	}
}
