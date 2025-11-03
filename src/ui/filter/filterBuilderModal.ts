import { App, ButtonComponent, DropdownComponent, Modal, Notice, Setting, TextComponent, TFile, ToggleComponent } from "obsidian";
import { QuizSettings } from "../../settings/config";
import {
	DateFilterType,
	DateRangeFilter,
	DateRangeType,
	FileNameFilter,
	Filter,
	FilterQuery,
	FilterType,
	FolderFilter,
	FrontmatterFilter,
	LogicalOperator,
	TagFilter,
	TextContentFilter,
	TextSearchMode
} from "../../filters/filterTypes";
import { FilterEvaluator } from "../../filters/filterEvaluator";
import { FilterQueryBuilder } from "../../filters/filterQuery";

export default class FilterBuilderModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly callback: (files: TFile[], query?: FilterQuery) => void;
	private readonly selectorModal: HTMLElement;
	private filterQuery: FilterQuery;
	private filterEvaluator: FilterEvaluator;
	private filtersContainer!: HTMLDivElement;
	private matchCountElement!: HTMLSpanElement;
	private bookmarkNameInput: TextComponent | null = null;
	private matchingFiles: TFile[] = [];

	constructor(app: App, settings: QuizSettings, selectorModal: HTMLElement, callback: (files: TFile[], query?: FilterQuery) => void, existingQuery?: FilterQuery) {
		super(app);
		this.settings = settings;
		this.callback = callback;
		this.selectorModal = selectorModal;
		this.filterQuery = existingQuery || FilterQueryBuilder.createEmpty();
		this.filterEvaluator = new FilterEvaluator(app);
	}

	public onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("modal-qg");
		this.contentEl.addClass("modal-content-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Filter Pages");

		this.containerEl.children[0].addClass("remove-opacity-qg");
		this.modalEl.addClass("move-right-qg");
		this.selectorModal.addClass("move-left-qg");

		this.renderFilterBuilder();
	}

	public onClose(): void {
		super.onClose();
		this.selectorModal.removeClass("move-left-qg");
	}

	private renderFilterBuilder(): void {
		this.contentEl.empty();

		// Global operator setting
		new Setting(this.contentEl)
			.setName("Combine filter groups with")
			.setDesc("Choose how to combine multiple filter groups")
			.addDropdown(dropdown => {
				dropdown
					.addOption(LogicalOperator.AND, "AND (all must match)")
					.addOption(LogicalOperator.OR, "OR (any can match)")
					.setValue(this.filterQuery.globalOperator)
					.onChange(async (value) => {
						this.filterQuery.globalOperator = value as LogicalOperator;
						await this.updateMatchCount();
					});
			});

		// Filters container
		this.filtersContainer = this.contentEl.createDiv("filters-container-qg");
		this.renderFilterGroups();

		// Add filter group button
		new Setting(this.contentEl)
			.addButton(button => {
				button
					.setButtonText("Add Filter Group")
					.setCta()
					.onClick(() => {
						this.filterQuery.groups.push({
							filters: [],
							operator: LogicalOperator.AND
						});
						this.renderFilterGroups();
					});
			});

		// Match count
		const matchContainer = this.contentEl.createDiv("match-count-container-qg");
		this.matchCountElement = matchContainer.createSpan("match-count-qg");
		this.matchCountElement.addEventListener("click", () => {
			if (this.matchingFiles.length > 0) {
				this.showMatchingFilesModal();
			}
		});
		this.updateMatchCount();

		// Bookmark section
		const bookmarkSection = this.contentEl.createDiv("bookmark-section-qg");
		bookmarkSection.createEl("h3", { text: "Bookmark this filter (optional)" });
		
		new Setting(bookmarkSection)
			.setName("Bookmark name")
			.setDesc("Save this filter for quick access")
			.addText(text => {
				this.bookmarkNameInput = text;
				text.setPlaceholder("e.g., Study Notes");
			});

		// Action buttons
		const buttonContainer = this.contentEl.createDiv("modal-button-container-qg");
		
		new ButtonComponent(buttonContainer)
			.setButtonText("Apply Filter")
			.setCta()
			.onClick(async () => {
				await this.applyFilter();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
			});
	}

	private renderFilterGroups(): void {
		this.filtersContainer.empty();

		if (this.filterQuery.groups.length === 0) {
			this.filtersContainer.createDiv("no-filters-message-qg").setText("No filter groups. Click 'Add Filter Group' to start.");
			return;
		}

		this.filterQuery.groups.forEach((group, groupIndex) => {
			const groupContainer = this.filtersContainer.createDiv("filter-group-qg");
			
			// Group header
			const groupHeader = groupContainer.createDiv("filter-group-header-qg");
			groupHeader.createEl("h4", { text: `Filter Group ${groupIndex + 1}` });

			// Group operator
			new Setting(groupContainer)
				.setName("Combine filters with")
				.addDropdown(dropdown => {
					dropdown
						.addOption(LogicalOperator.AND, "AND")
						.addOption(LogicalOperator.OR, "OR")
						.setValue(group.operator)
						.onChange(async (value) => {
							group.operator = value as LogicalOperator;
							await this.updateMatchCount();
						});
				})
				.addButton(button => {
					button
						.setButtonText("Remove Group")
						.setWarning()
						.onClick(() => {
							this.filterQuery.groups.splice(groupIndex, 1);
							this.renderFilterGroups();
							this.updateMatchCount();
						});
				});

			// Render filters in this group
			group.filters.forEach((filter, filterIndex) => {
				this.renderFilter(groupContainer, groupIndex, filterIndex, filter);
			});

			// Add filter to group button
			new Setting(groupContainer)
				.addButton(button => {
					button
						.setButtonText("Add Filter")
						.onClick(() => {
							this.showAddFilterMenu(groupIndex);
						});
				});
		});
	}

	private renderFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: Filter): void {
		const filterContainer = container.createDiv("filter-item-qg");
		
		const filterHeader = filterContainer.createDiv("filter-item-header-qg");
		
		// Negation toggle
		const negateToggle = filterHeader.createEl("button", { 
			cls: "filter-negate-toggle-qg " + (filter.negate ? "active" : ""),
			title: "Click to invert this filter (NOT)"
		});
		negateToggle.textContent = filter.negate ? "NOT" : "IS";
		negateToggle.addEventListener("click", async () => {
			filter.negate = !filter.negate;
			this.renderFilterGroups();
			await this.updateMatchCount();
		});
		
		// Filter type label
		filterHeader.createEl("span", { text: this.getFilterTypeLabel(filter.type), cls: "filter-type-label-qg" });
		
		// Remove button
		const removeButton = filterHeader.createEl("button", { text: "×", cls: "filter-remove-button-qg" });
		removeButton.addEventListener("click", () => {
			this.filterQuery.groups[groupIndex].filters.splice(filterIndex, 1);
			this.renderFilterGroups();
			this.updateMatchCount();
		});

		const filterContent = filterContainer.createDiv("filter-item-content-qg");
		this.renderFilterContent(filterContent, groupIndex, filterIndex, filter);
	}

	private renderFilterContent(container: HTMLElement, groupIndex: number, filterIndex: number, filter: Filter): void {
		switch (filter.type) {
			case FilterType.TAG:
				this.renderTagFilter(container, groupIndex, filterIndex, filter);
				break;
			case FilterType.FRONTMATTER:
				this.renderFrontmatterFilter(container, groupIndex, filterIndex, filter);
				break;
			case FilterType.FOLDER:
				this.renderFolderFilter(container, groupIndex, filterIndex, filter);
				break;
			case FilterType.DATE_RANGE:
				this.renderDateRangeFilter(container, groupIndex, filterIndex, filter);
				break;
			case FilterType.TEXT_CONTENT:
				this.renderTextContentFilter(container, groupIndex, filterIndex, filter);
				break;
			case FilterType.FILE_NAME:
				this.renderFileNameFilter(container, groupIndex, filterIndex, filter);
				break;
		}
	}

	private renderTagFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: TagFilter): void {
		new Setting(container)
			.setName("Tag")
			.setClass("compact-filter-setting-qg")
			.addText(text => {
				text
					.setPlaceholder("#tag")
					.setValue(filter.tag)
					.onChange(async (value) => {
						filter.tag = value;
						await this.updateMatchCount();
					});
				text.inputEl.style.width = "200px";
			});
	}

	private renderFrontmatterFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: FrontmatterFilter): void {
		const row = container.createDiv("filter-row-qg");
		
		new Setting(row)
			.setName("Property")
			.setClass("compact-filter-setting-qg inline-filter-setting-qg")
			.addText(text => {
				text
					.setPlaceholder("property")
					.setValue(filter.property)
					.onChange(async (value) => {
						filter.property = value;
						await this.updateMatchCount();
					});
				text.inputEl.style.width = "120px";
			})
			.addDropdown(dropdown => {
				dropdown
					.addOption("equals", "=")
					.addOption("contains", "contains")
					.addOption("exists", "exists")
					.addOption("not-exists", "doesn't exist")
					.setValue(filter.operator)
					.onChange(async (value) => {
						filter.operator = value as FrontmatterFilter["operator"];
						this.renderFilterGroups();
						await this.updateMatchCount();
					});
			});

		if (filter.operator === "equals" || filter.operator === "contains") {
			row.createSpan({ text: " " });
			new Setting(row)
				.setClass("compact-filter-setting-qg inline-filter-setting-qg")
				.addText(text => {
					text
						.setPlaceholder("value")
						.setValue(filter.value || "")
						.onChange(async (value) => {
							filter.value = value;
							await this.updateMatchCount();
						});
					text.inputEl.style.width = "120px";
				});
		}
	}

	private renderFolderFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: FolderFilter): void {
		new Setting(container)
			.setName("Folder")
			.setClass("compact-filter-setting-qg")
			.addText(text => {
				text
					.setPlaceholder("path/to/folder")
					.setValue(filter.path)
					.onChange(async (value) => {
						filter.path = value;
						await this.updateMatchCount();
					});
				text.inputEl.style.width = "200px";
			})
			.addToggle(toggle => {
				toggle
					.setValue(filter.includeSubfolders)
					.onChange(async (value) => {
						filter.includeSubfolders = value;
						await this.updateMatchCount();
					});
				const label = container.createSpan({ text: "Include subfolders", cls: "toggle-label-qg" });
				toggle.toggleEl.parentElement?.appendChild(label);
			});
	}

	private renderDateRangeFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: DateRangeFilter): void {
		new Setting(container)
			.setName("Date")
			.setClass("compact-filter-setting-qg")
			.addDropdown(dropdown => {
				dropdown
					.addOption(DateFilterType.MODIFIED, "Modified")
					.addOption(DateFilterType.CREATED, "Created")
					.setValue(filter.dateType)
					.onChange(async (value) => {
						filter.dateType = value as DateFilterType;
						await this.updateMatchCount();
					});
			})
			.addDropdown(dropdown => {
				dropdown
					.addOption(DateRangeType.LAST_N_DAYS, "last")
					.addOption(DateRangeType.BEFORE, "before")
					.addOption(DateRangeType.AFTER, "after")
					.addOption(DateRangeType.CUSTOM, "between")
					.setValue(filter.rangeType)
					.onChange(async (value) => {
						filter.rangeType = value as DateRangeType;
						this.renderFilterGroups();
						await this.updateMatchCount();
					});
			});

		if (filter.rangeType === DateRangeType.LAST_N_DAYS) {
			const inputSetting = new Setting(container)
				.setClass("compact-filter-setting-qg inline-filter-setting-qg");
			inputSetting.controlEl.createSpan({ text: "  " });
			inputSetting.addText(text => {
				text
					.setPlaceholder("7")
					.setValue(filter.days?.toString() || "")
					.onChange(async (value) => {
						filter.days = parseInt(value) || 0;
						await this.updateMatchCount();
					});
				text.inputEl.type = "number";
				text.inputEl.style.width = "60px";
			});
			inputSetting.controlEl.createSpan({ text: " days", cls: "toggle-label-qg" });
		} else if (filter.rangeType === DateRangeType.BEFORE || filter.rangeType === DateRangeType.AFTER) {
			const inputSetting = new Setting(container)
				.setClass("compact-filter-setting-qg inline-filter-setting-qg");
			inputSetting.controlEl.createSpan({ text: "  " });
			inputSetting.addText(text => {
				text
					.setValue(filter.date || "")
					.onChange(async (value) => {
						filter.date = value;
						await this.updateMatchCount();
					});
				text.inputEl.type = "date";
				text.inputEl.style.width = "150px";
			});
		} else if (filter.rangeType === DateRangeType.CUSTOM) {
			const inputSetting = new Setting(container)
				.setClass("compact-filter-setting-qg inline-filter-setting-qg");
			inputSetting.controlEl.createSpan({ text: "  " });
			inputSetting.addText(text => {
				text
					.setValue(filter.startDate || "")
					.onChange(async (value) => {
						filter.startDate = value;
						await this.updateMatchCount();
					});
				text.inputEl.type = "date";
				text.inputEl.style.width = "140px";
			});
			inputSetting.controlEl.createSpan({ text: " and ", cls: "toggle-label-qg" });
			inputSetting.addText(text => {
				text
					.setValue(filter.endDate || "")
					.onChange(async (value) => {
						filter.endDate = value;
						await this.updateMatchCount();
					});
				text.inputEl.type = "date";
				text.inputEl.style.width = "140px";
			});
		}
	}

	private renderTextContentFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: TextContentFilter): void {
		new Setting(container)
			.setName("Search")
			.setClass("compact-filter-setting-qg")
			.addText(text => {
				text
					.setPlaceholder("search text")
					.setValue(filter.query)
					.onChange(async (value) => {
						filter.query = value;
						await this.updateMatchCount();
					});
				text.inputEl.style.width = "180px";
			})
			.addDropdown(dropdown => {
				dropdown
					.addOption(TextSearchMode.CONTAINS, "contains")
					.addOption(TextSearchMode.EXACT, "exact")
					.addOption(TextSearchMode.REGEX, "regex")
					.setValue(filter.searchMode)
					.onChange(async (value) => {
						filter.searchMode = value as TextSearchMode;
						await this.updateMatchCount();
					});
			})
			.addToggle(toggle => {
				toggle
					.setValue(filter.caseSensitive)
					.onChange(async (value) => {
						filter.caseSensitive = value;
						await this.updateMatchCount();
					});
				const label = container.createSpan({ text: "Case sensitive", cls: "toggle-label-qg" });
				toggle.toggleEl.parentElement?.appendChild(label);
			});
	}

	private renderFileNameFilter(container: HTMLElement, groupIndex: number, filterIndex: number, filter: FileNameFilter): void {
		new Setting(container)
			.setName("Pattern")
			.setClass("compact-filter-setting-qg")
			.addText(text => {
				text
					.setPlaceholder("filename")
					.setValue(filter.pattern)
					.onChange(async (value) => {
						filter.pattern = value;
						await this.updateMatchCount();
					});
				text.inputEl.style.width = "200px";
			})
			.addToggle(toggle => {
				toggle
					.setValue(filter.isRegex)
					.onChange(async (value) => {
						filter.isRegex = value;
						await this.updateMatchCount();
					});
				const label = container.createSpan({ text: "Use regex", cls: "toggle-label-qg" });
				toggle.toggleEl.parentElement?.appendChild(label);
			});
	}

	private showAddFilterMenu(groupIndex: number): void {
		// Create inline selector instead of popup
		const group = this.filterQuery.groups[groupIndex];
		const tempFilterContainer = this.filtersContainer.children[groupIndex] as HTMLElement;
		const addFilterContainer = tempFilterContainer.createDiv("add-filter-inline-qg");
		
		new Setting(addFilterContainer)
			.setName("Add filter")
			.addDropdown(dropdown => {
				dropdown
					.addOption("", "Choose filter type...")
					.addOption(FilterType.TAG, "🏷️ Tag")
					.addOption(FilterType.FRONTMATTER, "📝 Frontmatter Property")
					.addOption(FilterType.FOLDER, "📁 Folder")
					.addOption(FilterType.DATE_RANGE, "📅 Date Range")
					.addOption(FilterType.TEXT_CONTENT, "🔍 Text Content")
					.addOption(FilterType.FILE_NAME, "📄 File Name")
					.onChange((value) => {
						if (value) {
							this.addFilter(groupIndex, value as FilterType);
							addFilterContainer.remove();
						}
					});
			})
			.addButton(button => {
				button
					.setButtonText("Cancel")
					.onClick(() => {
						addFilterContainer.remove();
					});
			});
	}

	private addFilter(groupIndex: number, filterType: FilterType): void {
		let newFilter: Filter;

		switch (filterType) {
			case FilterType.TAG:
				newFilter = { type: FilterType.TAG, tag: "" };
				break;
			case FilterType.FRONTMATTER:
				newFilter = { type: FilterType.FRONTMATTER, property: "", operator: "exists" };
				break;
			case FilterType.FOLDER:
				newFilter = { type: FilterType.FOLDER, path: "", includeSubfolders: false };
				break;
			case FilterType.DATE_RANGE:
				newFilter = { type: FilterType.DATE_RANGE, dateType: DateFilterType.MODIFIED, rangeType: DateRangeType.LAST_N_DAYS, days: 7 };
				break;
			case FilterType.TEXT_CONTENT:
				newFilter = { type: FilterType.TEXT_CONTENT, searchMode: TextSearchMode.CONTAINS, query: "", caseSensitive: false };
				break;
			case FilterType.FILE_NAME:
				newFilter = { type: FilterType.FILE_NAME, pattern: "", isRegex: false };
				break;
			default:
				return;
		}

		this.filterQuery.groups[groupIndex].filters.push(newFilter);
		this.renderFilterGroups();
	}

	private getFilterTypeLabel(type: FilterType): string {
		switch (type) {
			case FilterType.TAG: return "Tag";
			case FilterType.FRONTMATTER: return "Frontmatter";
			case FilterType.FOLDER: return "Folder";
			case FilterType.DATE_RANGE: return "Date Range";
			case FilterType.TEXT_CONTENT: return "Text Content";
			case FilterType.FILE_NAME: return "File Name";
			default: return "Unknown";
		}
	}

	private async updateMatchCount(): Promise<void> {
		try {
			this.matchingFiles = await this.filterEvaluator.getMatchingFiles(this.filterQuery);
			this.matchCountElement.textContent = `Matching files: ${this.matchingFiles.length}`;
			
			// Make it clickable to show file list
			this.matchCountElement.addClass("clickable-match-count-qg");
			this.matchCountElement.title = "Click to view matching files";
		} catch (error) {
			this.matchCountElement.textContent = `Error evaluating filters`;
			this.matchCountElement.removeClass("clickable-match-count-qg");
			this.matchCountElement.title = "";
			console.error("Filter evaluation error:", error);
		}
	}

	private async applyFilter(): Promise<void> {
		if (this.filterQuery.groups.length === 0) {
			new Notice("Please add at least one filter group");
			return;
		}

		// Check if any group has no filters
		for (const group of this.filterQuery.groups) {
			if (group.filters.length === 0) {
				new Notice("All filter groups must have at least one filter");
				return;
			}
		}

		// Save bookmark if name provided
		const bookmarkName = this.bookmarkNameInput?.getValue().trim();
		if (bookmarkName) {
			const bookmark = {
				id: Date.now().toString(),
				name: bookmarkName,
				query: JSON.parse(JSON.stringify(this.filterQuery)),
				createdAt: Date.now(),
				updatedAt: Date.now()
			};

			this.settings.bookmarkedFilters.push(bookmark);
			await (this.app as any).plugins.plugins["obsidian-quiz-generator"].saveSettings();
			new Notice(`Filter bookmarked as "${bookmarkName}"`);
		}

		this.callback(this.matchingFiles, this.filterQuery);
		this.close();
	}

	private showMatchingFilesModal(): void {
		const modal = new Modal(this.app);
		modal.modalEl.addClass("matching-files-modal-qg");
		modal.titleEl.setText(`Matching Files (${this.matchingFiles.length})`);
		modal.titleEl.addClass("modal-title-qg");

		const content = modal.contentEl;
		content.addClass("matching-files-content-qg");

		if (this.matchingFiles.length === 0) {
			content.createDiv("no-matches-qg").setText("No files match the current filters");
		} else {
			const fileList = content.createDiv("file-list-qg");
			
			this.matchingFiles
				.sort((a, b) => a.path.localeCompare(b.path))
				.forEach(file => {
					const fileItem = fileList.createDiv("file-list-item-qg");
					
					const fileName = fileItem.createDiv("file-name-qg");
					fileName.setText(file.basename);
					
					const filePath = fileItem.createDiv("file-path-qg");
					filePath.setText(file.parent?.path ? file.parent.path + "/" : "/");
					
					fileItem.addEventListener("click", () => {
						// Open the file in Obsidian
						this.app.workspace.getLeaf().openFile(file);
					});
				});
		}

		modal.open();
	}
}

