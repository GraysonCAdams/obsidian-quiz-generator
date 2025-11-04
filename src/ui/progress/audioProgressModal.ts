import { Modal, App } from "obsidian";

export default class AudioProgressModal extends Modal {
	private progressBar!: HTMLDivElement;
	private statusText!: HTMLDivElement;
	private progressPercent!: HTMLDivElement;

	constructor(app: App) {
		super(app);
	}

	public onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("progress-modal-qg");
		this.contentEl.addClass("progress-content-qg");
		this.titleEl.addClass("progress-title-qg");
		this.titleEl.setText("Generating Audio");

		// Add wait cursor to document body
		document.body.style.cursor = "wait";

		// Status text
		this.statusText = this.contentEl.createDiv("progress-status-qg");
		this.statusText.setText("Checking cache...");

		// Progress bar container
		const progressContainer = this.contentEl.createDiv("progress-bar-container-qg");
		this.progressBar = progressContainer.createDiv("progress-bar-qg");
		this.progressBar.style.width = "0%";

		// Progress percentage text
		this.progressPercent = this.contentEl.createDiv("progress-percent-qg");
		this.progressPercent.setText("0%");
	}

	public updateProgress(current: number, total: number, cached: number): void {
		const percentage = Math.round((current / total) * 100);
		
		let statusText = `Generating audio: ${current}/${total} questions`;
		if (cached > 0) {
			statusText += ` (${cached} from cache)`;
		}
		this.statusText.setText(statusText);
		this.progressBar.style.width = `${percentage}%`;
		this.progressPercent.setText(`${percentage}%`);
	}

	public complete(): void {
		this.statusText.setText("Audio ready!");
		this.progressBar.style.width = "100%";
		this.progressPercent.setText("100%");
		setTimeout(() => {
			this.close();
		}, 500);
	}

	public error(message: string): void {
		this.statusText.setText(message);
		this.statusText.addClass("progress-error-qg");
		this.progressBar.style.width = "100%";
	}

	public onClose(): void {
		// Restore default cursor
		document.body.style.cursor = "";
		super.onClose();
	}
}

