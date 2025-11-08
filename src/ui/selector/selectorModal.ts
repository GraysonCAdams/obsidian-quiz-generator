import { App, Component, getFrontMatterInfo, MarkdownRenderer, Modal, Notice, Scope, setIcon, setTooltip, Setting, TextComponent, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
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
import { Provider, providers } from "../../generators/providers";
import { openAITextGenModels } from "../../generators/openai/openAIModels";
import { googleTextGenModels } from "../../generators/google/googleModels";
import { anthropicTextGenModels } from "../../generators/anthropic/anthropicModels";
import { perplexityTextGenModels } from "../../generators/perplexity/perplexityModels";
import { mistralTextGenModels } from "../../generators/mistral/mistralModels";
import { cohereTextGenModels } from "../../generators/cohere/cohereModels";
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
	private readonly backlinkMap: Map<string, TFile[]> = new Map<string, TFile[]>(); // Maps parent note path to its backlinks
	private readonly backlinkContent: Map<string, string> = new Map<string, string>(); // Maps backlink file path to its prepared content
	private readonly itemContainer: HTMLDivElement;
	private readonly tokenContainer: HTMLSpanElement;
	private promptTokens: number = 0;
	private readonly buttonMap: Record<SelectorModalButton, HTMLButtonElement>;
	private readonly MIN_TOKENS_FOR_QUIZ = 100; // Minimum tokens needed for a 3-5 question quiz
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
	private selectedFilesHeader: HTMLDivElement | null = null;
	private activePreviewPopover: HTMLElement | null = null;
	private activePopoverClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
	private removeTagsCheckbox: HTMLInputElement | null = null;
	private clearSearchBtn: HTMLAnchorElement | null = null;
	private showAdvanced: boolean = false;
	private searchQuery: string = "";
	private filterTag: string = "";
	private filterFolder: string = "";
	private filterDate: string = "any";
	private customFilterDate: Date | null = null; // For "Since specified date..." option
	private removeFilteredTags: boolean = false;
	private filteredTagsToRemove: Set<string> = new Set();
	private currentLoadedBookmarkId: string | null = null;
	private isCalculatingTokens: boolean = false;
	private tokenCalculationProgress: number = 0;
	private tokenCalculationCancelled: boolean = false;
	private needsRecalculation: boolean = false;
	private preparedContent: Map<string, string> = new Map(); // Cache prepared content
	private noteTokenElements: Map<string, HTMLElement> = new Map(); // Store token display elements
	private noteItemContainers: Map<string, HTMLElement> = new Map(); // Store item containers for styling updates
	private saveSearchBtn: HTMLButtonElement | null = null; // Reference to save search button
	private searchDebounceTimer: NodeJS.Timeout | null = null; // Debounce timer for search input
	private searchLoadingOverlay: HTMLDivElement | null = null; // Loading overlay for search results
	private isSearching: boolean = false; // Track if search is in progress
	private loadingCursorCount: number = 0; // Track number of concurrent loading operations
	private modelDisplayLink: HTMLAnchorElement | null = null; // Model display link beneath generate button
	private focusUpdateHandler: (() => void) | null = null; // Handler for window focus events
	private questionCountElement: HTMLElement | null = null; // Question count display element
	private titlePromptInput: HTMLInputElement | null = null; // Title prompt input field

	constructor(app: App, plugin: QuizGenerator, initialFiles?: TFile[], bookmarkId?: string, initialContentMode?: string) {
		super(app);
		this.plugin = plugin;
		this.settings = plugin.settings;
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "Escape", () => this.close());

		this.modalEl.addClass("modal-qg");
		this.modalEl.addClass("selector-modal-qg");
		this.contentEl.addClass("modal-content-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Select Notes for Quiz");

		// Set initial content selection mode if provided
		if (initialContentMode && (initialContentMode === "full" || initialContentMode === "changes")) {
			this.contentSelectionMode = initialContentMode as ContentSelectionMode;
		}

		// Search bar
		this.renderSearchBar();

		// Main container with two columns
		this.itemContainer = this.contentEl.createDiv("item-container-qg");
		
		// Left column: Search results
		const leftColumn = this.itemContainer.createDiv("column-left-qg");
		this.searchResultsContainer = leftColumn.createDiv("search-results-section-qg");
		this.searchResultsContainer.style.display = "none";
		
		// Create loading overlay for search results
		this.searchLoadingOverlay = leftColumn.createDiv("search-loading-overlay-qg");
		this.searchLoadingOverlay.style.display = "none";
		const loadingContent = this.searchLoadingOverlay.createDiv("search-loading-content-qg");
		const loadingSpinner = loadingContent.createDiv("search-loading-spinner-qg");
		setIcon(loadingSpinner, "loader-2");
		const loadingText = loadingContent.createDiv("search-loading-text-qg");
		loadingText.textContent = "Searching...";
		
		// Right column: Selected files
		const rightColumn = this.itemContainer.createDiv("column-right-qg");
		
		// Header with action link (Deselect all)
		this.selectedFilesHeader = rightColumn.createDiv("selected-files-header-qg");
		
		// Add action link (either "Deselect all" or "Reset filters")
		this.actionLink = this.selectedFilesHeader.createEl("a", { 
			cls: "selection-action-link-qg",
			text: "Deselect all"
		});
		this.actionLink.addEventListener("click", async () => {
			await this.handleActionLinkClick();
		});
		
		// Selected files section
		this.selectedFilesContainer = rightColumn.createDiv("selected-files-section-qg");
		
		// Content selection UI
		this.renderContentSelectionUI();
		
		// Auto-tagging UI
		this.renderAutoTagUI();

		this.tokenContainer = this.contentEl.createSpan("prompt-tokens-qg");
		this.tokenContainer.textContent = `Prompt tokens: ${this.promptTokens}`;
		this.buttonMap = this.activateButtons();
		
		// Set initial button state
		this.updateGeneratorButtonState();

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
		this.toggleButtons([SelectorModalButton.GENERATE], true);
		this.updateActionLink();
		
		// Update model display in case settings changed
		this.updateModelDisplay();
		
		// Ensure content selection mode is reflected in UI if it was set in constructor
		if (this.contentSelectionContainer) {
			const modeSelect = this.contentSelectionContainer.querySelector('select') as HTMLSelectElement;
			if (modeSelect && modeSelect.value !== this.contentSelectionMode) {
				modeSelect.value = this.contentSelectionMode;
			}
		}
		
		// Listen for window focus to update model display and question count when returning from settings
		this.focusUpdateHandler = (): void => {
			// Update model display and question count with latest settings
			this.updateModelDisplay();
		};
		window.addEventListener("focus", this.focusUpdateHandler);
	}

	public onClose(): void {
		// Clean up debounce timer if it exists
		if (this.searchDebounceTimer) {
			clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
		// Remove focus event listener
		if (this.focusUpdateHandler) {
			window.removeEventListener("focus", this.focusUpdateHandler);
			this.focusUpdateHandler = null;
		}
		// Reset loading cursor
		this.loadingCursorCount = 0;
		this.modalEl.style.cursor = "";
		document.body.style.cursor = "";
		super.onClose();
	}

	private activateButtons(): Record<SelectorModalButton, HTMLButtonElement> {
		const buttonContainer = this.contentEl.createDiv("modal-button-container-qg");
		
		// Add title prompt input field
		const titleInputContainer = buttonContainer.createDiv("quiz-title-input-container-qg");
		const titleInput = titleInputContainer.createEl("input", {
			type: "text",
			cls: "quiz-title-input-qg",
			placeholder: "Optional: Enter title prompt (AI will generate title if left empty)"
		});
		titleInput.style.width = "100%";
		titleInput.style.marginBottom = "0.75em";
		titleInput.style.padding = "0.5em";
		this.titlePromptInput = titleInput;
		
		const generateQuizButton = buttonContainer.createEl("button", { cls: "modal-button-qg mod-cta" });
		const buttonMap: Record<SelectorModalButton, HTMLButtonElement> = {
			[SelectorModalButton.CLEAR]: generateQuizButton, // Placeholder to maintain enum structure
			[SelectorModalButton.QUIZ]: generateQuizButton, // Placeholder - button removed
			[SelectorModalButton.FILTER]: generateQuizButton, // Reusing enum
			[SelectorModalButton.GENERATE]: generateQuizButton,
		};

		// Set icon and text for generate button
		setIcon(generateQuizButton, "webhook");
		generateQuizButton.createSpan({ text: "Generate quiz" });
		setTooltip(generateQuizButton, "Generate quiz from selected notes");
		
		const generateQuizHandler = async (): Promise<void> => {
			// Update model display with latest settings before generation
			this.updateModelDisplay();
			
			if (!this.validGenerationSettings()) {
				if (this.promptTokens < this.MIN_TOKENS_FOR_QUIZ) {
					new Notice(`Not enough content. Minimum ${this.MIN_TOKENS_FOR_QUIZ} tokens required for a 3-5 question quiz. Current: ${this.promptTokens} tokens.`);
				} else {
					new Notice("Invalid generation settings or insufficient tokens");
				}
				return;
			}

			// Validate API key BEFORE making any file modifications
			if (!this.hasValidAPIKey()) {
				new Notice("Please provide a valid API key in settings for the selected provider");
				return;
			}

			this.toggleButtons([SelectorModalButton.GENERATE], true);
			this.setLoadingCursor();

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
				// Use latest settings from plugin (in case model was changed)
				const currentSettings = this.plugin.settings;
				
				// Handle "surprise me" mode - randomize question type distribution
				if (currentSettings.surpriseMe) {
					const totalQuestions = currentSettings.numberOfTrueFalse +
						currentSettings.numberOfMultipleChoice +
						currentSettings.numberOfSelectAllThatApply +
						currentSettings.numberOfFillInTheBlank +
						currentSettings.numberOfMatching +
						currentSettings.numberOfShortAnswer +
						currentSettings.numberOfLongAnswer;
					
					if (totalQuestions > 0) {
						// Randomly distribute questions across enabled types
						const enabledTypes: Array<{key: keyof typeof currentSettings, generateKey: keyof typeof currentSettings}> = [
							{ key: "numberOfTrueFalse", generateKey: "generateTrueFalse" },
							{ key: "numberOfMultipleChoice", generateKey: "generateMultipleChoice" },
							{ key: "numberOfSelectAllThatApply", generateKey: "generateSelectAllThatApply" },
							{ key: "numberOfFillInTheBlank", generateKey: "generateFillInTheBlank" },
							{ key: "numberOfMatching", generateKey: "generateMatching" },
							{ key: "numberOfShortAnswer", generateKey: "generateShortAnswer" },
							{ key: "numberOfLongAnswer", generateKey: "generateLongAnswer" },
						];
						
						// Enable all types for surprise me
						enabledTypes.forEach(type => {
							(currentSettings[type.generateKey] as boolean) = true;
						});
						
						// Randomly distribute total questions
						const counts: number[] = new Array(enabledTypes.length).fill(0);
						let remaining = totalQuestions;
						
						// Distribute randomly
						for (let i = 0; i < totalQuestions; i++) {
							const randomIndex = Math.floor(Math.random() * enabledTypes.length);
							counts[randomIndex]++;
						}
						
						// Apply counts (round down, but ensure sum equals total)
						let sum = 0;
						enabledTypes.forEach((type, index) => {
							const count = counts[index];
							(currentSettings[type.key] as number) = count;
							sum += count;
						});
						
						// Adjust for any rounding differences
						if (sum !== totalQuestions) {
							const diff = totalQuestions - sum;
							// Add or subtract from random types
							for (let i = 0; i < Math.abs(diff); i++) {
								const randomIndex = Math.floor(Math.random() * enabledTypes.length);
								const currentCount = (currentSettings[enabledTypes[randomIndex].key] as number);
								if (diff > 0) {
									(currentSettings[enabledTypes[randomIndex].key] as number) = currentCount + 1;
								} else if (currentCount > 0) {
									(currentSettings[enabledTypes[randomIndex].key] as number) = currentCount - 1;
								}
							}
						}
					}
				}
				
				progressModal.updateProgress(2, `Sending to ${currentSettings.provider}...`);
				const generator = GeneratorFactory.createInstance(currentSettings);
				
				// Step 3: Generating quiz (connected to API, waiting for generation to complete)
				progressModal.updateProgress(3, `Connected to ${currentSettings.provider}, generating quiz questions...`);
				
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
							return currentSettings.provider !== Provider.COHERE ? str : str.replace(/_{2,}|\$_{2,}\$/g, "`____`");
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

				// Step 6: Generate quiz title
				progressModal.updateProgress(6, "Generating quiz title...");
				let quizTitle: string | null = null;
				try {
					const titlePrompt = this.titlePromptInput?.value?.trim() || null;
					const contentToUseForTitle = this.preparedContent.size > 0 
						? [...this.preparedContent.values()]
						: [...this.selectedNotes.values()];
					quizTitle = await generator.generateQuizTitle(contentToUseForTitle, titlePrompt);
				} catch (error) {
					console.error("Error generating quiz title:", error);
					// Continue with default naming if title generation fails
				}

				// Complete progress
				progressModal.complete();

				this.quiz = new QuizModalLogic(this.app, this.settings, questions, [...this.selectedNoteFiles.values()].flat(), undefined, undefined, undefined, this.plugin, this.contentSelectionMode, quizTitle);
				await this.quiz.renderQuiz();
			} catch (error) {
				progressModal.error((error as Error).message);
				setTimeout(() => progressModal.close(), 2000);
				new Notice((error as Error).message, 0);
			} finally {
				this.toggleButtons([SelectorModalButton.GENERATE], false);
				// Update button state after re-enabling (will disable again if not enough tokens)
				this.updateGeneratorButtonState();
				this.unsetLoadingCursor();
			}
		};

		generateQuizButton.addEventListener("click", generateQuizHandler);

		// Add model display beneath button
		this.renderModelDisplay(buttonContainer);

		return buttonMap;
	}
	
	private getCurrentModelName(): string {
		// Use plugin settings directly to get latest values
		const settings = this.plugin.settings;
		const provider = settings.provider;
		const providerName = providers[Provider[provider as keyof typeof Provider] as Provider] || provider;
		
		let modelName = "";
		switch (provider) {
			case Provider.OPENAI:
				modelName = openAITextGenModels[settings.openAITextGenModel as keyof typeof openAITextGenModels] || settings.openAITextGenModel;
				break;
			case Provider.GOOGLE:
				modelName = googleTextGenModels[settings.googleTextGenModel as keyof typeof googleTextGenModels] || settings.googleTextGenModel;
				break;
			case Provider.ANTHROPIC:
				modelName = anthropicTextGenModels[settings.anthropicTextGenModel as keyof typeof anthropicTextGenModels] || settings.anthropicTextGenModel;
				break;
			case Provider.PERPLEXITY:
				modelName = perplexityTextGenModels[settings.perplexityTextGenModel as keyof typeof perplexityTextGenModels] || settings.perplexityTextGenModel;
				break;
			case Provider.MISTRAL:
				modelName = mistralTextGenModels[settings.mistralTextGenModel as keyof typeof mistralTextGenModels] || settings.mistralTextGenModel;
				break;
			case Provider.COHERE:
				modelName = cohereTextGenModels[settings.cohereTextGenModel as keyof typeof cohereTextGenModels] || settings.cohereTextGenModel;
				break;
			case Provider.OLLAMA:
				modelName = settings.ollamaTextGenModel || "Not set";
				break;
			default:
				modelName = "Unknown";
		}
		
		return `${providerName}: ${modelName}`;
	}
	
	private renderModelDisplay(container: HTMLElement): void {
		const modelContainer = container.createDiv("model-display-container-qg");
		this.modelDisplayLink = modelContainer.createEl("a", {
			cls: "model-display-link-qg",
			text: this.getCurrentModelName()
		});
		this.modelDisplayLink.setAttribute("href", "#");
		this.modelDisplayLink.setAttribute("title", "Click to change model in settings");
		
		this.modelDisplayLink.addEventListener("click", (e) => {
			e.preventDefault();
			// Open settings and navigate to model settings
			(this.app as any).setting.open();
			(this.app as any).setting.openTabById("quiz-generator");
		});
		
		// Add total question count display
		const questionCountContainer = container.createDiv("question-count-container-qg");
		this.questionCountElement = questionCountContainer.createSpan("question-count-text-qg");
		this.updateQuestionCount(this.questionCountElement);
	}
	
	private calculateTotalQuestions(): number {
		const settings = this.plugin.settings;
		let total = 0;
		if (settings.generateTrueFalse) total += settings.numberOfTrueFalse;
		if (settings.generateMultipleChoice) total += settings.numberOfMultipleChoice;
		if (settings.generateSelectAllThatApply) total += settings.numberOfSelectAllThatApply;
		if (settings.generateFillInTheBlank) total += settings.numberOfFillInTheBlank;
		if (settings.generateMatching) total += settings.numberOfMatching;
		if (settings.generateShortAnswer) total += settings.numberOfShortAnswer;
		if (settings.generateLongAnswer) total += settings.numberOfLongAnswer;
		return total;
	}
	
	private updateQuestionCount(element: HTMLElement): void {
		const total = this.calculateTotalQuestions();
		element.textContent = `Total questions: ${total}`;
	}
	
	private updateModelDisplay(): void {
		if (this.modelDisplayLink) {
			this.modelDisplayLink.textContent = this.getCurrentModelName();
		}
		if (this.questionCountElement) {
			this.updateQuestionCount(this.questionCountElement);
		}
	}

	private async handleActionLinkClick(): Promise<void> {
		// Deselect all
		this.selectedNotes.clear();
		this.selectedNoteFiles.clear();
		this.selectedFilesContainer?.empty();
		this.noteTokenElements.clear();
		this.noteItemContainers.clear();
		this.preparedContent.clear();
		this.backlinkMap.clear();
		this.backlinkContent.clear();
		this.updatePromptTokens(0);
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		this.updateActionLink();
		// Refresh search results to show deselected files
		await this.performSearch();
	}

	private updateActionLink(): void {
		if (!this.actionLink || !this.selectedFilesHeader) return;

		const hasSelectedItems = this.selectedNotes.size > 0;
		
		// Show/hide entire header banner based on whether there are selected items
		if (hasSelectedItems) {
			this.selectedFilesHeader.style.display = "";
			this.actionLink.style.display = "";
			this.actionLink.textContent = "Deselect all";
		} else {
			this.selectedFilesHeader.style.display = "none";
		}
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
		
		// Debounced search on input
		searchInput.addEventListener("input", (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			this.updateClearButtonVisibility();
			this.updateSaveButtonState();
			
			// Clear existing timer
			if (this.searchDebounceTimer) {
				clearTimeout(this.searchDebounceTimer);
				this.searchDebounceTimer = null;
			}
			
			// Set new timer to perform search after 2 seconds of no typing
			this.searchDebounceTimer = setTimeout(async () => {
				await this.performSearch();
				this.searchDebounceTimer = null;
			}, 2000);
		});
		
		// Immediate search on blur (when input loses focus)
		searchInput.addEventListener("blur", async () => {
			// Clear any pending debounce timer
			if (this.searchDebounceTimer) {
				clearTimeout(this.searchDebounceTimer);
				this.searchDebounceTimer = null;
			}
			// Perform search immediately
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
		this.saveSearchBtn = inputButtons.createEl("button", {
			cls: "search-inline-btn-qg"
		});
		setIconAndTooltip(this.saveSearchBtn, "bookmark-plus", "Save current search");
		
		this.saveSearchBtn.addEventListener("click", () => {
			this.showBookmarkDialog();
		});
		
		// Update initial button state
		this.updateSaveButtonState();
		
		// Secondary row for advanced link only
		const secondaryRow = this.searchContainer.createDiv("search-secondary-row-qg");
		
		// Advanced link
		const advancedLink = secondaryRow.createEl("a", {
			cls: "advanced-toggle-link-qg"
		});
		
		// Add cog icon
		const cogIcon = advancedLink.createSpan("advanced-icon-qg");
		setIcon(cogIcon, "settings");
		
		// Add text
		const linkText = advancedLink.createSpan("advanced-text-qg");
		linkText.textContent = "Advanced";
		
		advancedLink.addEventListener("click", (e) => {
			e.preventDefault();
			this.showAdvanced = !this.showAdvanced;
			linkText.textContent = this.showAdvanced ? "Hide Advanced" : "Advanced";
			this.toggleAdvancedFilters();
		});
		
		// Advanced filters container (initially hidden)
		this.advancedFiltersContainer = this.searchContainer.createDiv("advanced-filters-qg");
		this.advancedFiltersContainer.style.display = "none";
		this.renderAdvancedFilters();
	}

	private async performSearch(): Promise<void> {
		// Show loading indicator and disable interactions
		this.showSearchLoading();
		this.setLoadingCursor();
		
		try {
			// If no search query and no advanced filters, show empty state
			if (!this.searchQuery.trim() && !this.filterTag && !this.filterFolder && this.filterDate === "any") {
				this.searchResultsContainer!.empty();
				this.searchResultsContainer!.style.display = "block";
				const emptyMessage = this.searchResultsContainer!.createDiv("search-results-empty-qg");
				emptyMessage.textContent = "No notes found or currently unselected";
				this.hideSearchLoading();
				return;
			}

		// Step 1: Filter files by basic criteria (text, tag, folder, date)
		const allFiles = this.app.vault.getMarkdownFiles();
		const query = this.searchQuery.toLowerCase();
		
		const matchingFiles = allFiles.filter(file => {
			// Skip already selected files
			if (this.selectedNoteFiles.has(file.path)) return false;
			
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
				} else if (this.filterDate === "custom" && this.customFilterDate) {
					// Filter by custom specified date
					if (new Date(file.stat.mtime) < this.customFilterDate) {
						return false;
					}
				} else {
					// Filter by days (supports fractional days for hours)
					const days = parseFloat(this.filterDate);
					if (!isNaN(days)) {
						const msAgo = days * 24 * 60 * 60 * 1000;
						const daysAgo = new Date(Date.now() - msAgo);
						if (new Date(file.stat.mtime) < daysAgo) {
							return false;
						}
					}
				}
			}
			
			return true;
		});

		// Step 2: TOKENIZE FIRST - Calculate tokens for each matching file BEFORE showing results
		// This ensures we only show files with relevant content and prevents loops
		const filesWithTokenData = await Promise.all(
			matchingFiles.map(async (file) => {
				let tokens = 0;
				let content = "";
				
				// Calculate tokens based on current mode
				if (this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any") {
					// In changes mode, extract content changes and count tokens
					try {
						const noteContents = await this.app.vault.cachedRead(file);
						content = await this.extractContentChanges(file, noteContents);
						tokens = countNoteTokens(content);
					} catch (error) {
						tokens = 0;
						content = "";
					}
				} else {
					// Full page mode - read file and count tokens
					try {
						const noteContents = await this.app.vault.cachedRead(file);
						content = cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists);
						tokens = countNoteTokens(content);
					} catch (error) {
						tokens = 0;
						content = "";
					}
				}
				
				return { file, tokens, content };
			})
		);
		
		// Step 3: Filter out files with 0 tokens - these don't have relevant content
		// ONLY files with tokens > 0 are eligible for selection
		const filesWithNonZeroTokens = filesWithTokenData
			.filter(({ tokens }) => tokens > 0)
			.sort((a, b) => {
				// Sort by last modified date, newest first (descending)
				return b.file.stat.mtime - a.file.stat.mtime;
			});

		// Step 4: Display search results (ONLY files with tokens, limit to first 20)
		// These files are already tokenized and guaranteed to have tokens > 0, sorted by newest first
		const displayFiles = filesWithNonZeroTokens.slice(0, 20);
		
		this.searchResultsContainer!.empty();
		
		if (displayFiles.length > 0) {
			this.searchResultsContainer!.style.display = "block";
			
			// Add "Add all" button at the top of search results
			const addAllRow = this.searchResultsContainer!.createDiv("search-results-add-all-qg");
			const addAllLink = addAllRow.createEl("a", {
				cls: "add-all-link-qg",
				text: `Add all (${filesWithNonZeroTokens.length})`
			});
			addAllLink.addEventListener("click", async () => {
				// Add all files with tokens to selection, using pre-calculated content
				for (const { file, content } of filesWithNonZeroTokens) {
					// Skip if already selected
					if (this.selectedNoteFiles.has(file.path)) continue;
					
					this.notePaths = this.notePaths.filter(notePath => notePath !== file.path);
					this.selectedNoteFiles.set(file.path, [file]);
					this.selectedNotes.set(file.path, content);
					this.preparedContent.set(file.path, content);
					
					// Render the note immediately
					this.renderNote(file);
					
					// Track filtered tags for removal if enabled
					if (this.filterTag && this.removeFilteredTags) {
						const tags = this.filterTag
							.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0)
							.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
						tags.forEach(tag => this.filteredTagsToRemove.add(tag));
					}
				}
				
				// Update total token count (including backlinks if enabled)
				const totalTokens = this.calculateTotalTokens();
				this.updatePromptTokens(totalTokens);
				this.updateActionLink();
				
				// Refresh search results to remove added files
				await this.performSearch();
			});
			
			displayFiles.forEach(({ file, content, tokens }) => {
				const resultItem = this.searchResultsContainer!.createDiv("search-result-item-qg");
				
				const fileName = resultItem.createDiv("search-result-name-qg");
				fileName.setText(file.basename);
				
				const filePath = resultItem.createDiv("search-result-path-qg");
				filePath.setText(file.parent?.path || "/");
				
				resultItem.addEventListener("click", async () => {
					// Add file to selection using pre-calculated content
					// This avoids re-calculating tokens and prevents loops
					if (this.selectedNoteFiles.has(file.path)) {
						return; // Already selected
					}
					
					this.notePaths = this.notePaths.filter(notePath => notePath !== file.path);
					this.selectedNoteFiles.set(file.path, [file]);
					this.selectedNotes.set(file.path, content);
					this.preparedContent.set(file.path, content);
					
					// Render the note
					this.renderNote(file);
					
					// Track filtered tags for removal if enabled
					if (this.filterTag && this.removeFilteredTags) {
						const tags = this.filterTag
							.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0)
							.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
						tags.forEach(tag => this.filteredTagsToRemove.add(tag));
					}
					
					// Update total token count (including backlinks if enabled)
					const totalTokens = this.calculateTotalTokens();
					this.updatePromptTokens(totalTokens);
					
					// Refresh search results to remove the clicked file
					await this.performSearch();
				});
			});
		} else if (filesWithNonZeroTokens.length > displayFiles.length) {
			// Show message if there are more files beyond the display limit
			this.searchResultsContainer!.style.display = "block";
			const message = this.searchResultsContainer!.createDiv("search-results-header-qg");
			message.textContent = `${filesWithNonZeroTokens.length} note${filesWithNonZeroTokens.length !== 1 ? 's' : ''} with content found (showing first 20)`;
		} else {
			// Show empty state message when no search results
			this.searchResultsContainer!.style.display = "block";
			const emptyMessage = this.searchResultsContainer!.createDiv("search-results-empty-qg");
			emptyMessage.textContent = "No notes found or currently unselected";
		}
		} finally {
			// Hide loading indicator and re-enable interactions
			this.hideSearchLoading();
			this.unsetLoadingCursor();
		}
	}
	
	private showSearchLoading(): void {
		if (this.isSearching) return; // Already showing loading
		this.isSearching = true;
		if (this.searchLoadingOverlay) {
			this.searchLoadingOverlay.style.display = "flex";
		}
		// Disable pointer events on left column
		const leftColumn = this.itemContainer.querySelector(".column-left-qg") as HTMLElement;
		if (leftColumn) {
			leftColumn.style.pointerEvents = "none";
			leftColumn.style.opacity = "0.6";
		}
	}
	
	private hideSearchLoading(): void {
		if (!this.isSearching) return; // Already hidden
		this.isSearching = false;
		if (this.searchLoadingOverlay) {
			this.searchLoadingOverlay.style.display = "none";
		}
		// Re-enable pointer events on left column
		const leftColumn = this.itemContainer.querySelector(".column-left-qg") as HTMLElement;
		if (leftColumn) {
			leftColumn.style.pointerEvents = "";
			leftColumn.style.opacity = "";
		}
	}
	
	private setLoadingCursor(): void {
		this.loadingCursorCount++;
		if (this.loadingCursorCount === 1) {
			// First loading operation - set cursor
			this.modalEl.style.cursor = "wait";
			document.body.style.cursor = "wait";
		}
	}
	
	private unsetLoadingCursor(): void {
		this.loadingCursorCount--;
		if (this.loadingCursorCount <= 0) {
			// All loading operations complete - reset cursor
			this.loadingCursorCount = 0;
			this.modalEl.style.cursor = "";
			document.body.style.cursor = "";
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
		
		// Clear existing backlink maps
		this.backlinkMap.clear();
		this.backlinkContent.clear();
		
		// Get all resolved links in the vault
		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		
		// Check if we're in changes mode
		const isChangesMode = this.contentSelectionMode === ContentSelectionMode.CHANGES_ONLY && this.filterDate !== "any";
		
		// Iterate through all selected note files
		for (const files of this.selectedNoteFiles.values()) {
			for (const file of files) {
				const targetPath = file.path;
				const backlinks: TFile[] = [];
				
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
						let content: string;
						
						if (isChangesMode) {
							// In changes mode, extract only recent changes
							const currentContent = await this.app.vault.cachedRead(backlinkFile);
							content = await this.extractContentChanges(backlinkFile, currentContent);
							
							// Only include backlinks that have recent changes (non-empty content)
							if (content.trim().length === 0) {
								processedFiles.add(sourcePath); // Mark as processed so we don't try again
								continue;
							}
						} else {
							// In full content mode, include all content
							const fullContent = await this.app.vault.read(backlinkFile);
							const hasFrontMatter = getFrontMatterInfo(fullContent).exists;
							content = cleanUpNoteContents(fullContent, hasFrontMatter);
						}
						
						// Store backlink file and content
						backlinks.push(backlinkFile);
						this.backlinkContent.set(backlinkFile.path, content);
						backlinkContents.push(content);
						processedFiles.add(sourcePath);
					} catch (error) {
						console.error(`Error reading backlink file ${sourcePath}:`, error);
					}
				}
				
				// Store backlinks for this parent note
				if (backlinks.length > 0) {
					this.backlinkMap.set(targetPath, backlinks);
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
		this.customFilterDate = null;
		this.removeFilteredTags = false;
		this.filteredTagsToRemove.clear();
		this.showAdvanced = false;
		
		// Reset auto-tag settings
		this.autoTagEnabled = false;
		this.autoTags = "";
		this.tagPlacement = TagPlacement.FRONTMATTER;
		
		// Reset content selection and backlinks
		this.contentSelectionMode = ContentSelectionMode.FULL_PAGE;
		this.includeBacklinks = false;
		
		// Update button state after reset
		this.updateSaveButtonState();
		
		// Clear all selected notes
		this.selectedNotes.clear();
		this.selectedNoteFiles.clear();
		this.preparedContent.clear();
		this.noteTokenElements.clear();
		this.noteItemContainers.clear();
		this.selectedFilesContainer?.empty();
		this.updatePromptTokens(0);
		this.notePaths = this.app.vault.getMarkdownFiles().map(file => file.path);
		this.folderPaths = this.app.vault.getAllFolders(true).map(folder => folder.path);
		
		// Clear search results
		if (this.searchResultsContainer) {
			this.searchResultsContainer.empty();
			this.searchResultsContainer.style.display = "none";
		}
		
		// Re-render the search bar, content selection, and auto-tag UI
		this.renderSearchBar();
		this.renderContentSelectionUI();
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
			this.updateSaveButtonState();
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
			this.updateSaveButtonState();
			await this.performSearch();
		});
		
		// Date filter
		const dateRow = filterGroup.createDiv("filter-row-compact-qg");
		dateRow.createSpan({ text: "Modified", cls: "filter-label-compact-qg" });
		const dateSelect = dateRow.createEl("select", { cls: "filter-select-compact-qg" });
		[
			{ value: "any", label: "Any time" },
			{ value: "last-quiz", label: "Since last quiz was generated" },
			{ value: "0.04167", label: "Last 1 hour" },
			{ value: "0.5", label: "Last 12 hours" },
			{ value: "1", label: "Last 24 hours" },
			{ value: "7", label: "Last 7 days" },
			{ value: "30", label: "Last 30 days" },
			{ value: "custom", label: "Since specified date..." }
		].forEach(opt => {
			const option = dateSelect.createEl("option", { text: opt.label });
			option.value = opt.value;
			// Check if current filterDate matches this option or if it's a custom date
			if (opt.value === this.filterDate || (opt.value === "custom" && this.filterDate === "custom")) {
				option.selected = true;
			}
		});
		
		// Date/time picker container (initially hidden)
		const dateTimePickerContainer = filterGroup.createDiv("date-time-picker-container-qg");
		dateTimePickerContainer.style.display = "none";
		
		// Use Obsidian's Setting component for native date picker
		let dateTextComponent: TextComponent;
		let timeTextComponent: TextComponent;
		
		const dateSetting = new Setting(dateTimePickerContainer)
			.setName("Date")
			.addText((text) => {
				dateTextComponent = text;
				const dateValue = this.customFilterDate ? this.formatDateForInput(this.customFilterDate) : this.formatDateForInput(new Date());
				text.inputEl.type = "date";
				text.setValue(dateValue);
				text.onChange(async (value) => {
					if (value && timeTextComponent) {
						const timeValue = timeTextComponent.inputEl.value || this.formatTimeForInput(new Date());
						const [year, month, day] = value.split('-').map(Number);
						const [hours, minutes] = timeValue.split(':').map(Number);
						this.customFilterDate = new Date(year, month - 1, day, hours, minutes);
						this.updateSaveButtonState();
						if (this.filterDate === "custom") {
							await this.performSearch();
						}
					}
				});
			});
		
		const timeSetting = new Setting(dateTimePickerContainer)
			.setName("Time")
			.addText((text) => {
				timeTextComponent = text;
				const timeValue = this.customFilterDate ? this.formatTimeForInput(this.customFilterDate) : this.formatTimeForInput(new Date());
				text.inputEl.type = "time";
				text.setValue(timeValue);
				text.onChange(async (value) => {
					if (value && dateTextComponent) {
						const dateValue = dateTextComponent.inputEl.value || this.formatDateForInput(new Date());
						const [year, month, day] = dateValue.split('-').map(Number);
						const [hours, minutes] = value.split(':').map(Number);
						this.customFilterDate = new Date(year, month - 1, day, hours, minutes);
						this.updateSaveButtonState();
						if (this.filterDate === "custom") {
							await this.performSearch();
						}
					}
				});
			});
		
		dateSelect.addEventListener("change", async (e) => {
			const newValue = (e.target as HTMLSelectElement).value;
			this.filterDate = newValue;
			
			// Show/hide date/time picker
			if (newValue === "custom") {
				dateTimePickerContainer.style.display = "block";
				// Initialize with current date/time if not set
				if (!this.customFilterDate) {
					this.customFilterDate = new Date();
					if (dateTextComponent) {
						dateTextComponent.setValue(this.formatDateForInput(this.customFilterDate));
					}
					if (timeTextComponent) {
						timeTextComponent.setValue(this.formatTimeForInput(this.customFilterDate));
					}
				}
			} else {
				dateTimePickerContainer.style.display = "none";
				this.customFilterDate = null;
			}
			
			this.updateClearButtonVisibility();
			this.updateSaveButtonState();
			// Re-render content selection UI to enable/disable options based on date filter
			this.renderContentSelectionUI();
			await this.performSearch();
		});
		
		// Show date/time picker if custom is already selected
		if (this.filterDate === "custom") {
			dateTimePickerContainer.style.display = "block";
			if (!this.customFilterDate) {
				this.customFilterDate = new Date();
			}
			// Values are already set in the addText callbacks above
		}
		
		// Remove filtered tags option
		const removeTagsRow = filterGroup.createDiv("filter-row-compact-qg");
		this.removeTagsCheckbox = removeTagsRow.createEl("input", { type: "checkbox", cls: "filter-checkbox-compact-qg" });
		this.removeTagsCheckbox.checked = this.removeFilteredTags;
		this.removeTagsCheckbox.addEventListener("change", (e) => {
			this.removeFilteredTags = (e.target as HTMLInputElement).checked;
			this.updateSaveButtonState();
		});
		removeTagsRow.createSpan({ text: "Remove filtered tags from notes upon generation", cls: "filter-checkbox-label-qg" });
		
		// Set initial disabled state based on whether there are tags
		this.updateRemoveTagsCheckboxState();
		
		}


	private renderNote(note: TFile): void {
		const tokens = this.renderNoteOrFolder(note, this.settings.showNotePath ? note.path : note.basename);
		this.toggleButtons([SelectorModalButton.GENERATE], false);
		this.updatePromptTokens(this.promptTokens + tokens);
		
		// Render backlinks if enabled
		if (this.includeBacklinks) {
			this.renderBacklinksForNote(note);
		}
	}
	
	private async renderBacklinksForNote(parentNote: TFile): Promise<void> {
		// Collect backlinks if not already collected
		const wasEmpty = this.backlinkMap.size === 0;
		if (wasEmpty) {
			await this.collectBacklinkContents();
		}
		
		const backlinks = this.backlinkMap.get(parentNote.path);
		if (!backlinks || backlinks.length === 0) return;
		
		// Find the parent note's container
		const parentContainer = this.noteItemContainers.get(parentNote.path);
		if (!parentContainer) return;
		
		// Create a container for backlinks (nested under parent)
		const backlinksContainer = parentContainer.createDiv("backlinks-container-qg");
		
		// Render each backlink
		for (const backlink of backlinks) {
			const backlinkContent = this.backlinkContent.get(backlink.path);
			if (backlinkContent === undefined) continue;
			
			this.renderBacklinkItem(backlink, backlinkContent, backlinksContainer);
		}
		
		// Update token count if backlinks were just collected
		if (wasEmpty) {
			const totalTokens = this.calculateTotalTokens();
			this.updatePromptTokens(totalTokens);
		}
	}
	
	private renderBacklinkItem(backlink: TFile, content: string, container: HTMLElement): void {
		const itemContainer = container.createDiv("item-qg backlink-item-qg");
		
		// Store backlink path and basename in const to ensure correct closure capture
		const backlinkPath = backlink.path;
		const backlinkBasename = backlink.basename;
		
		// Add spacer to align with parent's checkmark position (for visual alignment)
		const spacer = itemContainer.createSpan("item-checkmark-spacer-qg");
		spacer.style.width = "16px";
		spacer.style.flexShrink = "0";
		
		// Add file name
		const fileNameSpan = itemContainer.createSpan("item-name-qg");
		fileNameSpan.textContent = this.settings.showNotePath ? backlinkPath : backlinkBasename;
		
		const tokensElement = itemContainer.createDiv("item-tokens-qg");
		const tokens = countNoteTokens(content);
		tokensElement.textContent = tokens + " tokens";
		
		// Store reference for styling
		this.noteTokenElements.set(`backlink:${backlinkPath}`, tokensElement);
		this.updateItemStyling(`backlink:${backlinkPath}`, tokens);
		
		// Preview button with same functionality as main notes
		const viewContentsButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(viewContentsButton, "eye", "View contents");
		
		// Disabled hyperlink icon instead of remove button - align with parent's X button
		const backlinkIndicator = itemContainer.createEl("button", "item-button-qg backlink-indicator-qg");
		backlinkIndicator.disabled = true;
		backlinkIndicator.style.opacity = "0.5";
		backlinkIndicator.style.cursor = "default";
		setIcon(backlinkIndicator, "link");
		setTooltip(backlinkIndicator, "Included as a backlink");
		
		let popover: HTMLElement | null = null;
		let popoverTimeout: NodeJS.Timeout | null = null;
		let isPopoverPinned = false;
		let handleClickOutside: ((event: MouseEvent) => void) | null = null;
		
		const showPopover = async (e?: Event): Promise<void> => {
			if (e) {
				e.stopPropagation();
				e.preventDefault();
			}
			
			// Close any existing active popover
			if (this.activePreviewPopover && this.activePreviewPopover !== popover) {
				this.activePreviewPopover.style.display = "none";
				if (this.activePopoverClickOutsideHandler) {
					document.removeEventListener("click", this.activePopoverClickOutsideHandler);
					this.activePopoverClickOutsideHandler = null;
				}
				this.activePreviewPopover = null;
			}
			
			if (popoverTimeout) {
				clearTimeout(popoverTimeout);
				popoverTimeout = null;
			}
			
			if (popover && popover.style.display !== "none" && popover.style.display !== "") {
				popover.style.display = "none";
				isPopoverPinned = false;
				if (handleClickOutside) {
					document.removeEventListener("click", handleClickOutside);
				}
				if (this.activePreviewPopover === popover) {
					this.activePreviewPopover = null;
					this.activePopoverClickOutsideHandler = null;
				}
				return;
			}
			
			if (popover) {
				// Refresh content - use backlinkPath to ensure correct backlink
				const newContent = this.backlinkContent.get(backlinkPath) || "";
				const newTitle = newContent.trim().length > 0 
					? `${backlinkBasename} (Backlink - Prepared Content)`
					: backlinkBasename;
				
				const titleEl = popover.querySelector(".content-preview-title-qg");
				if (titleEl) {
					titleEl.textContent = newTitle;
				}
				
				const contentArea = popover.querySelector(".content-preview-content-qg");
				if (contentArea) {
					contentArea.empty();
					if (newContent.trim().length === 0) {
						contentArea.createEl("p", { 
							text: "No changes detected for the selected time period.",
							cls: "no-content-message-qg"
						});
					} else {
						const codeBlock = contentArea.createEl("pre", { cls: "content-preview-markdown-qg" });
						const codeEl = codeBlock.createEl("code", { cls: "language-markdown" });
						codeEl.textContent = newContent;
					}
				}
				
				popover.style.display = "block";
				isPopoverPinned = true;
				this.activePreviewPopover = popover;
				this.activePopoverClickOutsideHandler = handleClickOutside;
				if (handleClickOutside) {
					setTimeout(() => {
						document.addEventListener("click", handleClickOutside!);
					}, 0);
				}
				return;
			}
			
			// Create new popover - use backlinkPath to ensure correct backlink
			popover = document.body.createDiv("content-preview-popover-qg");
			popover.style.display = "block";
			
			const preparedContent = this.backlinkContent.get(backlinkPath) || "";
			const title = preparedContent.trim().length > 0 
				? `${backlinkBasename} (Backlink - Prepared Content)`
				: backlinkBasename;
			
			const rect = viewContentsButton.getBoundingClientRect();
			popover.style.position = "fixed";
			
			const popoverWidth = 500;
			const spaceRight = window.innerWidth - rect.right;
			const spaceLeft = rect.left;
			
			if (spaceRight >= popoverWidth + 20) {
				popover.style.left = `${rect.right + 10}px`;
			} else if (spaceLeft >= popoverWidth + 20) {
				popover.style.left = `${rect.left - popoverWidth - 10}px`;
			} else {
				popover.style.left = `${rect.right + 10}px`;
				popover.style.maxWidth = `${Math.max(300, spaceRight - 20)}px`;
			}
			
			const popoverHeight = 600;
			const spaceBelow = window.innerHeight - rect.top;
			if (spaceBelow < popoverHeight) {
				popover.style.top = `${Math.max(10, window.innerHeight - popoverHeight - 10)}px`;
			} else {
				popover.style.top = `${rect.top}px`;
			}
			
			popover.style.maxWidth = "500px";
			popover.style.maxHeight = "600px";
			popover.style.zIndex = "10000";
			
			const titleEl = popover.createEl("div", { cls: "content-preview-title-qg" });
			titleEl.setText(title);
			
			const contentArea = popover.createDiv("content-preview-content-qg");
			
			if (preparedContent.trim().length === 0) {
				contentArea.createEl("p", { 
					text: "No changes detected for the selected time period.",
					cls: "no-content-message-qg"
				});
			} else {
				const codeBlock = contentArea.createEl("pre", { cls: "content-preview-markdown-qg" });
				const codeEl = codeBlock.createEl("code", { cls: "language-markdown" });
				codeEl.textContent = preparedContent;
			}
			
			isPopoverPinned = true;
			
			handleClickOutside = (event: MouseEvent): void => {
				if (popover && isPopoverPinned && 
					!popover.contains(event.target as Node) && 
					!viewContentsButton.contains(event.target as Node)) {
					popover.style.display = "none";
					isPopoverPinned = false;
					if (handleClickOutside) {
						document.removeEventListener("click", handleClickOutside);
					}
					if (this.activePreviewPopover === popover) {
						this.activePreviewPopover = null;
						this.activePopoverClickOutsideHandler = null;
					}
				}
			};
			
			const hidePopover = (): void => {
				if (isPopoverPinned) return;
				if (popoverTimeout) {
					clearTimeout(popoverTimeout);
				}
				popoverTimeout = setTimeout(() => {
					if (popover && !isPopoverPinned) {
						popover.style.display = "none";
					}
				}, 200);
			};
			
			const showPopoverOnHover = (): void => {
				if (popoverTimeout) {
					clearTimeout(popoverTimeout);
					popoverTimeout = null;
				}
				if (popover && !isPopoverPinned) {
					popover.style.display = "block";
				}
			};
			
			viewContentsButton.addEventListener("mouseenter", showPopoverOnHover);
			viewContentsButton.addEventListener("mouseleave", hidePopover);
			popover.addEventListener("mouseenter", showPopoverOnHover);
			popover.addEventListener("mouseleave", hidePopover);
			
			this.activePreviewPopover = popover;
			this.activePopoverClickOutsideHandler = handleClickOutside;
			if (handleClickOutside) {
				setTimeout(() => {
					document.addEventListener("click", handleClickOutside!);
				}, 0);
			}
		};
		
		viewContentsButton.addEventListener("click", (e) => showPopover(e));
	}

	private renderNoteOrFolder(item: TFile | TFolder, fileName: string): number {
		const itemContainer = this.selectedFilesContainer!.createDiv("item-qg");
		
		// Add checkmark icon to indicate selected status
		const checkmarkIcon = itemContainer.createSpan("item-checkmark-qg");
		setIcon(checkmarkIcon, "check");
		
		// Add file name
		const fileNameSpan = itemContainer.createSpan("item-name-qg");
		fileNameSpan.textContent = fileName;

		const tokensElement = itemContainer.createDiv("item-tokens-qg");
		const tokens = countNoteTokens(this.selectedNotes.get(item.path)!);
		tokensElement.textContent = tokens + " tokens";
		
		// Store reference to token element and container for later updates
		this.noteTokenElements.set(item.path, tokensElement);
		this.noteItemContainers.set(item.path, itemContainer);
		
		// Apply styling based on token count
		this.updateItemStyling(item.path, tokens);

		const viewContentsButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(viewContentsButton, "eye", "View contents");
		
		let popover: HTMLElement | null = null;
		let popoverTimeout: NodeJS.Timeout | null = null;
		let isPopoverPinned = false; // Track if popover is pinned by click
		let handleClickOutside: ((event: MouseEvent) => void) | null = null;
		
		const showPopover = async (e?: Event): Promise<void> => {
			// Prevent event bubbling to avoid triggering mouseleave
			if (e) {
				e.stopPropagation();
				e.preventDefault();
			}
			
			// Close any existing active popover from other items
			if (this.activePreviewPopover && this.activePreviewPopover !== popover) {
				this.activePreviewPopover.style.display = "none";
				if (this.activePopoverClickOutsideHandler) {
					document.removeEventListener("click", this.activePopoverClickOutsideHandler);
					this.activePopoverClickOutsideHandler = null;
				}
				this.activePreviewPopover = null;
			}
			
			// Clear any pending timeout
			if (popoverTimeout) {
				clearTimeout(popoverTimeout);
				popoverTimeout = null;
			}
			
			// If popover already exists and is visible, hide it (toggle behavior)
			if (popover && popover.style.display !== "none" && popover.style.display !== "") {
				popover.style.display = "none";
				isPopoverPinned = false;
				// Remove click outside listener
				if (handleClickOutside) {
					document.removeEventListener("click", handleClickOutside);
				}
				// Clear active popover reference if this was the active one
				if (this.activePreviewPopover === popover) {
					this.activePreviewPopover = null;
					this.activePopoverClickOutsideHandler = null;
				}
				return;
			}
			
			// If popover exists but is hidden, refresh content and show it
			if (popover) {
				// Refresh content in case it changed (e.g., mode switch)
				if (item instanceof TFile) {
					const preparedContent = this.preparedContent.get(item.path);
					const newContent = preparedContent !== undefined 
						? preparedContent
						: await this.app.vault.cachedRead(item);
					const newTitle = preparedContent !== undefined 
						? `${item.basename} (Prepared Content)`
						: item.basename;
					
					// Update title if it changed
					const titleEl = popover.querySelector(".content-preview-title-qg");
					if (titleEl) {
						titleEl.textContent = newTitle;
					}
					
					// Update content
					const contentArea = popover.querySelector(".content-preview-content-qg");
					if (contentArea) {
						contentArea.empty();
						
						// Show message if no prepared content
						if (this.preparedContent.get(item.path) !== undefined && newContent.trim().length === 0) {
							contentArea.createEl("p", { 
								text: "No changes detected for the selected time period.",
								cls: "no-content-message-qg"
							});
						} else {
							// Show raw markdown content in a code block for reliable display
							const codeBlock = contentArea.createEl("pre", { cls: "content-preview-markdown-qg" });
							const codeEl = codeBlock.createEl("code", { 
								cls: "language-markdown"
							});
							// Use textContent to preserve line breaks
							codeEl.textContent = newContent;
						}
					}
				}
				
				popover.style.display = "block";
				isPopoverPinned = true;
				// Set as active popover
				this.activePreviewPopover = popover;
				this.activePopoverClickOutsideHandler = handleClickOutside;
				// Re-add click outside listener
				if (handleClickOutside) {
					setTimeout(() => {
						document.addEventListener("click", handleClickOutside!);
					}, 0);
				}
				return;
			}
			
			// Create popover container
			popover = document.body.createDiv("content-preview-popover-qg");
			popover.style.display = "block"; // Ensure it's visible immediately
			
			// Get content
			let content: string;
			let title: string;
			
			if (item instanceof TFile) {
				const preparedContent = this.preparedContent.get(item.path);
				content = preparedContent !== undefined 
					? preparedContent
					: await this.app.vault.cachedRead(item);
				title = preparedContent !== undefined 
					? `${item.basename} (Prepared Content)`
					: item.basename;
			} else {
				// For folders, we'll still use the modal for now
				new FolderViewerModal(this.app, this.settings, this.modalEl, item).open();
				popover.remove();
				popover = null;
				return;
			}
			
			// Position popover near the button
			const rect = viewContentsButton.getBoundingClientRect();
			popover.style.position = "fixed";
			
			// Calculate position - prefer right side, but flip to left if not enough space
			const popoverWidth = 500;
			const spaceRight = window.innerWidth - rect.right;
			const spaceLeft = rect.left;
			
			if (spaceRight >= popoverWidth + 20) {
				// Place on the right
				popover.style.left = `${rect.right + 10}px`;
			} else if (spaceLeft >= popoverWidth + 20) {
				// Place on the left
				popover.style.left = `${rect.left - popoverWidth - 10}px`;
			} else {
				// Not enough space on either side, use right but constrain width
				popover.style.left = `${rect.right + 10}px`;
				popover.style.maxWidth = `${Math.max(300, spaceRight - 20)}px`;
			}
			
			// Adjust vertical position if near bottom of screen
			const popoverHeight = 600;
			const spaceBelow = window.innerHeight - rect.top;
			if (spaceBelow < popoverHeight) {
				popover.style.top = `${Math.max(10, window.innerHeight - popoverHeight - 10)}px`;
			} else {
				popover.style.top = `${rect.top}px`;
			}
			
			popover.style.maxWidth = "500px";
			popover.style.maxHeight = "600px";
			popover.style.zIndex = "10000";
			
			// Add title
			const titleEl = popover.createEl("div", { cls: "content-preview-title-qg" });
			titleEl.setText(title);
			
			// Add scrollable content area
			const contentArea = popover.createDiv("content-preview-content-qg");
			
			// Show message if no prepared content
			if (item instanceof TFile && this.preparedContent.get(item.path) !== undefined && content.trim().length === 0) {
				contentArea.createEl("p", { 
					text: "No changes detected for the selected time period.",
					cls: "no-content-message-qg"
				});
			} else {
				// Show raw markdown content in a code block for reliable display
				const codeBlock = contentArea.createEl("pre", { cls: "content-preview-markdown-qg" });
				const codeEl = codeBlock.createEl("code", { 
					cls: "language-markdown"
				});
				// Use textContent to preserve line breaks
				codeEl.textContent = content;
			}
			
			// Mark as pinned when opened via click
			isPopoverPinned = true;
			
			// Close popover when clicking outside
			handleClickOutside = (event: MouseEvent): void => {
				if (popover && isPopoverPinned && 
					!popover.contains(event.target as Node) && 
					!viewContentsButton.contains(event.target as Node)) {
					popover.style.display = "none";
					isPopoverPinned = false;
					if (handleClickOutside) {
						document.removeEventListener("click", handleClickOutside);
					}
					// Clear active popover reference
					if (this.activePreviewPopover === popover) {
						this.activePreviewPopover = null;
						this.activePopoverClickOutsideHandler = null;
					}
				}
			};
			
			// Hide popover when mouse leaves (only if not pinned by click)
			const hidePopover = (): void => {
				// Don't hide if popover is pinned by click
				if (isPopoverPinned) {
					return;
				}
				if (popoverTimeout) {
					clearTimeout(popoverTimeout);
				}
				popoverTimeout = setTimeout(() => {
					if (popover && !isPopoverPinned) {
						popover.style.display = "none";
					}
				}, 200); // Small delay to allow moving to popover
			};
			
			// Show popover when mouse enters (only if not pinned)
			const showPopoverOnHover = (): void => {
				if (popoverTimeout) {
					clearTimeout(popoverTimeout);
					popoverTimeout = null;
				}
				if (popover && !isPopoverPinned) {
					popover.style.display = "block";
				}
			};
			
			// Only add hover listeners if not pinned (for hover behavior)
			// But we'll add click outside listener for pinned popovers
			viewContentsButton.addEventListener("mouseenter", showPopoverOnHover);
			viewContentsButton.addEventListener("mouseleave", hidePopover);
			popover.addEventListener("mouseenter", showPopoverOnHover);
			popover.addEventListener("mouseleave", hidePopover);
			
			// Set as active popover and add click outside listener when popover is pinned
			this.activePreviewPopover = popover;
			this.activePopoverClickOutsideHandler = handleClickOutside;
			if (handleClickOutside) {
				setTimeout(() => {
					document.addEventListener("click", handleClickOutside!);
				}, 0);
			}
		};
		
		viewContentsButton.addEventListener("click", (e) => showPopover(e));

		const removeButton = itemContainer.createEl("button", "item-button-qg");
		setIconAndTooltip(removeButton, "x", "Remove");
		removeButton.addEventListener("click", async (): Promise<void> => {
			// Clean up popover when item is removed
			if (popover) {
				// Clear active popover reference if this was the active one
				const wasActive = this.activePreviewPopover === popover;
				popover.remove();
				popover = null;
				isPopoverPinned = false;
				if (wasActive) {
					this.activePreviewPopover = null;
					this.activePopoverClickOutsideHandler = null;
				}
			}
			if (popoverTimeout) {
				clearTimeout(popoverTimeout);
				popoverTimeout = null;
			}
			if (handleClickOutside) {
				document.removeEventListener("click", handleClickOutside);
			}
		this.noteTokenElements.delete(item.path);
		this.noteItemContainers.delete(item.path);
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
		
		// Update action link visibility
		this.updateActionLink();
		
		// Check if the removed item should be added back to search results
		if (item instanceof TFile) {
			// Check if the file matches current search criteria
			const query = this.searchQuery.toLowerCase();
			const matchesQuery = !this.searchQuery.trim() || 
				item.basename.toLowerCase().includes(query) ||
				item.path.toLowerCase().includes(query);
			
			if (matchesQuery) {
				// Check tag filter
				let matchesTag = true;
				if (this.filterTag) {
					const cache = this.app.metadataCache.getFileCache(item);
					if (cache) {
						const searchTags = this.filterTag
							.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0)
							.map(tag => tag.startsWith("#") ? tag : `#${tag}`);
						
						const fileTags = this.getAllTagsFromCache(cache);
						matchesTag = searchTags.some(searchTag => 
							fileTags.some(fileTag => fileTag.toLowerCase().includes(searchTag.toLowerCase()))
						);
					} else {
						matchesTag = false;
					}
				}
				
				// Check folder filter
				let matchesFolder = true;
				if (this.filterFolder) {
					matchesFolder = item.path.toLowerCase().includes(this.filterFolder.toLowerCase());
				}
				
				// Check date filter
				let matchesDate = true;
				if (this.filterDate !== "any") {
					if (this.filterDate === "last-quiz") {
						const lastQuizDate = this.getLastQuizGenerationDate();
						if (!lastQuizDate || new Date(item.stat.mtime) < lastQuizDate) {
							matchesDate = false;
						}
					} else if (this.filterDate === "custom" && this.customFilterDate) {
						if (new Date(item.stat.mtime) < this.customFilterDate) {
							matchesDate = false;
						}
					} else {
						const days = parseFloat(this.filterDate);
						if (!isNaN(days)) {
							const msAgo = days * 24 * 60 * 60 * 1000;
							const daysAgo = new Date(Date.now() - msAgo);
							if (new Date(item.stat.mtime) < daysAgo) {
								matchesDate = false;
							}
						}
					}
				}
				
				// If file matches all criteria, refresh search results to include it
				if (matchesTag && matchesFolder && matchesDate) {
					await this.performSearch();
				}
			}
		}
		
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

	private updateItemStyling(itemPath: string, tokens: number): void {
		const itemContainer = this.noteItemContainers.get(itemPath);
		if (!itemContainer) return;
		
		if (tokens === 0) {
			itemContainer.addClass("item-zero-tokens-qg");
			// Use Obsidian's setTooltip for better integration and cursor styling
			setTooltip(itemContainer, "This file has 0 tokens because your search conditions (content changes mode, date filter, etc.) filtered out all content from this document");
		} else {
			itemContainer.removeClass("item-zero-tokens-qg");
			// Remove tooltip by setting it to empty string
			setTooltip(itemContainer, "");
		}
	}

	private calculateTotalTokens(): number {
		// Calculate tokens from selected notes
		let totalTokens = [...this.selectedNotes.values()].reduce((sum, content) => {
			return sum + countNoteTokens(content);
		}, 0);
		
		// Add tokens from backlinks if enabled
		if (this.includeBacklinks && this.backlinkContent.size > 0) {
			const backlinkTokens = [...this.backlinkContent.values()].reduce((sum, content) => {
				return sum + countNoteTokens(content);
			}, 0);
			totalTokens += backlinkTokens;
		}
		
		return totalTokens;
	}

	private updatePromptTokens(tokens: number): void {
		this.promptTokens = tokens;
		
		// Clear and rebuild the container
		this.tokenContainer.empty();
		
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
		
		// Update generator button state based on token count
		this.updateGeneratorButtonState();
	}
	
	private updateGeneratorButtonState(): void {
		const generateButton = this.buttonMap[SelectorModalButton.GENERATE];
		const hasEnoughTokens = this.promptTokens >= this.MIN_TOKENS_FOR_QUIZ;
		
		// Don't override button state if calculations are in progress or if recalculation is needed
		// (those states are managed elsewhere)
		if (this.isCalculatingTokens || this.needsRecalculation) {
			return;
		}
		
		// Disable button if not enough tokens
		generateButton.disabled = !hasEnoughTokens;
		
		// Update tooltip
		if (hasEnoughTokens) {
			setTooltip(generateButton, "Generate quiz from selected notes");
		} else {
			setTooltip(generateButton, `Not enough content. Minimum ${this.MIN_TOKENS_FOR_QUIZ} tokens required for a 3-5 question quiz. Current: ${this.promptTokens} tokens.`);
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
			this.promptTokens >= this.MIN_TOKENS_FOR_QUIZ &&
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
		
		// Add backlinks checkbox within the content selection group
		const backlinksRow = this.contentSelectionContainer.createDiv("backlink-row-qg");
		const backlinksCheckbox = backlinksRow.createEl("input", { type: "checkbox", cls: "backlink-checkbox-qg" });
		backlinksCheckbox.checked = this.includeBacklinks;
		backlinksCheckbox.addEventListener("change", async () => {
			this.includeBacklinks = backlinksCheckbox.checked;
			this.updateClearButtonVisibility();
			this.updateSaveButtonState();
			
			// Re-render all selected notes with their backlinks if enabled
			if (this.includeBacklinks) {
				// Clear existing backlink containers
				this.selectedFilesContainer?.querySelectorAll(".backlinks-container-qg").forEach(el => el.remove());
				
				// Re-render all selected notes with backlinks
				for (const [filePath, files] of this.selectedNoteFiles.entries()) {
					for (const file of files) {
						if (file instanceof TFile) {
							await this.renderBacklinksForNote(file);
						}
					}
				}
				
				// Recalculate and update token count to include backlinks
				const totalTokens = this.calculateTotalTokens();
				this.updatePromptTokens(totalTokens);
			} else {
				// Remove all backlink containers
				this.selectedFilesContainer?.querySelectorAll(".backlinks-container-qg").forEach(el => el.remove());
				this.backlinkMap.clear();
				this.backlinkContent.clear();
				
				// Recalculate and update token count without backlinks
				const totalTokens = this.calculateTotalTokens();
				this.updatePromptTokens(totalTokens);
			}
		});
		const backlinksLabel = backlinksRow.createSpan({ text: "Include backlinks", cls: "backlink-label-qg" });
		
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
			this.updateSaveButtonState();
			
			// Clear backlink data when mode changes (will be recalculated)
			if (oldMode !== newValue) {
				this.backlinkMap.clear();
				this.backlinkContent.clear();
				// Remove existing backlink containers
				this.selectedFilesContainer?.querySelectorAll(".backlinks-container-qg").forEach(el => el.remove());
			}
			
			// If switching modes and we have selected files, trigger recalculation
			if (oldMode !== newValue && this.selectedNoteFiles.size > 0) {
				if (newValue === ContentSelectionMode.CHANGES_ONLY) {
					// Switching to changes mode - auto-calculate
					await this.calculateAllTokens();
				} else {
					// Switching to full page mode - immediately recalculate with full content
					this.needsRecalculation = false;
					this.isCalculatingTokens = false;
					
					// For full page mode, we can calculate synchronously without progress indicators
					let totalTokens = 0;
					const filesToProcess = Array.from(this.selectedNoteFiles.values()).flat();
					
					for (const file of filesToProcess) {
						const noteContents = await this.app.vault.cachedRead(file);
						const contentToStore = cleanUpNoteContents(noteContents, getFrontMatterInfo(noteContents).exists);
						
						this.selectedNotes.set(file.path, contentToStore);
						this.preparedContent.set(file.path, contentToStore);
						
						// Update individual note token display
						const tokens = countNoteTokens(contentToStore);
						const tokenElement = this.noteTokenElements.get(file.path);
						if (tokenElement) {
							tokenElement.textContent = tokens + " tokens";
							this.updateItemStyling(file.path, tokens);
						}
						
						totalTokens += tokens;
					}
					
					// Re-render backlinks if enabled (they may have changed with mode switch)
					if (this.includeBacklinks) {
						// Clear existing backlink containers
						this.selectedFilesContainer?.querySelectorAll(".backlinks-container-qg").forEach(el => el.remove());
						// Re-collect and render backlinks for all selected notes
						this.backlinkMap.clear();
						this.backlinkContent.clear();
						for (const [filePath, files] of this.selectedNoteFiles.entries()) {
							for (const file of files) {
								if (file instanceof TFile) {
									await this.renderBacklinksForNote(file);
								}
							}
						}
					}
					
					// Calculate total tokens including backlinks
					const totalTokensWithBacklinks = this.calculateTotalTokens();
					this.promptTokens = totalTokensWithBacklinks;
					this.updatePromptTokens(totalTokensWithBacklinks);
					
					// Refresh search results to show/hide items based on new token counts
					await this.performSearch();
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
			this.updateSaveButtonState();
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
		const toggleLabel = compactRow.createSpan({ text: "Auto-tag notes after quiz generation", cls: "auto-tag-label-qg" });
		const toggleEl = compactRow.createEl("input", { type: "checkbox", cls: "auto-tag-checkbox-qg" });
		toggleEl.checked = this.autoTagEnabled;
		toggleEl.addEventListener("change", () => {
			this.autoTagEnabled = toggleEl.checked;
			this.updateClearButtonVisibility();
			this.updateSaveButtonState();
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
			this.updateSaveButtonState();
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
			this.updateSaveButtonState();
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
		
		// Load backlink and content selection settings
		this.includeBacklinks = bmData.includeBacklinks || false;
		this.contentSelectionMode = bmData.contentSelectionMode || ContentSelectionMode.FULL_PAGE;

		// Update the UI to reflect loaded values
		this.renderSearchBar();
		this.renderContentSelectionUI();
		this.renderAutoTagUI();
		
		// If there are advanced filters, show them
		if (this.filterTag || this.filterFolder || this.filterDate !== "any") {
			this.showAdvanced = true;
			this.toggleAdvancedFilters();
		}
		
		// Update save button state after loading bookmark
		this.updateSaveButtonState();

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
			
			// Update action link visibility
			this.updateActionLink();
			
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
			
			// Update action link visibility
			this.updateActionLink();
		}
	}
	
	private async calculateAllTokens(): Promise<void> {
		this.setLoadingCursor();
		
		try {
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
				contentToStore = await this.extractContentChanges(file, noteContents);
			}
			
			this.selectedNotes.set(file.path, contentToStore);
			this.preparedContent.set(file.path, contentToStore);
			
			// Update individual note token display
			const tokenElement = this.noteTokenElements.get(file.path);
			if (tokenElement) {
				const tokens = countNoteTokens(contentToStore);
				tokenElement.textContent = tokens + " tokens";
				// Update styling based on new token count
				this.updateItemStyling(file.path, tokens);
			}
			
			// Update progress
			this.tokenCalculationProgress = ((i + 1) / totalFiles) * 100;
			
			// Recalculate tokens
			let totalTokens = 0;
			for (const content of this.selectedNotes.values()) {
				totalTokens += countNoteTokens(content);
			}
			// Re-render backlinks if enabled (they may have changed with mode switch)
			if (this.includeBacklinks) {
				// Clear existing backlink containers
				this.selectedFilesContainer?.querySelectorAll(".backlinks-container-qg").forEach(el => el.remove());
				// Re-collect and render backlinks for all selected notes
				this.backlinkMap.clear();
				this.backlinkContent.clear();
				for (const [filePath, files] of this.selectedNoteFiles.entries()) {
					for (const file of files) {
						if (file instanceof TFile) {
							await this.renderBacklinksForNote(file);
						}
					}
				}
			}
			
			// Calculate total tokens including backlinks
			const totalTokensWithBacklinks = this.calculateTotalTokens();
			this.promptTokens = totalTokensWithBacklinks;
			this.updatePromptTokens(totalTokensWithBacklinks);
		}
		
		if (this.tokenCalculationCancelled) {
			this.needsRecalculation = true;
			this.isCalculatingTokens = false;
			// Recalculate with backlinks if enabled
			const totalTokensWithBacklinks = this.calculateTotalTokens();
			this.updatePromptTokens(totalTokensWithBacklinks);
		} else {
			this.isCalculatingTokens = false;
			this.needsRecalculation = false;
		}
		
		// Refresh search results to show/hide items based on new token counts
		await this.performSearch();
		} finally {
			this.unsetLoadingCursor();
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
		
		// Find the last entry at or before threshold - this will be our base state
		let lastEntryBeforeThreshold: {name: string, timestamp: number, isFull: boolean, zipEntry: JSZip.JSZipObject} | null = null;
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.timestamp <= thresholdMs) {
				lastEntryBeforeThreshold = entry;
				break;
			}
		}
		
		// If no entry at or before threshold exists, all entries are after threshold
		// In this case, the state at threshold is empty (file didn't exist or was empty)
		if (!lastEntryBeforeThreshold) {
			return "";
		}
		
		// Reconstruct state at the last entry before threshold
		// Start from the latest entry and apply patches backwards until we reach lastEntryBeforeThreshold
		let data = latestStoredContent;
		
		// Process entries from newest to oldest (reverse order)
		// We want to go back in time from the latest entry to the last entry before threshold
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			
			// Apply this edit backwards (patch goes newer -> older, so applying it goes back in time)
			const diffContent = await entry.zipEntry.async("string");
			
			if (entry.isFull) {
				// Full version stored - this is the state at this timestamp
				// Use it as the starting point for applying older patches
				data = diffContent;
			} else {
				// Patch - apply it to go backwards in time
				const patch = dmp.patch_fromText(diffContent);
				const result = dmp.patch_apply(patch, data);
				if (!result[1].every(x => x)) {
					console.warn(`[reconstructFileAtTime] Some patches failed to apply`);
				}
				data = result[0]; // result[0] is the patched text, result[1] is success array
			}
			
			// Stop after we've processed the last entry at or before threshold
			if (entry.timestamp <= thresholdMs) {
				break;
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
		
		const extracted = newContentParts.join('');
		return extracted;
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
			
			// Check if current file has changes not yet stored in .edtz
			// Compare latest stored version with current content
			const currentDiff = dmp.diff_main(latestStoredContent, currentContent);
			const hasUnstoredChanges = currentDiff.some(([op]) => op !== 0); // Any non-equal operations
			
			// Check if file modification time is after threshold (indicating unstored changes after threshold)
			const fileModTime = file.stat.mtime;
			const hasRecentModifications = fileModTime > thresholdMs;
			
			// Only return empty if there are no edits after threshold AND no unstored changes after threshold
			if (editsAfterThreshold.length === 0 && !hasUnstoredChanges) {
				// No edits after threshold and no unstored changes - return empty
				return "";
			}
			
			// If there are no edits in .edtz after threshold but there are unstored changes,
			// we still need to process them. Check if unstored changes happened after threshold.
			if (editsAfterThreshold.length === 0 && hasUnstoredChanges) {
				// If file was modified after threshold, we should process unstored changes
				// Otherwise, the unstored changes happened before threshold, so return empty
				if (!hasRecentModifications) {
					return "";
				}
			}
			
			// Reconstruct file state at threshold by going backwards from latest stored version
			// If the latest entry is before or at threshold, we can use it directly as the state at threshold
			let stateAtThreshold: string;
			if (latestEntry.timestamp <= thresholdMs) {
				// Latest entry is at or before threshold, so state at threshold is the latest stored content
				stateAtThreshold = latestStoredContent;
			} else {
				// Latest entry is after threshold, need to reconstruct backwards to threshold
				stateAtThreshold = await this.reconstructFileAtTime(
					zip,
					entries,
					thresholdMs,
					latestStoredContent
				);
			}
			
			// Calculate final state to compare against
			const finalState = hasUnstoredChanges ? currentContent : latestStoredContent;
			
			// Extract only new content (insertions) added after threshold
			const newContent = this.extractNewContent(stateAtThreshold, finalState);
			
			// Clean up the content (remove frontmatter if needed)
			const hasFrontMatter = getFrontMatterInfo(newContent).exists;
			const cleanedContent = cleanUpNoteContents(newContent, hasFrontMatter);
			
			return cleanedContent;
			
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
		
		if (this.filterDate === "custom" && this.customFilterDate) {
			return this.customFilterDate;
		}
		
		// Parse days from filterDate (supports fractional days for hours)
		const days = parseFloat(this.filterDate);
		if (isNaN(days)) return null;
		
		// Calculate milliseconds ago
		const msAgo = days * 24 * 60 * 60 * 1000;
		const threshold = new Date(Date.now() - msAgo);
		return threshold;
	}
	
	private formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
	
	private formatTimeForInput(date: Date): string {
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}
	
	private updateSaveButtonState(): void {
		if (!this.saveSearchBtn) return;
		
		// Check if any settings differ from defaults
		const hasNonDefaultSettings = 
			this.searchQuery.trim() !== "" ||
			this.filterTag.trim() !== "" ||
			this.filterFolder.trim() !== "" ||
			this.filterDate !== "any" ||
			this.customFilterDate !== null ||
			this.removeFilteredTags !== false ||
			this.autoTagEnabled !== false ||
			this.autoTags.trim() !== "" ||
			this.tagPlacement !== TagPlacement.FRONTMATTER ||
			this.includeBacklinks !== false ||
			this.contentSelectionMode !== ContentSelectionMode.FULL_PAGE;
		
		// Enable button if there are non-default settings, disable otherwise
		this.saveSearchBtn.disabled = !hasNonDefaultSettings;
		
		// Update tooltip
		if (hasNonDefaultSettings) {
			this.saveSearchBtn.setAttribute("aria-label", "Save current search");
		} else {
			this.saveSearchBtn.setAttribute("aria-label", "No search criteria configured to save");
		}
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
