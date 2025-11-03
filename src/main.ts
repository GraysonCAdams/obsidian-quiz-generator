import { Command, Menu, MenuItem, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, QuizSettings } from "./settings/config";
import SelectorModal from "./ui/selector/selectorModal";
import QuizSettingsTab from "./settings/settings";
import QuizReviewer from "./services/quizReviewer";
import { FilterEvaluator } from "./filters/filterEvaluator";

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
				}
			})
		);

		await this.loadSettings();
		this.registerBookmarkCommands();
		this.addSettingTab(new QuizSettingsTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.registerBookmarkCommands();
	}

	private registerBookmarkCommands(): void {
		// Remove existing bookmark commands
		this.bookmarkCommands.forEach(command => {
			// @ts-ignore - accessing internal API
			this.app.commands.removeCommand(`${this.manifest.id}:${command.id}`);
		});
		this.bookmarkCommands = [];

		// Register new commands for each bookmark
		this.settings.bookmarkedFilters.forEach(bookmark => {
			const command = this.addCommand({
				id: `filter-bookmark-${bookmark.id}`,
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
