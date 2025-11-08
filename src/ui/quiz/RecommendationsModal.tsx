import { App, Modal, Component, MarkdownRenderer, Notice, setIcon } from "obsidian";
import { QuizSettings } from "../../settings/config";
import type QuizGenerator from "../../main";
import { Question } from "../../utils/types";
import ConversationModeModal from "./ConversationModeModal";
import {
	isTrueFalse,
	isMultipleChoice,
	isSelectAllThatApply,
	isFillInTheBlank,
	isMatching,
	isShortOrLongAnswer
} from "../../utils/typeGuards";

interface MissedQuestionDetail {
	question: Question;
	userAnswer: any;
}

export default class RecommendationsModal extends Modal {
	private readonly recommendations: string;
	private readonly settings: QuizSettings;
	private readonly plugin?: QuizGenerator;
	private readonly missedQuestions: MissedQuestionDetail[];

	constructor(app: App, settings: QuizSettings, plugin: QuizGenerator | undefined, recommendations: string, missedQuestions: MissedQuestionDetail[]) {
		super(app);
		this.recommendations = recommendations;
		this.settings = settings;
		this.plugin = plugin;
		this.missedQuestions = missedQuestions;
		this.modalEl.addClass("quiz-recommendations-modal-qg");
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		
		const content = this.contentEl;
		content.empty();
		
		const titleContainer = content.createDiv("quiz-recommendations-header-qg");
		const iconSpan = titleContainer.createSpan("quiz-recommendations-icon-qg");
		setIcon(iconSpan, "brain-cog");
		titleContainer.createEl("h2", { text: "Study Recommendations", cls: "quiz-recommendations-title-qg" });
		
		const recommendationsContainer = content.createDiv("quiz-recommendations-content-qg");
		const component = new Component();
		await MarkdownRenderer.render(this.app, this.recommendations, recommendationsContainer, "", component);
		
		const buttonContainer = content.createDiv("quiz-recommendations-buttons-qg");
		const converseButton = buttonContainer.createEl("button", {
			cls: "mod-cta recommendations-converse-button-qg"
		});
		const converseIcon = converseButton.createSpan({ cls: "recommendations-converse-icon-qg" });
		setIcon(converseIcon, "message-circle");
		converseButton.createSpan({ text: "Converse" });
		
		converseButton.addEventListener("click", async () => {
			await this.handleConverse();
		});
		
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
			cls: "mod-secondary"
		});
		closeButton.addEventListener("click", () => {
			this.close();
		});
	}

	private async handleConverse(): Promise<void> {
		if (!this.plugin) {
			new Notice("Conversation mode is unavailable without the plugin context.");
			return;
		}

		if (this.missedQuestions.length === 0) {
			new Notice("No missed questions available for conversation.");
			return;
		}

		const extraContext = this.buildConversationContext();
		const questions = this.missedQuestions.map(item => item.question);

		const conversationModal = new ConversationModeModal(
			this.app,
			questions,
			this.settings,
			this.plugin,
			extraContext
		);
		conversationModal.open();
	}

	private buildConversationContext(): string {
		const focusEntries = this.missedQuestions.map((item, index) => {
			const questionText = this.cleanText(item.question.question);
			const typeLabel = this.getQuestionTypeLabel(item.question);
			const userAnswerText = this.formatAnswer(item.question, item.userAnswer);
			const correctAnswerText = this.formatAnswer(item.question, (item.question as any).answer);

			return `${index + 1}. ${questionText}
   Type: ${typeLabel}
   Your Answer: ${userAnswerText}
   Correct Answer: ${correctAnswerText}`;
		}).join("\n\n");

		return `${this.recommendations.trim()}\n\nFocus Questions:\n${focusEntries}`;
	}

	private cleanText(text: string): string {
		return text.replace(/\s+/g, " ").trim();
	}

	private getQuestionTypeLabel(question: Question): string {
		if (isTrueFalse(question)) return "True/False";
		if (isMultipleChoice(question)) return "Multiple Choice";
		if (isSelectAllThatApply(question)) return "Select All That Apply";
		if (isFillInTheBlank(question)) return "Fill in the Blank";
		if (isMatching(question)) return "Matching";
		if (isShortOrLongAnswer(question)) return "Short/Long Answer";
		return "Question";
	}

	private formatAnswer(question: Question, answer: any): string {
		if (answer === undefined || answer === null) {
			return "No answer";
		}

		if (isTrueFalse(question)) {
			return answer ? "True" : "False";
		}

		if (isMultipleChoice(question)) {
			const index = typeof answer === "number" ? answer : NaN;
			if (!Number.isNaN(index) && question.options[index]) {
				return `${String.fromCharCode(65 + index)}. ${this.cleanText(question.options[index])}`;
			}
			return this.stringifyAnswer(answer);
		}

		if (isSelectAllThatApply(question)) {
			if (Array.isArray(answer)) {
				const selections = answer
					.filter((idx: number) => idx >= 0 && idx < question.options.length)
					.map((idx: number) => `${String.fromCharCode(65 + idx)}. ${this.cleanText(question.options[idx])}`);
				return selections.length > 0 ? selections.join(", ") : "No selections";
			}
			return this.stringifyAnswer(answer);
		}

		if (isFillInTheBlank(question)) {
			if (Array.isArray(answer)) {
				return answer.join(", ");
			}
			return this.stringifyAnswer(answer);
		}

		if (isMatching(question)) {
			if (Array.isArray(answer)) {
				return answer
					.map((pair: { leftOption: string; rightOption: string }) => `${pair.leftOption} → ${pair.rightOption}`)
					.join("; ");
			}
			return this.stringifyAnswer(answer);
		}

		if (isShortOrLongAnswer(question)) {
			return typeof answer === "string" ? answer : this.stringifyAnswer(answer);
		}

		return this.stringifyAnswer(answer);
	}

	private stringifyAnswer(answer: any): string {
		if (typeof answer === "string") return answer;
		try {
			return JSON.stringify(answer);
		} catch {
			return String(answer);
		}
	}

	onClose(): void {
		this.contentEl.empty();
		super.onClose();
	}
}

