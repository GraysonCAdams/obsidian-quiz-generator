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
import ProgressModal from "../progress/progressModal";
import type QuizGenerator from "../../main";
import JSZip from "jszip";
import { diff_match_patch } from "diff-match-patch";

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

enum ContentSelectionMode {
	FULL_PAGE = "full",
	CHANGES_ONLY = "changes"
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
	private includeBacklinks: boolean = false;
	private backlinkContainer: HTMLDivElement | null = null;
	private contentSelectionMode: ContentSelectionMode = ContentSelectionMode.FULL_PAGE;
	private contentSelectionContainer: HTMLDivElement | null = null;
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
	private isCalculatingTokens: boolean = false;
	private tokenCalculationProgress: number = 0;
	private tokenCalculationCancelled: boolean = false;
	private needsRecalculation: boolean = false;
	private preparedContent: Map<string, string> = new Map(); // Cache prepared content
	private noteTokenElements: Map<string, HTMLElement> = new Map(); // Store token display elements

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
		
		// Content selection UI
		this.renderContentSelectionUI();
		
		// Backlinks UI
		this.renderBacklinksUI();
		
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

			// Validate API key BEFORE making any file modifications
			if (!this.hasValidAPIKey()) {
				new Notice("Please provide a valid API key in settings for the selected provider");
				return;
			}

			this.toggleButtons([SelectorModalButton.GENERATE], true);

			// Create and open progress modal
			const progressModal = new ProgressModal(this.app);
			progressModal.open();

