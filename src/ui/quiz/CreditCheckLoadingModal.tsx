import { Modal, App } from "obsidian";

export default class CreditCheckLoadingModal extends Modal {
	constructor(app: App) {
		super(app);
		this.modalEl.addClass("credit-check-loading-modal-qg");
	}

	public onOpen(): void {
		super.onOpen();
		this.titleEl.setText("Validating Credits");
		
		const content = this.contentEl.createDiv("credit-check-loading-content-qg");
		
		// Spinner/loading indicator
		const spinner = content.createDiv("credit-check-spinner-qg");
		
		// Status text
		const statusText = content.createDiv("credit-check-loading-text-qg");
		statusText.setText("Checking ElevenLabs credit balance...");
		
		// Add wait cursor to document body
		document.body.style.cursor = "wait";
	}

	public onClose(): void {
		// Restore default cursor
		document.body.style.cursor = "";
		super.onClose();
	}
}

