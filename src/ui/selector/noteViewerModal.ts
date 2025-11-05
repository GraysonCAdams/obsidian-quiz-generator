import { App, Component, MarkdownRenderer, Modal, Scope, TFile } from "obsidian";

export default class NoteViewerModal extends Modal {
	private readonly note: TFile;
	private readonly selectorModal: HTMLElement | undefined;
	private readonly component: Component;
	private readonly preparedContent?: string;

	constructor(app: App, note: TFile, selectorModal?: HTMLElement, preparedContent?: string) {
		super(app);
		this.note = note;
		this.selectorModal = selectorModal;
		this.preparedContent = preparedContent;
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "Escape", () => this.close());
		this.component = new Component();
	}

	public async onOpen(): Promise<void> {
		super.onOpen();
		this.modalEl.addClass("modal-qg");
		this.titleEl.addClass("modal-title-qg");
		
		// Show title with indicator if showing prepared content
		const title = this.preparedContent !== undefined 
			? `${this.note.basename} (Prepared Content)`
			: this.note.basename;
		this.titleEl.setText(title);

		this.containerEl.children[0].addClass("remove-opacity-qg");
		this.modalEl.addClass("move-right-qg");
		this.selectorModal?.addClass("move-left-qg");

		// Use prepared content if available, otherwise read the full note
		const content = this.preparedContent !== undefined 
			? this.preparedContent
			: await this.app.vault.cachedRead(this.note);
			
		// Show message if no prepared content
		if (this.preparedContent !== undefined && this.preparedContent.trim().length === 0) {
			this.contentEl.createEl("p", { 
				text: "No changes detected for the selected time period.",
				cls: "no-content-message-qg"
			});
		} else {
			await MarkdownRenderer.render(this.app, content, this.contentEl, "", this.component);
		}
	}

	public onClose(): void {
		super.onClose();
		this.selectorModal?.removeClass("move-left-qg");
	}
}
