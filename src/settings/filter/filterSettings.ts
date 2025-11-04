import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import QuizGenerator from "../../main";
import { FilterBookmark } from "../../filters/filterTypes";
import SelectorModal from "../../ui/selector/selectorModal";

export default function displayFilterSettings(containerEl: HTMLElement, plugin: QuizGenerator): void {
	new Setting(containerEl).setName("Filter Bookmarks").setHeading();
	
	new Setting(containerEl)
		.setName("Bookmarked Filters")
		.setDesc("Manage your saved filter queries. Each bookmark creates a command that can be assigned a hotkey.");

	const bookmarksContainer = containerEl.createDiv("bookmarks-container-qg");
	renderBookmarks(bookmarksContainer, plugin);
}

function renderBookmarks(container: HTMLElement, plugin: QuizGenerator): void {
	container.empty();

	if (plugin.settings.bookmarkedFilters.length === 0) {
		container.createDiv("no-bookmarks-message-qg").setText(
			"No bookmarked filters yet. Create filters in the generator and bookmark them for quick access."
		);
		return;
	}

	plugin.settings.bookmarkedFilters.forEach((bookmark, index) => {
		const bookmarkItem = container.createDiv("bookmark-item-qg");
		
		const bookmarkHeader = bookmarkItem.createDiv("bookmark-header-qg");
		bookmarkHeader.createEl("strong", { text: bookmark.name });
		
		const bookmarkInfo = bookmarkItem.createDiv("bookmark-info-qg");
		const createdDate = new Date(bookmark.createdAt).toLocaleDateString();
		
		// Handle both old and new bookmark formats
		const bmData = bookmark as any;
		let infoText = `Created: ${createdDate}`;
		
		if (bmData.query) {
			// Old format with FilterQuery
			const groupCount = bmData.query.groups.length;
			const totalFilters = bmData.query.groups.reduce((sum: number, group: any) => sum + group.filters.length, 0);
			infoText += ` | ${groupCount} group(s), ${totalFilters} filter(s)`;
		} else {
			// New format with search parameters
			const filters: string[] = [];
			if (bmData.searchQuery) filters.push(`Search: "${bmData.searchQuery}"`);
			if (bmData.filterTag) filters.push(`Tag: ${bmData.filterTag}`);
			if (bmData.filterFolder) filters.push(`Folder: ${bmData.filterFolder}`);
			if (bmData.filterDate && bmData.filterDate !== "any") {
				filters.push(`Modified: Last ${bmData.filterDate} days`);
			}
			if (filters.length > 0) {
				infoText += ` | ${filters.join(", ")}`;
			}
		}
		
		bookmarkInfo.setText(infoText);

		const bookmarkActions = bookmarkItem.createDiv("bookmark-actions-qg");

		new ButtonComponent(bookmarkActions)
			.setButtonText("Use")
			.onClick(async () => {
				// Open the filter with this bookmark
				const modal = new SelectorModal(plugin.app, plugin, undefined, bookmark.id);
				modal.open();
			});

		new ButtonComponent(bookmarkActions)
			.setButtonText("Rename")
			.onClick(async () => {
				const modal = new RenameBookmarkModal(plugin.app, bookmark.name, async (newName: string) => {
					if (newName && newName.trim()) {
						bookmark.name = newName.trim();
						bookmark.updatedAt = Date.now();
						await plugin.saveSettings();
						renderBookmarks(container, plugin);
						new Notice("Bookmark renamed");
					}
				});
				modal.open();
			});

		new ButtonComponent(bookmarkActions)
			.setButtonText("Delete")
			.setWarning()
			.onClick(async () => {
				const modal = new ConfirmDeleteModal(plugin.app, bookmark.name, async () => {
					plugin.settings.bookmarkedFilters.splice(index, 1);
					await plugin.saveSettings();
					renderBookmarks(container, plugin);
					new Notice("Bookmark deleted");
				});
				modal.open();
			});

		// Show command ID for hotkey assignment
		const commandId = `${plugin.manifest.id}:filter-bookmark-${bookmark.id}`;
		const commandInfo = bookmarkItem.createDiv("bookmark-command-info-qg");
		commandInfo.setText(`Command: "Generate quiz from filter: ${bookmark.name}"`);
		commandInfo.style.fontSize = "0.9em";
		commandInfo.style.color = "var(--text-muted)";
		commandInfo.style.marginTop = "5px";
	});
}

// Modal for renaming a bookmark
class RenameBookmarkModal extends Modal {
	private result: string;
	private onSubmit: (result: string) => void;

	constructor(app: App, currentName: string, onSubmit: (result: string) => void) {
		super(app);
		this.result = currentName;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl("h2", { text: "Rename Bookmark" });
		
		const inputContainer = contentEl.createDiv();
		inputContainer.createEl("label", { text: "Bookmark Name:" });
		
		const input = inputContainer.createEl("input", {
			type: "text",
			value: this.result
		});
		input.style.width = "100%";
		input.style.marginTop = "10px";
		input.style.padding = "8px";
		
		// Focus and select all text
		setTimeout(() => {
			input.focus();
			input.select();
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
		
		const saveBtn = buttonContainer.createEl("button", { text: "Rename" });
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

// Modal for confirming bookmark deletion
class ConfirmDeleteModal extends Modal {
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
		
		contentEl.createEl("h2", { text: "Delete Bookmark?" });
		
		const message = contentEl.createDiv();
		message.style.marginBottom = "20px";
		message.createEl("p", { text: `Are you sure you want to delete the bookmark "${this.bookmarkName}"?` });
		message.createEl("p", { 
			text: "This will also remove its associated command.",
			attr: { style: "color: var(--text-muted); font-size: 0.9em;" }
		});
		
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.justifyContent = "flex-end";
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		
		const deleteBtn = buttonContainer.createEl("button", { text: "Delete" });
		deleteBtn.classList.add("mod-warning");
		deleteBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

