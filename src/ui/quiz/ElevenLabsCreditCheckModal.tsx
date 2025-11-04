import { App, Modal } from "obsidian";

interface ElevenLabsCreditCheckModalProps {
	remainingCredits: number | null;
	estimatedCost: number;
	onContinue: () => void;
	onCancel: () => void;
	onDisableAudio: () => Promise<void>;
}

export default class ElevenLabsCreditCheckModal extends Modal {
	private readonly remainingCredits: number | null;
	private readonly estimatedCost: number;
	private readonly onContinue: () => void;
	private readonly onCancel: () => void;
	private readonly onDisableAudio: () => Promise<void>;
	private audioDisabled: boolean = false;

	constructor(
		app: App,
		remainingCredits: number | null,
		estimatedCost: number,
		onContinue: () => void,
		onCancel: () => void,
		onDisableAudio: () => Promise<void>
	) {
		super(app);
		this.remainingCredits = remainingCredits;
		this.estimatedCost = estimatedCost;
		this.onContinue = onContinue;
		this.onCancel = onCancel;
		this.onDisableAudio = onDisableAudio;
		this.modalEl.addClass("elevenlabs-credit-check-modal-qg");
	}

	onOpen(): void {
		super.onOpen();
		this.titleEl.setText("ElevenLabs Credit Check");

		const content = this.contentEl.createDiv("elevenlabs-credit-check-content-qg");

		// Always show credit info
		const info = content.createDiv("credit-info-qg");
		
		if (this.remainingCredits !== null && this.remainingCredits >= 0) {
			info.createEl("p", {
				text: `Remaining Credits: ${this.remainingCredits.toLocaleString()}`
			});
		} else {
			info.createEl("p", {
				text: "⚠️ Unable to fetch credit balance"
			});
		}
		
		info.createEl("p", {
			text: `Estimated Cost: ${this.estimatedCost.toLocaleString()} credits`
		});

		// Check if credits would be exceeded
		// Only check if we have valid credit data
		const wouldExceed = this.remainingCredits !== null && 
			this.remainingCredits >= 0 && 
			this.estimatedCost > this.remainingCredits;

		if (wouldExceed) {
			// Warning message with better styling
			const warning = content.createDiv("credit-warning-qg");
			
			// Icon container
			const warningHeader = warning.createDiv("credit-warning-header-qg");
			const warningIcon = warningHeader.createSpan("credit-warning-icon-qg");
			warningIcon.textContent = "⚠️";
			
			const warningText = warningHeader.createDiv("credit-warning-text-qg");
			warningText.createEl("strong", {
				text: "Insufficient Credits"
			});
			
			// Main message
			const mainMessage = warning.createDiv("credit-warning-message-qg");
			mainMessage.createEl("p", {
				text: `This quiz requires ${this.estimatedCost.toLocaleString()} credits, but you only have ${this.remainingCredits.toLocaleString()} remaining.`
			});
			
			// Instruction
			const instruction = warning.createDiv("credit-warning-instruction-qg");
			instruction.createEl("p", {
				text: "To continue, please disable the audio option below."
			});

			// Disable audio option
			const disableOption = content.createDiv("disable-audio-option-qg");
			const toggleContainer = disableOption.createDiv("toggle-container-qg");
			
			const toggleLabel = toggleContainer.createEl("label", {
				cls: "toggle-label-qg"
			});
			
			const toggle = toggleLabel.createEl("input", {
				type: "checkbox",
				cls: "toggle-checkbox-qg"
			});
			
			toggleLabel.createSpan({ text: "Disable ElevenLabs audio to continue" });
			
			toggle.addEventListener("change", async (e) => {
				this.audioDisabled = (e.target as HTMLInputElement).checked;
				if (this.audioDisabled) {
					// Auto-save when toggled off
					await this.onDisableAudio();
				}
				this.updateContinueButton();
			});

			disableOption.appendChild(toggleContainer);
		} else if (this.remainingCredits !== null) {
			// Show remaining credits after quiz
			const afterCredits = this.remainingCredits - this.estimatedCost;
			info.createEl("p", {
				text: `Credits After: ${afterCredits.toLocaleString()}`
			});
		}

		// Button container
		const buttonContainer = content.createDiv("credit-check-buttons-qg");
		
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-secondary"
		});
		cancelButton.addEventListener("click", async () => {
			this.close();
			// Wait a moment for modal to close before calling callback
			setTimeout(() => {
				this.onCancel();
			}, 100);
		});

		const continueButton = buttonContainer.createEl("button", {
			text: "Continue",
			cls: "mod-cta"
		});
		continueButton.id = "credit-check-continue-btn-qg";
		continueButton.disabled = wouldExceed && !this.audioDisabled;
		
		continueButton.addEventListener("click", async () => {
			if (!wouldExceed || this.audioDisabled) {
				this.close();
				// Wait a moment for modal to close before calling callback
				setTimeout(() => {
					this.onContinue();
				}, 100);
			}
		});

		this.continueButton = continueButton;
	}

	private continueButton: HTMLButtonElement | null = null;

	private updateContinueButton(): void {
		if (this.continueButton) {
			const wouldExceed = this.remainingCredits !== null && 
				this.remainingCredits >= 0 && 
				this.estimatedCost > this.remainingCredits;
			this.continueButton.disabled = wouldExceed && !this.audioDisabled;
		}
	}
}

