import { App, Modal, Notice, setIcon } from "obsidian";
import { Question } from "../../utils/types";
import QuizExporter, { ExportFormat } from "../../services/quizExporter";

export default class ExportModal extends Modal {
	private questions: Question[];
	private selectedFormat: ExportFormat | null = null;

	constructor(app: App, questions: Question[]) {
		super(app);
		this.questions = questions;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("export-modal-qg");

		// Title
		const title = contentEl.createEl("h2", { text: "Export Quiz" });
		title.style.marginTop = "0";

		// Description
		const desc = contentEl.createDiv();
		desc.textContent = `Export ${this.questions.length} question(s) to flashcard format:`;
		desc.style.marginBottom = "1.5em";
		desc.style.color = "var(--text-muted)";

		// Format selection buttons
		const formats: { format: ExportFormat; name: string; icon: string; description: string }[] = [
			{
				format: "anki",
				name: "Anki",
				icon: "brain-circuit",
				description: "Tab-separated format for Anki import"
			},
			{
				format: "quizlet",
				name: "Quizlet",
				icon: "graduation-cap",
				description: "CSV format for Quizlet import"
			},
			{
				format: "remnote",
				name: "RemNote",
				icon: "file-text",
				description: "CSV format for RemNote import"
			}
		];

		formats.forEach(({ format, name, icon, description }) => {
			const formatButton = contentEl.createDiv("export-format-button-qg");
			formatButton.setAttribute("data-format", format);
			
			const iconEl = formatButton.createDiv("export-format-icon-qg");
			setIcon(iconEl, icon);
			
			const textContainer = formatButton.createDiv("export-format-text-qg");
			const nameEl = textContainer.createEl("div", { text: name });
			nameEl.style.fontWeight = "600";
			nameEl.style.marginBottom = "0.25em";
			
			const descEl = textContainer.createEl("div", { text: description });
			descEl.style.fontSize = "0.85em";
			descEl.style.color = "var(--text-muted)";

			formatButton.addEventListener("click", () => {
				// Remove selection from all buttons
				contentEl.querySelectorAll(".export-format-button-qg").forEach(btn => {
					btn.removeClass("selected-qg");
				});
				
				// Add selection to clicked button
				formatButton.addClass("selected-qg");
				this.selectedFormat = format;
			});
		});

		// Export button
		const buttonContainer = contentEl.createDiv("export-button-container-qg");
		const exportButton = buttonContainer.createEl("button", { text: "Export", cls: "mod-cta" });
		exportButton.style.width = "100%";
		exportButton.style.marginTop = "1.5em";

		exportButton.addEventListener("click", () => {
			if (!this.selectedFormat) {
				new Notice("Please select an export format");
				return;
			}

			try {
				QuizExporter.export(this.questions, this.selectedFormat);
				new Notice(`Quiz exported to ${this.selectedFormat.toUpperCase()} format`);
				this.close();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				new Notice(`Export failed: ${errorMessage}`);
				console.error("Export error:", error);
			}
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
