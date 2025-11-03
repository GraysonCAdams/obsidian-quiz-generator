import { Modal, App } from "obsidian";

export default class ProgressModal extends Modal {
	private progressBar!: HTMLDivElement;
	private statusText!: HTMLDivElement;
	private currentStep: number = 0;
	private totalSteps: number = 5;

	constructor(app: App) {
		super(app);
	}

	public onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("progress-modal-qg");
		this.contentEl.addClass("progress-content-qg");
		this.titleEl.addClass("progress-title-qg");
		this.titleEl.setText("Generating Quiz");

		// Status text
		this.statusText = this.contentEl.createDiv("progress-status-qg");
		this.statusText.setText("Preparing...");

		// Progress bar container
		const progressContainer = this.contentEl.createDiv("progress-bar-container-qg");
		this.progressBar = progressContainer.createDiv("progress-bar-qg");
		this.progressBar.style.width = "0%";

		// Progress percentage text
		const progressPercent = this.contentEl.createDiv("progress-percent-qg");
		progressPercent.setText("0%");
		progressPercent.id = "progress-percent-text";
	}

	public updateProgress(step: number, status: string): void {
		this.currentStep = step;
		const percentage = Math.round((step / this.totalSteps) * 100);
		
		this.statusText.setText(status);
		this.progressBar.style.width = `${percentage}%`;
		
		const percentText = document.getElementById("progress-percent-text");
		if (percentText) {
			percentText.setText(`${percentage}%`);
		}
	}

	public complete(): void {
		this.updateProgress(this.totalSteps, "Complete!");
		setTimeout(() => {
			this.close();
		}, 500);
	}

	public error(message: string): void {
		this.statusText.setText(message);
		this.statusText.addClass("progress-error-qg");
	}

	public onClose(): void {
		super.onClose();
	}
}