			try {
				// Step 1: Preparing content
				progressModal.updateProgress(1, "Preparing content...");
				
				// Collect note contents and backlinks if enabled
				let allContents = [...this.selectedNotes.values()];
				if (this.includeBacklinks) {
					const backlinkContents = await this.collectBacklinkContents();
					if (backlinkContents.length > 0) {
						allContents = [...allContents, ...backlinkContents];
					}
				}
				
				// Step 2: Sending to LLM
				progressModal.updateProgress(2, `Sending to ${this.settings.provider}...`);
				const generator = GeneratorFactory.createInstance(this.settings);
				
				// Step 3: Generating quiz (connected to API, waiting for generation to complete)
				progressModal.updateProgress(3, `Connected to ${this.settings.provider}, generating quiz questions...`);
				
				// Use prepared content if available, otherwise use selected notes
				const contentToUse = this.preparedContent.size > 0 
					? [...this.preparedContent.values()]
					: [...this.selectedNotes.values()];
				
				const generatedQuestions = await generator.generateQuiz(contentToUse);
				
				if (generatedQuestions === null) {
					progressModal.error("Error: Generation returned nothing");
					setTimeout(() => progressModal.close(), 2000);
					this.toggleButtons([SelectorModalButton.GENERATE], false);
					return;
				}

				// Step 4: Processing questions
				progressModal.updateProgress(4, "Processing questions...");
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

				// Step 5: Applying tag manipulations (AFTER successful generation)
				progressModal.updateProgress(5, "Updating note tags...");
				
				// Remove filtered tags if enabled
				if (this.removeFilteredTags && this.filteredTagsToRemove.size > 0) {
					await this.removeTagsFromNotes();
				}
				
				// Apply auto-tags if enabled
				if (this.autoTagEnabled && this.autoTags.trim()) {
					await this.applyAutoTags();
				}

				// Complete progress
				progressModal.complete();

				this.quiz = new QuizModalLogic(this.app, this.settings, questions, [...this.selectedNoteFiles.values()].flat(), undefined, undefined, undefined, this.plugin);
				await this.quiz.renderQuiz();
				this.toggleButtons([SelectorModalButton.QUIZ], false);
			} catch (error) {
				progressModal.error((error as Error).message);
				setTimeout(() => progressModal.close(), 2000);
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
					// Filter by days (supports fractional days for hours)
					const days = parseFloat(this.filterDate);
					const msAgo = days * 24 * 60 * 60 * 1000;
					const daysAgo = new Date(Date.now() - msAgo);
					if (new Date(file.stat.mtime) < daysAgo) {
						return false;
					}
				}
			}
			
			return true;
		});

		// Auto-select all matching files if enabled
		if (this.autoSelectMatching && matchingFiles.length > 0) {
			console.log('[performSearch] Auto-selecting files', {
				count: matchingFiles.length,
				mode: this.contentSelectionMode,
				filterDate: this.filterDate
			});
			
			// Add all files first without triggering individual recalculations
			for (const file of matchingFiles) {
				await this.addFileToSelection(file, true); // skipCalculation = true
				
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
			
			// Trigger calculation if in changes mode
			console.log('[performSearch] Checking if should calculate', {
				mode: this.contentSelectionMode,
				filterDate: this.filterDate,
				shouldCalculate: this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any"
			});
			
			if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
				console.log('[performSearch] Triggering calculateAllTokens');
				await this.calculateAllTokens();
			} else {
				console.log('[performSearch] Calculating tokens for full page mode');
				// Update token count for auto-selected files
				const totalTokens = [...this.selectedNotes.values()].reduce((sum, content) => {
					return sum + countNoteTokens(content);
				}, 0);
				console.log('[performSearch] Total tokens:', totalTokens);
				this.updatePromptTokens(totalTokens);
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
				
				// Trigger calculation if in changes mode
				if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
					if (!this.isCalculatingTokens) {
						await this.calculateAllTokens();
					}
				} else {
					// Update token count for full page mode
					const totalTokens = [...this.selectedNotes.values()].reduce((sum, content) => {
						return sum + countNoteTokens(content);
					}, 0);
					this.updatePromptTokens(totalTokens);
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

	private async collectBacklinkContents(): Promise<string[]> {
		const backlinkContents: string[] = [];
		const processedFiles = new Set<string>(); // Track processed files to avoid duplicates
		
		// Get all resolved links in the vault
		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		
		// Iterate through all selected note files
		for (const files of this.selectedNoteFiles.values()) {
			for (const file of files) {
				const targetPath = file.path;
				
				// Find all files that link to this file
				for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
					// Check if this source file links to our target file
					if (!links[targetPath]) continue;
					
					// Skip if we've already processed this backlink
					if (processedFiles.has(sourcePath)) continue;
					
					// Skip if the backlink is the same as our selected file
					if (sourcePath === targetPath) continue;
					
					const backlinkFile = this.app.vault.getAbstractFileByPath(sourcePath);
					if (!(backlinkFile instanceof TFile)) continue;
					
					try {
						const content = await this.app.vault.read(backlinkFile);
						const hasFrontMatter = getFrontMatterInfo(content).exists;
						backlinkContents.push(cleanUpNoteContents(content, hasFrontMatter));
						processedFiles.add(sourcePath);
					} catch (error) {
						console.error(`Error reading backlink file ${sourcePath}:`, error);
					}
				}
			}
		}
		
		return backlinkContents;
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
		
		// Reset content selection and backlinks
		this.contentSelectionMode = ContentSelectionMode.FULL_PAGE;
		this.includeBacklinks = false;
		
		// Clear all selected notes
		this.selectedNotes.clear();
		this.selectedNoteFiles.clear();
		this.preparedContent.clear();
		this.noteTokenElements.clear();
		this.selectedFilesContainer?.empty();
		this.updatePromptTokens(0);
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		
		// Clear search results
		if (this.searchResultsContainer) {
			this.searchResultsContainer.empty();
			this.searchResultsContainer.style.display = "none";
		}
		
		// Re-render the search bar, content selection, backlinks, and auto-tag UI
		this.renderSearchBar();
		this.renderContentSelectionUI();
		this.renderBacklinksUI();
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
			{ value: "0.04167", label: "Last 1 hour" },
			{ value: "0.25", label: "Last 6 hours" },
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
			// Re-render content selection UI to enable/disable options based on date filter
			this.renderContentSelectionUI();
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
		
		// Store reference to token element for later updates
		this.noteTokenElements.set(item.path, tokensElement);

		const viewContentsButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(viewContentsButton, "eye", "View contents");
		viewContentsButton.addEventListener("click", async (): Promise<void> => {
			if (item instanceof TFile) {
				// Pass prepared content if available, otherwise undefined (will show full note)
				const preparedContent = this.preparedContent.get(item.path);
				new NoteViewerModal(this.app, item, this.modalEl, preparedContent).open();
			} else {
				new FolderViewerModal(this.app, this.settings, this.modalEl, item).open();
			}
		});

		const removeButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(removeButton, "x", "Remove");
		removeButton.addEventListener("click", async (): Promise<void> => {
			this.noteTokenElements.delete(item.path);
			await this.removeNoteOrFolder(item, itemContainer);
		});

		return tokens;
	}

	private async removeNoteOrFolder(item: TFile | TFolder, element: HTMLDivElement): Promise<void> {
		this.selectedNotes.delete(item.path);
		this.selectedNoteFiles.delete(item.path);
		this.preparedContent.delete(item.path);
		this.selectedFilesContainer!.removeChild(element);
		item instanceof TFile ? this.notePaths.push(item.path) : this.folderPaths.push(item.path);
		
		// Recalculate tokens after removal
		if (this.selectedNoteFiles.size === 0) {
			this.updatePromptTokens(0);
			this.needsRecalculation = false;
		} else if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
			if (!this.isCalculatingTokens) {
				await this.calculateAllTokens();
			}
		} else {
			const totalTokens = [...this.selectedNotes.values()].reduce((sum, content) => {
				return sum + countNoteTokens(content);
			}, 0);
			this.updatePromptTokens(totalTokens);
		}
	}

	private toggleButtons(buttons: SelectorModalButton[], disabled: boolean): void {
		buttons.forEach(button => this.buttonMap[button].disabled = disabled);
	}

	private updatePromptTokens(tokens: number): void {
		this.promptTokens = tokens;
		const noteCount = this.selectedNoteFiles.size;
		
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
		
		// Separator and token/loading display
		this.tokenContainer.createEl("span", { text: " • ", cls: "token-separator-qg" });
		
		if (this.isCalculatingTokens) {
			// Show loading indicator with progress
			const loadingContainer = this.tokenContainer.createEl("span", { cls: "token-loading-container-qg" });
			
			const loaderWrapper = loadingContainer.createEl("span", { cls: "token-loader-wrapper-qg" });
			const loaderCircle = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			loaderCircle.setAttribute("class", "token-loader-circle-qg");
			loaderCircle.setAttribute("viewBox", "0 0 50 50");
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			circle.setAttribute("cx", "25");
			circle.setAttribute("cy", "25");
			circle.setAttribute("r", "20");
			circle.setAttribute("fill", "none");
			circle.setAttribute("stroke-width", "4");
			const circumference = 2 * Math.PI * 20;
			const offset = circumference - (this.tokenCalculationProgress / 100) * circumference;
			circle.style.strokeDasharray = `${circumference}`;
			circle.style.strokeDashoffset = `${offset}`;
			loaderCircle.appendChild(circle);
			loaderWrapper.appendChild(loaderCircle);
			
			loadingContainer.createEl("span", { 
				text: `Calculating... ${Math.round(this.tokenCalculationProgress)}%`,
				cls: "token-loading-text-qg"
			});
			
			// Stop button
			const stopBtn = loadingContainer.createEl("button", { cls: "token-stop-btn-qg" });
			setIcon(stopBtn, "square");
			stopBtn.title = "Stop calculation";
			stopBtn.addEventListener("click", () => {
				this.cancelTokenCalculation();
			});
		} else if (this.needsRecalculation) {
			// Show restart button
			const restartContainer = this.tokenContainer.createEl("span", { cls: "token-restart-container-qg" });
			restartContainer.createEl("span", { 
				text: "Calculation cancelled  •  ",
				cls: "token-cancelled-text-qg"
			});
			
			const restartBtn = restartContainer.createEl("span", { cls: "token-restart-btn-qg" });
			const iconSpan = restartBtn.createSpan({ cls: "token-restart-icon-qg" });
			setIcon(iconSpan, "refresh-cw");
			restartBtn.createSpan({ text: "Recount Tokens" });
			restartBtn.addEventListener("click", () => {
				this.restartTokenCalculation();
			});
		} else {
			// Show token count
			this.tokenContainer.createEl("span", {
				text: `Prompt tokens: ${this.promptTokens}`
			});
		}
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
			this.promptTokens > 0 &&
			!this.isCalculatingTokens &&
			!this.needsRecalculation;
	}

	private hasValidAPIKey(): boolean {
		const provider = this.settings.provider;
		
		// Ollama doesn't require an API key (local)
		if (provider === Provider.OLLAMA) {
			return true;
		}
		
		// Check for API key based on provider
		switch (provider) {
			case Provider.OPENAI:
				return !!(this.settings as any).openAIApiKey?.trim();
			case Provider.GOOGLE:
				return !!(this.settings as any).googleApiKey?.trim();
			case Provider.ANTHROPIC:
				return !!(this.settings as any).anthropicApiKey?.trim();
			case Provider.PERPLEXITY:
				return !!(this.settings as any).perplexityApiKey?.trim();
			case Provider.MISTRAL:
				return !!(this.settings as any).mistralApiKey?.trim();
			case Provider.COHERE:
				return !!(this.settings as any).cohereApiKey?.trim();
			default:
				return false;
		}
	}

	private renderContentSelectionUI(): void {
		// Clear existing container if it exists
		if (this.contentSelectionContainer) {
			this.contentSelectionContainer.empty();
		} else {
			this.contentSelectionContainer = this.contentEl.createDiv("content-selection-container-qg");
		}
		
		const label = this.contentSelectionContainer.createDiv("content-selection-label-qg");
		label.setText("Content to include:");
		
		const modeSelect = this.contentSelectionContainer.createEl("select", { cls: "content-selection-select-qg" });
		[
			{ value: ContentSelectionMode.FULL_PAGE, label: "Full page content" },
			{ value: ContentSelectionMode.CHANGES_ONLY, label: "Content changes and new pages (requires Edit History plugin)" }
		].forEach(option => {
			const opt = modeSelect.createEl("option", { value: option.value, text: option.label });
			if (option.value === this.contentSelectionMode) opt.selected = true;
			
			// Disable "Content changes" option if modified date is "any"
			if (option.value === ContentSelectionMode.CHANGES_ONLY && this.filterDate === "any") {
				opt.disabled = true;
			}
		});
		
		// If filterDate is "any" and current selection is CHANGES_ONLY, revert to FULL_PAGE
		if (this.filterDate === "any" && this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY) {
			this.contentSelectionMode = ContentSelectionMode.FULL_PAGE;
			modeSelect.value = ContentSelectionMode.FULL_PAGE;
		}
		
		modeSelect.addEventListener("change", async (e) => {
			const newValue = (e.target as HTMLSelectElement).value as ContentSelectionMode;
			
			// Check if Edit History plugin is required and installed
			if (newValue === ContentSelectionMode.CHANGES_ONLY) {
				if (!this.isEditHistoryPluginInstalled()) {
					// Revert selection
					modeSelect.value = this.contentSelectionMode;
					// Show install prompt
					this.showEditHistoryRequiredModal();
					return;
				}
			}
			
			const oldMode = this.contentSelectionMode;
			this.contentSelectionMode = newValue;
			
			// If switching modes and we have selected files, trigger recalculation
			if (oldMode !== newValue && this.selectedNoteFiles.size > 0) {
				if (newValue === ContentSelectionMode.CHANGES_ONLY) {
					// Switching to changes mode - auto-calculate
					console.log('[renderContentSelectionUI] Switching to changes mode, auto-calculating');
					await this.calculateAllTokens();
				} else {
					// Switching away from changes mode - clear recalculation flag and recalculate with full content
					console.log('[renderContentSelectionUI] Switching to full page mode, recalculating');
					this.needsRecalculation = false;
					await this.calculateAllTokens();
				}
			}
		});
	}
	
	private isEditHistoryPluginInstalled(): boolean {
		// Check if Edit History plugin is installed and enabled
		const plugins = (this.app as any).plugins;
		return plugins?.enabledPlugins?.has('edit-history') || false;
	}
	
	private showEditHistoryRequiredModal(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Edit History Plugin Required");
		
		const content = modal.contentEl;
		content.createEl("p", {
			text: "The 'Content changes and new pages' option requires the Edit History plugin to be installed and enabled."
		});
		
		content.createEl("p", {
			text: "This plugin automatically saves edit history for your notes, allowing the quiz generator to detect what content has changed since the last quiz."
		});
		
		// Plugin info with link
		const infoContainer = content.createDiv({ cls: "edit-history-info-qg" });
		infoContainer.createEl("p", {
			text: "Plugin: "
		});
		const link = infoContainer.createEl("a", {
			text: "Edit History",
			href: "https://github.com/antoniotejada/obsidian-edit-history"
		});
		link.style.textDecoration = "underline";
		link.addEventListener("click", (e) => {
			e.preventDefault();
			window.open("https://github.com/antoniotejada/obsidian-edit-history", "_blank");
		});
		
		const authorText = infoContainer.createEl("p", {
			cls: "edit-history-author-qg"
		});
		authorText.setText("Author: antoniotejada");
		authorText.style.fontStyle = "italic";
		authorText.style.marginTop = "0.5em";
		
		const buttonContainer = content.createDiv({ cls: "modal-button-container" });
		
		const installBtn = buttonContainer.createEl("button", {
			text: "Open Community Plugins",
			cls: "mod-cta"
		});
		
		installBtn.addEventListener("click", () => {
			// Open community plugins settings
			(this.app as any).setting.open();
			(this.app as any).setting.openTabById("community-plugins");
			modal.close();
		});
		
		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel"
		});
		
		cancelBtn.addEventListener("click", () => {
			modal.close();
		});
		
		modal.open();
	}

	private renderBacklinksUI(): void {
		// Clear existing container if it exists
		if (this.backlinkContainer) {
			this.backlinkContainer.empty();
		} else {
			this.backlinkContainer = this.contentEl.createDiv("backlink-container-qg");
		}
		
		const compactRow = this.backlinkContainer.createDiv("backlink-compact-row-qg");
		
		// Toggle
		const toggleLabel = compactRow.createSpan({ text: "Include backlinks", cls: "backlink-label-qg" });
		const toggleEl = compactRow.createEl("input", { type: "checkbox", cls: "backlink-checkbox-qg" });
		toggleEl.checked = this.includeBacklinks;
		toggleEl.addEventListener("change", () => {
			this.includeBacklinks = toggleEl.checked;
			this.updateClearButtonVisibility();
		});
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
				existingBookmark.includeBacklinks = this.includeBacklinks;
				existingBookmark.contentSelectionMode = this.contentSelectionMode;
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
			includeBacklinks: this.includeBacklinks,
			contentSelectionMode: this.contentSelectionMode,
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
		
		// Load backlink and content selection settings
		this.includeBacklinks = bmData.includeBacklinks || false;
		this.contentSelectionMode = bmData.contentSelectionMode || ContentSelectionMode.FULL_PAGE;

		// Update the UI to reflect loaded values
		this.renderSearchBar();
		this.renderContentSelectionUI();
		this.renderBacklinksUI();
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

	private async addFileToSelection(file: TFile, skipCalculation: boolean = false): Promise<void> {
		if (this.selectedNoteFiles.has(file.path)) {
			return; // Already added
		}

		this.notePaths = this.notePaths.filter(notePath => notePath !== file.path);
		this.selectedNoteFiles.set(file.path, [file]);
		
		// Mark that recalculation is needed if using content changes mode
		if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
			// Store placeholder for now
			this.selectedNotes.set(file.path, "");
			this.renderNote(file);
			if (!skipCalculation) {
				this.needsRecalculation = true;
			}
		} else {
			// For full page mode, calculate immediately
			const noteContents = await this.app.vault.cachedRead(file);
			const contentToStore = cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists);
			this.selectedNotes.set(file.path, contentToStore);
			this.preparedContent.set(file.path, contentToStore);
			this.renderNote(file);
		}
	}
	
	private async calculateAllTokens(): Promise<void> {
		console.log('[calculateAllTokens] Starting calculation', {
			mode: this.contentSelectionMode,
			filterDate: this.filterDate,
			totalFiles: this.selectedNoteFiles.size
		});
		
		this.isCalculatingTokens = true;
		this.tokenCalculationProgress = 0;
		this.tokenCalculationCancelled = false;
		this.needsRecalculation = false;
		this.preparedContent.clear();
		this.updatePromptTokens(0);
		
		const filesToProcess = Array.from(this.selectedNoteFiles.values()).flat();
		const totalFiles = filesToProcess.length;
		
		for (let i = 0; i < filesToProcess.length; i++) {
			if (this.tokenCalculationCancelled) {
				break;
			}
			
			const file = filesToProcess[i];
			const noteContents = await this.app.vault.cachedRead(file);
			let contentToStore = cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists);
			
			// If using content changes mode, extract only changes since selected date
			if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
				console.log(`[calculateAllTokens] Extracting changes for ${file.basename}`);
				contentToStore = await this.extractContentChanges(file, noteContents);
				console.log(`[calculateAllTokens] Changes extracted: ${contentToStore.length} chars`);
			}
			
			this.selectedNotes.set(file.path, contentToStore);
			this.preparedContent.set(file.path, contentToStore);
			
			// Update individual note token display
			const tokenElement = this.noteTokenElements.get(file.path);
			if (tokenElement) {
				const tokens = countNoteTokens(contentToStore);
				tokenElement.textContent = tokens + " tokens";
			}
			
			// Update progress
			this.tokenCalculationProgress = ((i + 1) / totalFiles) * 100;
			
			// Recalculate tokens
			let totalTokens = 0;
			for (const content of this.selectedNotes.values()) {
				totalTokens += countNoteTokens(content);
			}
			this.promptTokens = totalTokens;
			this.updatePromptTokens(totalTokens);
		}
		
		if (this.tokenCalculationCancelled) {
			this.needsRecalculation = true;
			this.isCalculatingTokens = false;
			this.updatePromptTokens(this.promptTokens);
		} else {
			this.isCalculatingTokens = false;
			this.needsRecalculation = false;
			console.log(`[calculateAllTokens] Completed: ${this.promptTokens} tokens`);
			this.updatePromptTokens(this.promptTokens);
		}
	}
	
	private cancelTokenCalculation(): void {
		this.tokenCalculationCancelled = true;
		this.needsRecalculation = true;
	}
	
	private async restartTokenCalculation(): Promise<void> {
		await this.calculateAllTokens();
	}
	
	/**
	 * Parse base-36 encoded epoch from .edtz entry filename
	 * Format: {base36_epoch_seconds}{isFull ? "$" : ""}
	 */
	private parseEditEpoch(filename: string): number {
		const base36Str = filename.replace(/\$$/, '');
		return parseInt(base36Str, 36) * 1000; // Convert to milliseconds
	}
	
	/**
	 * Check if entry is stored in full (ends with "$")
	 */
	private isFullVersion(filename: string): boolean {
		return filename.endsWith('$');
	}
	
	/**
	 * Reconstruct file state at a given threshold time by applying patches backwards
	 * Patches in .edtz are stored backwards (newer -> older), so applying them goes back in time
	 */
	private async reconstructFileAtTime(
		zip: JSZip,
		entries: Array<{name: string, timestamp: number, isFull: boolean, zipEntry: JSZip.JSZipObject}>,
		thresholdMs: number,
		latestStoredContent: string
	): Promise<string> {
		const dmp = new diff_match_patch();
		let data = latestStoredContent;
		
		// Process entries from newest to oldest (reverse order)
		// We want to go back in time to the threshold
		// Edits with timestamp > threshold should be undone (applied backwards)
		// Edits with timestamp <= threshold should remain (we stop processing)
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			
			// Stop if we've reached threshold or gone past it
			// Edits at threshold or before should remain as-is
			if (entry.timestamp <= thresholdMs) {
				break;
			}
			
			// Apply this edit backwards (patch goes newer -> older, so applying it goes back in time)
			const diffContent = await entry.zipEntry.async("string");
			
			if (entry.isFull) {
				// Full version stored - this is the state at this timestamp
				// The latest entry is always stored in full, so this should only happen
				// for the first entry we process (the latest)
				// If it's after threshold, use it as starting point and continue going back
				// If it's at or before threshold, use it directly and stop
				if (entry.timestamp > thresholdMs) {
					// Use this as starting point, but we still need to apply older patches
					// that are after threshold (though typically the latest is the only one after threshold)
					data = diffContent;
					// Continue processing older entries
				} else {
					// This full version is at or before threshold, use it directly
					data = diffContent;
					break;
				}
			} else {
				// Patch - apply it to go backwards in time
				const patch = dmp.patch_fromText(diffContent);
				const result = dmp.patch_apply(patch, data);
				data = result[0]; // result[0] is the patched text, result[1] is success array
			}
		}
		
		return data;
	}
	
	/**
	 * Extract only new content (insertions) from diff between old and new content
	 */
	private extractNewContent(oldContent: string, newContent: string): string {
		const dmp = new diff_match_patch();
		const diffs = dmp.diff_main(oldContent, newContent);
		dmp.diff_cleanupSemantic(diffs);
		
		// Extract only insertions (DiffOp.Insert = 1)
		const newContentParts: string[] = [];
		for (const [op, text] of diffs) {
			if (op === 1) { // Insert operation
				newContentParts.push(text);
			}
		}
		
		return newContentParts.join('');
	}
	
	private async extractContentChanges(file: TFile, currentContent: string): Promise<string> {
		// Calculate the date threshold based on filterDate
		const threshold = this.getDateThreshold();
		if (!threshold) {
			return "";
		}
		
		try {
			// Find the .edtz file for this note - Edit History appends .edtz to the full filename
			const edtzPath = file.path + '.edtz';
			const edtzFile = this.app.vault.getAbstractFileByPath(edtzPath);
			
			if (!(edtzFile instanceof TFile)) {
				// No edit history file - check if file is new since threshold
				if (new Date(file.stat.ctime) >= threshold) {
					return cleanUpNoteContents(currentContent, getFrontMatterInfo(currentContent).exists);
				}
				return "";
			}
			
			// Read the .edtz ZIP file
			const arrayBuffer = await this.app.vault.readBinary(edtzFile);
			const zip = await JSZip.loadAsync(arrayBuffer);
			
			// Extract all ZIP entries with their timestamps from filenames
			// The filename contains the exact UTC epoch in base-36 encoding
			const entries: Array<{name: string, timestamp: number, isFull: boolean, zipEntry: JSZip.JSZipObject}> = [];
			zip.forEach((relativePath, zipEntry) => {
				if (!zipEntry.dir) {
					const isFull = this.isFullVersion(relativePath);
					const timestamp = this.parseEditEpoch(relativePath);
					
					entries.push({ name: relativePath, timestamp, isFull, zipEntry });
				}
			});
			
			if (entries.length === 0) {
				// Empty edit history file
				return "";
			}
			
			// Sort by timestamp (oldest first)
			entries.sort((a, b) => a.timestamp - b.timestamp);
			
			const thresholdMs = threshold.getTime();
			
			// Find the latest stored version (should be the last entry, which is stored in full)
			const latestEntry = entries[entries.length - 1];
			if (!latestEntry.isFull) {
				console.warn(`[extractContentChanges] Latest entry is not stored in full, this shouldn't happen`);
			}
			
			const dmp = new diff_match_patch();
			const latestStoredContent = await latestEntry.zipEntry.async("string");
			
			// Check if there are any edits after the threshold
			const editsAfterThreshold = entries.filter(e => e.timestamp > thresholdMs);
			if (editsAfterThreshold.length === 0) {
				// No edits after threshold - return empty
				return "";
			}
			
			// Reconstruct file state at threshold by going backwards from latest stored version
			const stateAtThreshold = await this.reconstructFileAtTime(
				zip,
				entries,
				thresholdMs,
				latestStoredContent
			);
			
			// Check if current file has changes not yet stored in .edtz
			// Compare latest stored version with current content
			const currentDiff = dmp.diff_main(latestStoredContent, currentContent);
			const hasUnstoredChanges = currentDiff.some(([op]) => op !== 0); // Any non-equal operations
			
			// Calculate final state to compare against
			const finalState = hasUnstoredChanges ? currentContent : latestStoredContent;
			
			// Extract only new content (insertions) added after threshold
			const newContent = this.extractNewContent(stateAtThreshold, finalState);
			
			// Clean up the content (remove frontmatter if needed)
			const hasFrontMatter = getFrontMatterInfo(newContent).exists;
			return cleanUpNoteContents(newContent, hasFrontMatter);
			
		} catch (error) {
			console.error(`[extractContentChanges] Error extracting changes from ${file.path}:`, error);
			return "";
		}
	}
	
	private getDateThreshold(): Date | null {
		if (this.filterDate === "any") return null;
		
		if (this.filterDate === "last-quiz") {
			return this.getLastQuizGenerationDate();
		}
		
		// Parse days from filterDate (supports fractional days for hours)
		const days = parseFloat(this.filterDate);
		if (isNaN(days)) return null;
		
		// Calculate milliseconds ago
		const msAgo = days * 24 * 60 * 60 * 1000;
		const threshold = new Date(Date.now() - msAgo);
		return threshold;
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

		// Remove inline tags from content (preserving line breaks)
		for (const tag of tags) {
			// Match only spaces and tabs around the tag, not newlines
			const tagPattern = new RegExp(`[ \\t]*${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*`, 'g');
			const newContent = content.replace(tagPattern, (match, offset) => {
				// Check if tag is on its own line
				const beforeChar = offset > 0 ? content[offset - 1] : '\n';
				const afterPos = offset + match.length;
				const afterChar = afterPos < content.length ? content[afterPos] : '\n';
				
				// If surrounded by newlines or at start/end, remove completely
				if ((beforeChar === '\n' || offset === 0) && (afterChar === '\n' || afterPos >= content.length)) {
					return '';
				}
				// Otherwise replace with a single space
				return ' ';
			});
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
