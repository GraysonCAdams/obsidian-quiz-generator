import { App, getFrontMatterInfo, Modal, Notice, Scope, setIcon, Setting, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question, Quiz } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";
import NoteAndFolderSelector from "./noteAndFolderSelector";
import NoteViewerModal from "./noteViewerModal";
import FolderViewerModal from "./folderViewerModal";
import GeneratorFactory from "../../generators/generatorFactory";
import QuizModalLogic from "../quiz/quizModalLogic";
import { cleanUpNoteContents } from "../../utils/markdownCleaner";
import { countNoteTokens, setIconAndTooltip } from "../../utils/helpers";
import { Provider } from "../../generators/providers";
import FilterBuilderModal from "../filter/filterBuilderModal";
import type QuizGenerator from "../../main";

const enum SelectorModalButton {
	CLEAR,
	QUIZ,
	FILTER,
	GENERATE,
}

enum TagPlacement {
	TOP = "top",
	BOTTOM = "bottom",
	FRONTMATTER = "frontmatter"
}

export default class SelectorModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly plugin: QuizGenerator;
	private notePaths: string[];
	private folderPaths: string[];
	private readonly selectedNotes: Map<string, string> = new Map<string, string>();
	private readonly selectedNoteFiles: Map<string, TFile[]> = new Map<string, TFile[]>();
	private readonly itemContainer: HTMLDivElement;
	private readonly tokenContainer: HTMLSpanElement;
	private promptTokens: number = 0;
	private readonly buttonMap: Record<SelectorModalButton, HTMLButtonElement>;
	private quiz: QuizModalLogic | undefined;
	private autoTagEnabled: boolean = false;
	private autoTags: string = "";
	private tagPlacement: TagPlacement = TagPlacement.FRONTMATTER;
	private autoTagContainer: HTMLDivElement | null = null;
	private searchContainer: HTMLDivElement | null = null;
	private searchResultsContainer: HTMLDivElement | null = null;
	private selectedFilesContainer: HTMLDivElement | null = null;
	private advancedFiltersContainer: HTMLDivElement | null = null;
	private actionLink: HTMLAnchorElement | null = null;
	private removeTagsCheckbox: HTMLInputElement | null = null;
	private clearSearchBtn: HTMLAnchorElement | null = null;
	private showAdvanced: boolean = false;
	private searchQuery: string = "";
	private filterTag: string = "";
	private filterFolder: string = "";
	private filterDate: string = "any";
	private removeFilteredTags: boolean = false;
	private filteredTagsToRemove: Set<string> = new Set();
	private autoSelectMatching: boolean = false;
	private currentLoadedBookmarkId: string | null = null;

	constructor(app: App, plugin: QuizGenerator, initialFiles?: TFile[], bookmarkId?: string) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "Escape", () => this.close());

		this.modalEl.addClass("modal-qg");
		this.contentEl.addClass("modal-content-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Select Notes for Quiz");

		// Search bar
		this.renderSearchBar();

		// Main container with divider
		this.itemContainer = this.contentEl.createDiv("item-container-qg");
		
		// Search results section (above divider)
		this.searchResultsContainer = this.itemContainer.createDiv("search-results-section-qg");
		this.searchResultsContainer.style.display = "none";
		
		// Divider with action link
		const divider = this.itemContainer.createDiv("selection-divider-qg");
		divider.createEl("span", { text: "Selected Notes" });
		
		// Add action link (either "Deselect all" or "Reset filters")
		this.actionLink = divider.createEl("a", { 
			cls: "selection-action-link-qg",
			text: "Deselect all"
		});
		this.actionLink.addEventListener("click", () => {
			this.handleActionLinkClick();
		});
		
		// Selected files section (below divider)
		this.selectedFilesContainer = this.itemContainer.createDiv("selected-files-section-qg");
		
		// Auto-tagging UI
		this.renderAutoTagUI();

		this.tokenContainer = this.contentEl.createSpan("prompt-tokens-qg");
		this.tokenContainer.textContent = `0 notes selected  •  Prompt tokens: ${this.promptTokens}`;
		this.buttonMap = this.activateButtons();

		// Add initial files if provided
		if (initialFiles && initialFiles.length > 0) {
			this.addInitialFiles(initialFiles);
		}
		
		// Auto-load bookmark if provided
		if (bookmarkId) {
			this.loadBookmarkedSearchOnOpen(bookmarkId);
		}
	}

	public onOpen(): void {
		super.onOpen();
		this.toggleButtons([SelectorModalButton.QUIZ, SelectorModalButton.GENERATE], true);
		this.updateActionLink();
	}

	private activateButtons(): Record<SelectorModalButton, HTMLButtonElement> {
		const buttonContainer = this.contentEl.createDiv("modal-button-container-qg");
		const openQuizButton = buttonContainer.createEl("button", "modal-button-qg");
		const generateQuizButton = buttonContainer.createEl("button", "modal-button-qg");
		const buttonMap: Record<SelectorModalButton, HTMLButtonElement> = {
			[SelectorModalButton.CLEAR]: generateQuizButton, // Placeholder to maintain enum structure
			[SelectorModalButton.QUIZ]: openQuizButton,
			[SelectorModalButton.FILTER]: generateQuizButton, // Reusing enum
			[SelectorModalButton.GENERATE]: generateQuizButton,
		};

		setIconAndTooltip(openQuizButton, "scroll-text", "Open quiz");
		setIconAndTooltip(generateQuizButton, "webhook", "Generate");
		const openQuizHandler = async (): Promise<void> => await this.quiz?.renderQuiz();
		const generateQuizHandler = async (): Promise<void> => {
			if (!this.validGenerationSettings()) {
				new Notice("Invalid generation settings or prompt contains 0 tokens");
				return;
			}

			this.toggleButtons([SelectorModalButton.GENERATE], true);

			try {
				// Remove filtered tags if enabled
				if (this.removeFilteredTags && this.filteredTagsToRemove.size > 0) {
					await this.removeTagsFromNotes();
				}
				
				// Apply auto-tags if enabled
				if (this.autoTagEnabled && this.autoTags.trim()) {
					await this.applyAutoTags();
				}

				new Notice("Generating...");
				const generator = GeneratorFactory.createInstance(this.settings);
				const generatedQuestions = await generator.generateQuiz([...this.selectedNotes.values()]);
				if (generatedQuestions === null) {
					this.toggleButtons([SelectorModalButton.GENERATE], false);
					new Notice("Error: Generation returned nothing");
					return;
				}

				const quiz: Quiz = JSON.parse(generatedQuestions.replace(/\\+/g, "\\\\"));
				const questions: Question[] = [];
				quiz.questions.forEach(question => {
					if (isTrueFalse(question)) {
						questions.push(question);
					} else if (isMultipleChoice(question)) {
						questions.push(question);
					} else if (isSelectAllThatApply(question)) {
						questions.push(question);
					} else if (isFillInTheBlank(question)) {
						const normalizeBlanks = (str: string): string => {
							return this.settings.provider !== Provider.COHERE ? str : str.replace(/_{2,}|\$_{2,}\$/g, "`____`");
						};
						questions.push({ question: normalizeBlanks(question.question), answer: question.answer });
					} else if (isMatching(question)) {
						questions.push(question);
					} else if (isShortOrLongAnswer(question)) {
						questions.push(question);
					} else {
						new Notice("A question was generated incorrectly");
					}
				});

				this.quiz = new QuizModalLogic(this.app, this.settings, questions, [...this.selectedNoteFiles.values()].flat());
				await this.quiz.renderQuiz();
				this.toggleButtons([SelectorModalButton.QUIZ], false);
			} catch (error) {
				new Notice((error as Error).message, 0);
			} finally {
				this.toggleButtons([SelectorModalButton.GENERATE], false);
			}
		};

		openQuizButton.addEventListener("click", openQuizHandler);
		generateQuizButton.addEventListener("click", generateQuizHandler);

		return buttonMap;
	}

	private handleActionLinkClick(): void {
		if (this.autoSelectMatching) {
			// Reset filters
			this.resetFilters();
		} else {
			// Deselect all
			this.selectedNotes.clear();
			this.selectedNoteFiles.clear();
			this.selectedFilesContainer?.empty();
			this.updatePromptTokens(0);
			this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
			this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
			this.updateActionLink();
		}
	}

	private updateActionLink(): void {
		if (!this.actionLink) return;

		this.actionLink.textContent = this.autoSelectMatching ? "Reset filters" : "Deselect all";
	}

	private updateRemoveTagsCheckboxState(): void {
		if (!this.removeTagsCheckbox) return;

		const hasTags = this.filterTag.trim().length > 0;
		this.removeTagsCheckbox.disabled = !hasTags;
		
		// If disabling and it was checked, uncheck it and clear the filtered tags
		if (!hasTags && this.removeFilteredTags) {
			this.removeFilteredTags = false;
			this.removeTagsCheckbox.checked = false;
			this.filteredTagsToRemove.clear();
		}
	}

	private hasActiveFilters(): boolean {
		return this.searchQuery.trim() !== "" ||
			this.filterTag !== "" ||
			this.filterFolder !== "" ||
			this.filterDate !== "any" ||
			this.autoTagEnabled;
	}

	private updateClearButtonVisibility(): void {
		if (!this.clearSearchBtn) return;
		this.clearSearchBtn.style.display = this.hasActiveFilters() ? "block" : "none";
	}

	private renderSearchBar(): void {
		// Clear existing search container if it exists
		if (this.searchContainer) {
			this.searchContainer.empty();
		} else {
			this.searchContainer = this.contentEl.createDiv("search-container-qg");
		}
		
		// Input group with search input and buttons inline
		const searchInputGroup = this.searchContainer.createDiv("search-input-group-qg");
		
		// Wrapper for search input with clear button
		const searchInputWrapper = searchInputGroup.createDiv("search-input-wrapper-qg");
		
		const searchInput = searchInputWrapper.createEl("input", {
			type: "text",
			placeholder: "Search notes...",
			cls: "search-input-qg",
			value: this.searchQuery
		});
		
		// Clear button inside search input
		this.clearSearchBtn = searchInputWrapper.createEl("a", {
			cls: "search-clear-btn-qg",
			text: "×"
		});
		this.clearSearchBtn.setAttribute("title", "Clear all filters");
		this.updateClearButtonVisibility();
		
		this.clearSearchBtn.addEventListener("click", () => {
			this.resetFilters();
		});
		
		searchInput.addEventListener("input", async (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.updateClearButtonVisibility();
			await this.performSearch();
		});
		
		// Buttons inline with input
		const inputButtons = searchInputGroup.createDiv("search-input-buttons-qg");
		
		// Load saved search button (if bookmarks exist)
		if (this.settings.bookmarkedFilters.length > 0) {
			const loadBtn = inputButtons.createEl("button", {
				cls: "search-inline-btn-qg"
			});
			setIconAndTooltip(loadBtn, "folder-open", "Load saved search");
			
			loadBtn.addEventListener("click", () => {
				const modal = new LoadSearchModal(this.app, this.settings.bookmarkedFilters, (bookmarkId: string) => {
					this.loadBookmarkedSearch(bookmarkId);
				}, this.plugin, this.settings);
				modal.open();
			});
		}
		
		// Save button
		const saveBtn = inputButtons.createEl("button", {
			cls: "search-inline-btn-qg"
		});
		setIconAndTooltip(saveBtn, "bookmark-plus", "Save current search");
		
		saveBtn.addEventListener("click", () => {
			this.showBookmarkDialog();
		});
		
		// Secondary row for advanced link only
		const secondaryRow = this.searchContainer.createDiv("search-secondary-row-qg");
		
		// Advanced link
		const advancedLink = secondaryRow.createEl("a", {
			text: "Advanced",
			cls: "advanced-toggle-link-qg"
		});
		
		advancedLink.addEventListener("click", (e) => {
			e.preventDefault();
			this.showAdvanced = !this.showAdvanced;
			advancedLink.textContent = this.showAdvanced ? "Hide Advanced" : "Advanced";
			this.toggleAdvancedFilters();
		});
		
		// Advanced filters container (initially hidden)
		this.advancedFiltersContainer = this.searchContainer.createDiv("advanced-filters-qg");
		this.advancedFiltersContainer.style.display = "none";
		this.renderAdvancedFilters();
	}

	private async performSearch(): Promise<void> {
		// If no search query and no advanced filters, hide results
		if (!this.searchQuery.trim() && !this.filterTag && !this.filterFolder && this.filterDate === "any") {
			this.searchResultsContainer!.style.display = "none";
			this.searchResultsContainer!.empty();
			return;
		}

		// If auto-select is enabled, clear current selections when criteria changes
		if (this.autoSelectMatching) {
			this.selectedNotes.clear();
			this.selectedNoteFiles.clear();
			this.selectedFilesContainer?.empty();
			this.updatePromptTokens(0);
		}

		const allFiles = this.app.vault.getMarkdownFiles();
		const query = this.searchQuery.toLowerCase();
		
		const matchingFiles = allFiles.filter(file => {
			// Skip already selected files (only relevant when auto-select is off)
			if (!this.autoSelectMatching && this.selectedNoteFiles.has(file.path)) return false;
			
			// Text search filter
			const matchesQuery = !this.searchQuery.trim() || 
				file.basename.toLowerCase().includes(query) ||
				file.path.toLowerCase().includes(query);
			
			if (!matchesQuery) return false;
			
			// Tag filter (supports multiple comma-separated tags)
			if (this.filterTag) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache) return false;
				
				// Parse multiple tags separated by commas
				const searchTags = this.filterTag
					.split(',')
					.map(tag => tag.trim())
					.filter(tag => tag.length > 0)
					.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
				
				const fileTags = this.getAllTagsFromCache(cache);
				
				// File must have at least one of the search tags
				const hasMatchingTag = searchTags.some(searchTag => 
					fileTags.some(fileTag => fileTag.toLowerCase().includes(searchTag.toLowerCase()))
				);
				
				if (!hasMatchingTag) {
					return false;
				}
			}
			
			// Folder filter
			if (this.filterFolder) {
				if (!file.path.toLowerCase().includes(this.filterFolder.toLowerCase())) {
					return false;
				}
			}
			
			// Date filter
			if (this.filterDate !== "any") {
				if (this.filterDate === "last-quiz") {
					// Filter by last quiz generation time
					const lastQuizDate = this.getLastQuizGenerationDate();
					if (!lastQuizDate || new Date(file.stat.mtime) < lastQuizDate) {
						return false;
					}
				} else {
					// Filter by days
					const days = parseInt(this.filterDate);
					const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
					if (new Date(file.stat.mtime) < daysAgo) {
						return false;
					}
				}
			}
			
			return true;
		});

		// Auto-select all matching files if enabled
		if (this.autoSelectMatching && matchingFiles.length > 0) {
			for (const file of matchingFiles) {
				await this.addFileToSelection(file);
				
				// Track filtered tags for removal if enabled (supports multiple tags)
				if (this.filterTag && this.removeFilteredTags) {
					const tags = this.filterTag
						.split(',')
						.map(tag => tag.trim())
						.filter(tag => tag.length > 0)
						.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
					tags.forEach(tag => this.filteredTagsToRemove.add(tag));
				}
			}
		}

		// Display search results (limit to first 20 for UI)
		const displayFiles = this.autoSelectMatching ? [] : matchingFiles.slice(0, 20);
		
		this.searchResultsContainer!.empty();
		
		if (this.autoSelectMatching && matchingFiles.length > 0) {
			// Show message when auto-selecting
			this.searchResultsContainer!.style.display = "block";
			const header = this.searchResultsContainer!.createDiv("search-results-header-qg");
			header.textContent = `Auto-selected ${matchingFiles.length} note${matchingFiles.length !== 1 ? 's' : ''} matching criteria`;
		} else if (!this.autoSelectMatching && displayFiles.length > 0) {
			// Only show "Click notes below" message when auto-select is OFF
			this.searchResultsContainer!.style.display = "block";
			
			// Add header message
			const header = this.searchResultsContainer!.createDiv("search-results-header-qg");
			header.textContent = "Click notes below to add them to your selection:";
			
			displayFiles.forEach(file => {
				const resultItem = this.searchResultsContainer!.createDiv("search-result-item-qg");
				
				const fileName = resultItem.createDiv("search-result-name-qg");
				fileName.setText(file.basename);
				
				const filePath = resultItem.createDiv("search-result-path-qg");
				filePath.setText(file.parent?.path || "/");
				
				resultItem.addEventListener("click", async () => {
					await this.addFileToSelection(file);
					
					// Track filtered tags for removal if enabled (supports multiple tags)
					if (this.filterTag && this.removeFilteredTags) {
						const tags = this.filterTag
							.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0)
							.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
						tags.forEach(tag => this.filteredTagsToRemove.add(tag));
					}
					
					await this.performSearch(); // Refresh search results
				});
			});
		} else {
			this.searchResultsContainer!.style.display = "none";
		}
	}

	private getLastQuizGenerationDate(): Date | null {
		try {
			// Get quiz folder path from settings
			const quizFolderPath = this.settings.savePath;
			
			// Get all markdown files in the quiz folder
			const allFiles = this.app.vault.getMarkdownFiles();
			const quizFiles = allFiles.filter(file => {
				// Check if file is in the quiz folder
				const normalizedPath = quizFolderPath === "/" ? "" : quizFolderPath;
				return file.path.startsWith(normalizedPath);
			});
			
			if (quizFiles.length === 0) {
				return null;
			}
			
			// Find the most recently created quiz file
			let mostRecentDate: number | null = null;
			quizFiles.forEach(file => {
				const createdTime = file.stat.ctime;
				if (mostRecentDate === null || createdTime > mostRecentDate) {
					mostRecentDate = createdTime;
				}
			});
			
			return mostRecentDate ? new Date(mostRecentDate) : null;
		} catch (error) {
			console.error("Error getting last quiz generation date:", error);
			return null;
		}
	}

	private getAllTagsFromCache(cache: any): string[] {
		const tags: string[] = [];

		// Get tags from frontmatter
		if (cache.frontmatter?.tags) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				tags.push(...fmTags.map((tag: string) => tag.startsWith("#") ? tag : `#${tag}`));
			} else if (typeof fmTags === "string") {
				tags.push(fmTags.startsWith("#") ? fmTags : `#${fmTags}`);
			}
		}

		// Get inline tags
		if (cache.tags) {
			tags.push(...cache.tags.map((tagCache: any) => tagCache.tag));
		}

		return tags;
	}

	private toggleAdvancedFilters(): void {
		if (this.advancedFiltersContainer) {
			this.advancedFiltersContainer.style.display = this.showAdvanced ? "block" : "none";
		}
	}

	private resetFilters(): void {
		// Reset search and filters
		this.searchQuery = "";
		this.filterTag = "";
		this.filterFolder = "";
		this.filterDate = "any";
		this.removeFilteredTags = false;
		this.filteredTagsToRemove.clear();
		this.showAdvanced = false;
		this.autoSelectMatching = false;
		
		// Reset auto-tag settings
		this.autoTagEnabled = false;
		this.autoTags = "";
		this.tagPlacement = TagPlacement.FRONTMATTER;
		
		// Clear all selected notes
		this.selectedNotes.clear();
		this.selectedNoteFiles.clear();
		this.selectedFilesContainer?.empty();
		this.updatePromptTokens(0);
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		
		// Clear search results
		if (this.searchResultsContainer) {
			this.searchResultsContainer.empty();
			this.searchResultsContainer.style.display = "none";
		}
		
		// Re-render the search bar and auto-tag UI
		this.renderSearchBar();
		this.renderAutoTagUI();
		
		// Update action link text
		this.updateActionLink();
		
		new Notice("Filters cleared");
	}

	private renderAdvancedFilters(): void {
		const filterGroup = this.advancedFiltersContainer!.createDiv("filter-group-compact-qg");
		
		// Tag filter
		const tagRow = filterGroup.createDiv("filter-row-compact-qg");
		tagRow.createSpan({ text: "Tag", cls: "filter-label-compact-qg" });
		const tagInput = tagRow.createEl("input", {
			type: "text",
			placeholder: "#tag1, #tag2",
			cls: "filter-input-compact-qg",
			value: this.filterTag
		});
		tagInput.addEventListener("input", async (e) => {
			this.filterTag = (e.target as HTMLInputElement).value;
			this.updateRemoveTagsCheckboxState();
			this.updateClearButtonVisibility();
			await this.performSearch();
		});
		
		// Folder filter
		const folderRow = filterGroup.createDiv("filter-row-compact-qg");
		folderRow.createSpan({ text: "Folder", cls: "filter-label-compact-qg" });
		const folderInput = folderRow.createEl("input", {
			type: "text",
			placeholder: "folder/path",
			cls: "filter-input-compact-qg",
			value: this.filterFolder
		});
		folderInput.addEventListener("input", async (e) => {
			this.filterFolder = (e.target as HTMLInputElement).value;
			this.updateClearButtonVisibility();
			await this.performSearch();
		});
		
		// Date filter
		const dateRow = filterGroup.createDiv("filter-row-compact-qg");
		dateRow.createSpan({ text: "Modified", cls: "filter-label-compact-qg" });
		const dateSelect = dateRow.createEl("select", { cls: "filter-select-compact-qg" });
		[
			{ value: "any", label: "Any time" },
			{ value: "last-quiz", label: "Last quiz was generated" },
			{ value: "1", label: "Last 24 hours" },
			{ value: "7", label: "Last 7 days" },
			{ value: "30", label: "Last 30 days" },
			{ value: "365", label: "Last year" }
		].forEach(opt => {
			const option = dateSelect.createEl("option", { text: opt.label });
			option.value = opt.value;
			if (opt.value === this.filterDate) {
				option.selected = true;
			}
		});
		dateSelect.addEventListener("change", async (e) => {
			this.filterDate = (e.target as HTMLSelectElement).value;
			this.updateClearButtonVisibility();
			await this.performSearch();
		});
		
		// Remove filtered tags option
		const removeTagsRow = filterGroup.createDiv("filter-row-compact-qg");
		this.removeTagsCheckbox = removeTagsRow.createEl("input", { type: "checkbox", cls: "filter-checkbox-compact-qg" });
		this.removeTagsCheckbox.checked = this.removeFilteredTags;
		this.removeTagsCheckbox.addEventListener("change", (e) => {
			this.removeFilteredTags = (e.target as HTMLInputElement).checked;
		});
		removeTagsRow.createSpan({ text: "Remove filtered tags from notes upon generation", cls: "filter-checkbox-label-qg" });
		
		// Set initial disabled state based on whether there are tags
		this.updateRemoveTagsCheckboxState();
		
		// Auto-select matching option
		const autoSelectRow = filterGroup.createDiv("filter-row-compact-qg");
		const autoSelectCheckbox = autoSelectRow.createEl("input", { type: "checkbox", cls: "filter-checkbox-compact-qg" });
		autoSelectCheckbox.checked = this.autoSelectMatching;
		autoSelectCheckbox.addEventListener("change", async (e) => {
			this.autoSelectMatching = (e.target as HTMLInputElement).checked;
			this.updateActionLink();
			if (this.autoSelectMatching) {
				// When enabled, apply auto-selection immediately
				await this.performSearch();
			}
		});
		autoSelectRow.createSpan({ text: "Auto-select all that match criteria", cls: "filter-checkbox-label-qg" });
	}


	private renderNote(note: TFile): void {
		const tokens = this.renderNoteOrFolder(note, this.settings.showNotePath ? note.path : note.basename);
		this.toggleButtons([SelectorModalButton.GENERATE], false);
		this.updatePromptTokens(this.promptTokens + tokens);
	}

	private renderNoteOrFolder(item: TFile | TFolder, fileName: string): number {
		const itemContainer = this.selectedFilesContainer!.createDiv("item-qg");
		itemContainer.textContent = fileName;

		const tokensElement = itemContainer.createDiv("item-tokens-qg");
		const tokens = countNoteTokens(this.selectedNotes.get(item.path)!);
		tokensElement.textContent = tokens + " tokens";

		const viewContentsButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(viewContentsButton, "eye", "View contents");
		viewContentsButton.addEventListener("click", async (): Promise<void> => {
			if (item instanceof TFile) {
				new NoteViewerModal(this.app, item, this.modalEl).open();
			} else {
				new FolderViewerModal(this.app, this.settings, this.modalEl, item).open();
			}
		});

		const removeButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(removeButton, "x", "Remove");
		removeButton.addEventListener("click", (): void => {
			this.removeNoteOrFolder(item, itemContainer);
			this.updatePromptTokens(this.promptTokens - tokens);

			if (this.selectedNotes.size === 0) {
				this.toggleButtons([SelectorModalButton.GENERATE], true);
			}
		});

		return tokens;
	}

	private removeNoteOrFolder(item: TFile | TFolder, element: HTMLDivElement): void {
		this.selectedNotes.delete(item.path);
		this.selectedNoteFiles.delete(item.path);
		this.selectedFilesContainer!.removeChild(element);
		item instanceof TFile ? this.notePaths.push(item.path) : this.folderPaths.push(item.path);
	}

	private toggleButtons(buttons: SelectorModalButton[], disabled: boolean): void {
		buttons.forEach(button => this.buttonMap[button].disabled = disabled);
	}

	private updatePromptTokens(tokens: number): void {
		this.promptTokens = tokens;
		const noteCount = this.selectedNotes.size;
		
		// Clear and rebuild the container with clickable note count
		this.tokenContainer.empty();
		
		// Clickable note count
		const noteCountEl = this.tokenContainer.createEl("span", {
			cls: "note-count-clickable-qg",
			text: `${noteCount} note${noteCount !== 1 ? 's' : ''} selected`
		});
		noteCountEl.setAttribute("title", "Click to scroll to selected notes");
		noteCountEl.addEventListener("click", () => {
			this.scrollToSelectedNotes();
		});
		
		// Separator and token count
		this.tokenContainer.createEl("span", {
			text: `  •  Prompt tokens: ${this.promptTokens}`
		});
	}
	
	private scrollToSelectedNotes(): void {
		if (this.selectedFilesContainer) {
			this.selectedFilesContainer.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}

	private validGenerationSettings(): boolean {
		return (this.settings.generateTrueFalse || this.settings.generateMultipleChoice ||
			this.settings.generateSelectAllThatApply || this.settings.generateFillInTheBlank ||
			this.settings.generateMatching || this.settings.generateShortAnswer || this.settings.generateLongAnswer) &&
			this.promptTokens > 0;
	}

	private renderAutoTagUI(): void {
		// Clear existing container if it exists
		if (this.autoTagContainer) {
			this.autoTagContainer.empty();
		} else {
			this.autoTagContainer = this.contentEl.createDiv("auto-tag-container-qg");
		}
		
		const compactRow = this.autoTagContainer.createDiv("auto-tag-compact-row-qg");
		
		// Toggle
		const toggleLabel = compactRow.createSpan({ text: "Auto-tag", cls: "auto-tag-label-qg" });
		const toggleEl = compactRow.createEl("input", { type: "checkbox", cls: "auto-tag-checkbox-qg" });
		toggleEl.checked = this.autoTagEnabled;
		toggleEl.addEventListener("change", () => {
			this.autoTagEnabled = toggleEl.checked;
			this.updateClearButtonVisibility();
			this.renderAutoTagOptions();
		});

		this.renderAutoTagOptions();
	}

	private renderAutoTagOptions(): void {
		// Remove existing options if any
		const existingOptions = this.autoTagContainer?.querySelector(".auto-tag-options-qg");
		if (existingOptions) {
			existingOptions.remove();
		}

		if (!this.autoTagEnabled) {
			return;
		}

		const optionsContainer = this.autoTagContainer!.createDiv("auto-tag-options-qg");
		
		const tagsInput = optionsContainer.createEl("input", { 
			type: "text",
			placeholder: "quiz, studied",
			cls: "auto-tag-input-qg"
		});
		tagsInput.value = this.autoTags;
		tagsInput.addEventListener("input", (e) => {
			this.autoTags = (e.target as HTMLInputElement).value;
		});
		
		const placementSelect = optionsContainer.createEl("select", { cls: "auto-tag-select-qg" });
		[
			{ value: TagPlacement.FRONTMATTER, label: "Frontmatter" },
			{ value: TagPlacement.TOP, label: "Top" },
			{ value: TagPlacement.BOTTOM, label: "Bottom" }
		].forEach(option => {
			const opt = placementSelect.createEl("option", { value: option.value, text: option.label });
			if (option.value === this.tagPlacement) opt.selected = true;
		});
		placementSelect.addEventListener("change", (e) => {
			this.tagPlacement = (e.target as HTMLSelectElement).value as TagPlacement;
		});
	}

	private showBookmarkDialog(): void {
		// Pre-populate with current bookmark name if one is loaded
		let initialName = "";
		if (this.currentLoadedBookmarkId) {
			const bookmark = this.settings.bookmarkedFilters.find(b => b.id === this.currentLoadedBookmarkId);
			if (bookmark) {
				initialName = bookmark.name;
			}
		}
		
		const modal = new BookmarkNameModal(this.app, async (name: string) => {
			if (name && name.trim()) {
				await this.saveCurrentSearchAsBookmark(name.trim());
			}
		}, initialName);
		modal.open();
	}

	private async saveCurrentSearchAsBookmark(name: string): Promise<void> {
		// Check if we have any active filters
		if (!this.searchQuery && !this.filterTag && !this.filterFolder && this.filterDate === "any") {
			new Notice("Please enter a search query or advanced filter before saving");
			return;
		}

		// Check for duplicate name
		const existingBookmark = this.settings.bookmarkedFilters.find(b => b.name === name);
		if (existingBookmark) {
			const modal = new ConfirmOverwriteModal(this.app, name, async () => {
				// Update existing bookmark
				existingBookmark.searchQuery = this.searchQuery;
				existingBookmark.filterTag = this.filterTag;
				existingBookmark.filterFolder = this.filterFolder;
				existingBookmark.filterDate = this.filterDate;
				existingBookmark.autoTagEnabled = this.autoTagEnabled;
				existingBookmark.autoTags = this.autoTags;
				existingBookmark.tagPlacement = this.tagPlacement;
				existingBookmark.removeFilteredTags = this.removeFilteredTags;
				existingBookmark.autoSelectMatching = this.autoSelectMatching;
				existingBookmark.updatedAt = Date.now();
				
				await this.plugin.saveSettings();
				new Notice(`Updated bookmark "${name}"`);
				this.renderSearchBar();
			});
			modal.open();
			return;
		}

		const bookmark = {
			id: Date.now().toString(),
			name: name,
			searchQuery: this.searchQuery,
			filterTag: this.filterTag,
			filterFolder: this.filterFolder,
			filterDate: this.filterDate,
			autoTagEnabled: this.autoTagEnabled,
			autoTags: this.autoTags,
			tagPlacement: this.tagPlacement,
			removeFilteredTags: this.removeFilteredTags,
			autoSelectMatching: this.autoSelectMatching,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.settings.bookmarkedFilters.push(bookmark as any);
		await this.plugin.saveSettings();
		new Notice(`Search saved as "${name}"`);
		
		// Refresh the search bar to show the new bookmark
		this.renderSearchBar();
	}

	private loadBookmarkedSearchOnOpen(bookmarkId: string): void {
		// Delay until modal is fully opened
		setTimeout(() => {
			this.loadBookmarkedSearch(bookmarkId);
		}, 50);
	}

	private loadBookmarkedSearch(bookmarkId: string): void {
		const bookmark = this.settings.bookmarkedFilters.find(b => b.id === bookmarkId);
		if (!bookmark) return;

		// Track the currently loaded bookmark
		this.currentLoadedBookmarkId = bookmarkId;

		// Load the search parameters
		const bmData = bookmark as any;
		this.searchQuery = bmData.searchQuery || "";
		this.filterTag = bmData.filterTag || "";
		this.filterFolder = bmData.filterFolder || "";
		this.filterDate = bmData.filterDate || "any";
		
		// Load auto-tag settings
		this.autoTagEnabled = bmData.autoTagEnabled || false;
		this.autoTags = bmData.autoTags || "";
		this.tagPlacement = bmData.tagPlacement || TagPlacement.FRONTMATTER;
		
		// Load remove tag settings
		this.removeFilteredTags = bmData.removeFilteredTags || false;
		
		// Load auto-select settings
		this.autoSelectMatching = bmData.autoSelectMatching || false;

		// Update the UI to reflect loaded values
		this.renderSearchBar();
		this.renderAutoTagUI();
		
		// If there are advanced filters, show them
		if (this.filterTag || this.filterFolder || this.filterDate !== "any") {
			this.showAdvanced = true;
			this.toggleAdvancedFilters();
		}

		// Perform the search
		this.performSearch();
		
		new Notice(`Loaded search: ${bookmark.name}`);
	}

	private async addInitialFiles(files: TFile[]): Promise<void> {
		for (const file of files) {
			await this.addFileToSelection(file);
		}
	}

	private async addFileToSelection(file: TFile): Promise<void> {
		if (this.selectedNoteFiles.has(file.path)) {
			return; // Already added
		}

		this.notePaths = this.notePaths.filter(notePath => notePath !== file.path);
		const noteContents = await this.app.vault.cachedRead(file);
		this.selectedNotes.set(file.path, cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists));
		this.selectedNoteFiles.set(file.path, [file]);
		this.renderNote(file);
	}

	private async applyAutoTags(): Promise<void> {
		const tags = this.autoTags
			.split(",")
			.map(tag => tag.trim())
			.filter(tag => tag.length > 0)
			.map(tag => tag.startsWith("#") ? tag : `#${tag}`);

		if (tags.length === 0) {
			return;
		}

		const allFiles = [...this.selectedNoteFiles.values()].flat();
		const uniqueFiles = Array.from(new Set(allFiles.map(f => f.path))).map(path => 
			allFiles.find(f => f.path === path)!
		);

		for (const file of uniqueFiles) {
			try {
				await this.addTagsToFile(file, tags);
			} catch (error) {
				console.error(`Failed to tag file ${file.path}:`, error);
				new Notice(`Failed to tag ${file.basename}`);
			}
		}

		new Notice(`Tagged ${uniqueFiles.length} note(s)`);
	}

	private async addTagsToFile(file: TFile, tags: string[]): Promise<void> {
		const content = await this.app.vault.read(file);
		let newContent: string;

		if (this.tagPlacement === TagPlacement.FRONTMATTER) {
			newContent = this.addTagsToFrontmatter(content, tags);
		} else if (this.tagPlacement === TagPlacement.TOP) {
			newContent = this.addTagsToTop(content, tags);
		} else {
			newContent = this.addTagsToBottom(content, tags);
		}

		if (newContent !== content) {
			await this.app.vault.modify(file, newContent);
		}
	}

	private addTagsToFrontmatter(content: string, tags: string[]): string {
		const fmInfo = getFrontMatterInfo(content);
		
		if (!fmInfo.exists) {
			// Create new frontmatter
			const frontmatter = `---\ntags: [${tags.join(", ")}]\n---\n\n`;
			return frontmatter + content;
		}

		// Parse existing frontmatter
		const lines = content.split("\n");
		const fmEnd = fmInfo.contentStart! - 1;
		let tagLineIndex = -1;
		let existingTags: string[] = [];

		// Find existing tags line
		for (let i = 1; i < fmEnd; i++) {
			const line = lines[i].trim();
			if (line.startsWith("tags:")) {
				tagLineIndex = i;
				const tagsPart = line.substring(5).trim();
				
				// Parse different tag formats
				if (tagsPart.startsWith("[") && tagsPart.includes("]")) {
					// Array format: tags: [tag1, tag2]
					const match = tagsPart.match(/\[(.*?)\]/);
					if (match) {
						existingTags = match[1].split(",").map(t => t.trim()).filter(t => t);
					}
				} else {
					// Simple format: tags: tag1
					existingTags = [tagsPart];
				}
				break;
			}
		}

		// Combine tags (avoiding duplicates)
		const tagsWithoutHash = tags.map(t => t.replace(/^#/, ""));
		const existingTagsWithoutHash = existingTags.map(t => t.replace(/^#/, ""));
		const allTags = Array.from(new Set([...existingTagsWithoutHash, ...tagsWithoutHash]));

		if (tagLineIndex >= 0) {
			// Replace existing tags line
			lines[tagLineIndex] = `tags: [${allTags.join(", ")}]`;
		} else {
			// Add tags line after opening ---
			lines.splice(1, 0, `tags: [${allTags.join(", ")}]`);
		}

		return lines.join("\n");
	}

	private addTagsToTop(content: string, tags: string[]): string {
		const fmInfo = getFrontMatterInfo(content);
		const tagLine = tags.join(" ") + "\n\n";
		
		if (fmInfo.exists) {
			// Add after frontmatter
			const lines = content.split("\n");
			const insertIndex = fmInfo.contentStart!;
			lines.splice(insertIndex, 0, tagLine);
			return lines.join("\n");
		} else {
			// Add at very top
			return tagLine + content;
		}
	}

	private addTagsToBottom(content: string, tags: string[]): string {
		const tagLine = "\n\n" + tags.join(" ");
		return content.trimEnd() + tagLine;
	}

	private async removeTagsFromNotes(): Promise<void> {
		const tagsToRemove = Array.from(this.filteredTagsToRemove);
		const allFiles = [...this.selectedNoteFiles.values()].flat();
		const uniqueFiles = Array.from(new Set(allFiles.map(f => f.path))).map(path => 
			allFiles.find(f => f.path === path)!
		);

		for (const file of uniqueFiles) {
			try {
				await this.removeTagsFromFile(file, tagsToRemove);
			} catch (error) {
				console.error(`Failed to remove tags from file ${file.path}:`, error);
			}
		}

		new Notice(`Removed filtered tags from ${uniqueFiles.length} note(s)`);
	}

	private async removeTagsFromFile(file: TFile, tags: string[]): Promise<void> {
		let content = await this.app.vault.read(file);
		let modified = false;

		// Remove from frontmatter
		const fmInfo = getFrontMatterInfo(content);
		if (fmInfo.exists) {
			const lines = content.split("\n");
			const fmEnd = fmInfo.contentStart! - 1;
			
			for (let i = 1; i < fmEnd; i++) {
				const line = lines[i].trim();
				if (line.startsWith("tags:")) {
					const tagsPart = line.substring(5).trim();
					let existingTags: string[] = [];
					
					if (tagsPart.startsWith("[") && tagsPart.includes("]")) {
						const match = tagsPart.match(/\[(.*?)\]/);
						if (match) {
							existingTags = match[1].split(",").map(t => t.trim()).filter(t => t);
						}
					} else {
						existingTags = [tagsPart];
					}
					
					const tagsWithoutHash = tags.map(t => t.replace(/^#/, "").toLowerCase());
					const filteredTags = existingTags.filter(t => 
						!tagsWithoutHash.includes(t.replace(/^#/, "").toLowerCase())
					);
					
					if (filteredTags.length !== existingTags.length) {
						if (filteredTags.length > 0) {
							lines[i] = `tags: [${filteredTags.join(", ")}]`;
						} else {
							lines.splice(i, 1);
						}
						content = lines.join("\n");
						modified = true;
					}
					break;
				}
			}
		}

		// Remove inline tags from content
		for (const tag of tags) {
			const tagPattern = new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
			const newContent = content.replace(tagPattern, ' ');
			if (newContent !== content) {
				content = newContent;
				modified = true;
			}
		}

		if (modified) {
			await this.app.vault.modify(file, content.replace(/\n{3,}/g, '\n\n').trim() + '\n');
		}
	}
}

// Simple modal for entering bookmark name
class BookmarkNameModal extends Modal {
	private result: string = "";
	private onSubmit: (result: string) => void;
	private initialValue: string;

	constructor(app: App, onSubmit: (result: string) => void, initialValue: string = "") {
		super(app);
		this.onSubmit = onSubmit;
		this.initialValue = initialValue;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl("h2", { text: "Save Search" });
		
		const inputContainer = contentEl.createDiv();
		inputContainer.createEl("label", { text: "Bookmark Name:" });
		
		const input = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Enter a name for this search...",
			value: this.initialValue
		});
		input.style.width = "100%";
		input.style.marginTop = "10px";
		input.style.padding = "8px";
		
		// Focus input on open and select text if there's an initial value
		setTimeout(() => {
			input.focus();
			if (this.initialValue) {
				input.select();
			}
		}, 10);
		
		// Handle Enter key
		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.result = input.value;
				this.close();
				this.onSubmit(this.result);
			}
		});
		
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.marginTop = "20px";
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.justifyContent = "flex-end";
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		
		const saveBtn = buttonContainer.createEl("button", { text: "Save" });
		saveBtn.classList.add("mod-cta");
		saveBtn.addEventListener("click", () => {
			this.result = input.value;
			this.close();
			this.onSubmit(this.result);
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for confirming overwrite of existing bookmark
class ConfirmOverwriteModal extends Modal {
	private bookmarkName: string;
	private onConfirm: () => void;

	constructor(app: App, bookmarkName: string, onConfirm: () => void) {
		super(app);
		this.bookmarkName = bookmarkName;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl("h2", { text: "Overwrite Bookmark?" });
		
		const message = contentEl.createDiv();
		message.style.marginBottom = "20px";
		message.createEl("p", { text: `A bookmark named "${this.bookmarkName}" already exists.` });
		message.createEl("p", { text: "Do you want to overwrite it with the current search?" });
		
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.justifyContent = "flex-end";
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		
		const overwriteBtn = buttonContainer.createEl("button", { text: "Overwrite" });
		overwriteBtn.classList.add("mod-warning");
		overwriteBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for loading a saved search
class LoadSearchModal extends Modal {
	private bookmarks: any[];
	private onSelect: (bookmarkId: string) => void;
	private plugin: QuizGenerator;
	private settings: QuizSettings;

	constructor(app: App, bookmarks: any[], onSelect: (bookmarkId: string) => void, plugin: QuizGenerator, settings: QuizSettings) {
		super(app);
		this.bookmarks = bookmarks;
		this.onSelect = onSelect;
		this.plugin = plugin;
		this.settings = settings;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl("h2", { text: "Load Saved Search" });
		
		this.renderBookmarks();
	}

	private renderBookmarks(): void {
		const { contentEl } = this;
		
		// Remove existing container if any
		const existingContainer = contentEl.querySelector(".load-search-list-qg");
		if (existingContainer) {
			existingContainer.remove();
		}
		
		const container = contentEl.createDiv("load-search-list-qg");
		
		// Show message if no bookmarks exist
		if (this.bookmarks.length === 0) {
			const emptyMessage = container.createDiv("load-search-empty-qg");
			emptyMessage.setText("No searches have been saved yet. Use the Save button to bookmark your search criteria.");
			return;
		}
		
		this.bookmarks.forEach(bookmark => {
			const item = container.createDiv("load-search-item-qg");
			
			const contentWrapper = item.createDiv("load-search-content-qg");
			
			const nameEl = contentWrapper.createDiv("load-search-name-qg");
			nameEl.textContent = bookmark.name;
			
			const bmData = bookmark as any;
			const filters: string[] = [];
			if (bmData.searchQuery) filters.push(`"${bmData.searchQuery}"`);
			if (bmData.filterTag) filters.push(`Tag: ${bmData.filterTag}`);
			if (bmData.filterFolder) filters.push(`Folder: ${bmData.filterFolder}`);
			if (bmData.filterDate && bmData.filterDate !== "any") {
				filters.push(`Modified: ${bmData.filterDate}d`);
			}
			
			if (filters.length > 0) {
				const infoEl = contentWrapper.createDiv("load-search-info-qg");
				infoEl.textContent = filters.join(" • ");
			}
			
			contentWrapper.addEventListener("click", () => {
				this.close();
				this.onSelect(bookmark.id);
			});
			
			// Delete button
			const deleteBtn = item.createEl("button", { 
				cls: "load-search-delete-btn-qg",
				attr: { "aria-label": "Delete" }
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				
				// Confirm deletion
				const confirmModal = new Modal(this.app);
				confirmModal.contentEl.createEl("h3", { text: "Delete Bookmark?" });
				confirmModal.contentEl.createEl("p", { text: `Delete "${bookmark.name}"?` });
				
				const btnContainer = confirmModal.contentEl.createDiv();
				btnContainer.style.display = "flex";
				btnContainer.style.gap = "10px";
				btnContainer.style.justifyContent = "flex-end";
				btnContainer.style.marginTop = "20px";
				
				const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
				cancelBtn.addEventListener("click", () => confirmModal.close());
				
				const confirmBtn = btnContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
				confirmBtn.addEventListener("click", async () => {
					// Remove from settings
					const index = this.settings.bookmarkedFilters.findIndex(b => b.id === bookmark.id);
					if (index > -1) {
						this.settings.bookmarkedFilters.splice(index, 1);
						await this.plugin.saveSettings();
						
						// Update the bookmarks list
						this.bookmarks = this.settings.bookmarkedFilters;
						
						// Re-render
						this.renderBookmarks();
						
						new Notice(`Deleted bookmark "${bookmark.name}"`);
						confirmModal.close();
					}
				});
				
				confirmModal.open();
			});
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
