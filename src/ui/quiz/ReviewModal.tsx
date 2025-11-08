import { App, Modal, Component, MarkdownRenderer } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question, QuizResult } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";

interface ReviewModalProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	results: QuizResult[];
	userAnswers: Map<number, any>; // Map of question index to user's answer
}

export default class ReviewModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly quiz: Question[];
	private readonly results: QuizResult[];
	private readonly userAnswers: Map<number, any>;

	constructor(app: App, settings: QuizSettings, quiz: Question[], results: QuizResult[], userAnswers: Map<number, any>) {
		super(app);
		this.settings = settings;
		this.quiz = quiz;
		this.results = results;
		this.userAnswers = userAnswers;
		this.modalEl.addClass("quiz-review-modal-qg");
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		
		const content = this.contentEl;
		content.empty();
		
		// Title
		const title = content.createEl("h2", { text: "Quiz Review" });
		title.style.marginBottom = "1em";
		
		// Create scrollable container
		const scrollContainer = content.createDiv("quiz-review-scroll-container-qg");
		
		// Render each question with review
		this.quiz.forEach((question, index) => {
			const result = this.results.find(r => r.questionIndex === index);
			const isCorrect = result?.correct ?? false;
			const userAnswer = this.userAnswers.get(index);
			
			// Add divider before each question except the first
			if (index > 0) {
				const divider = scrollContainer.createDiv("quiz-review-divider-qg");
				divider.style.borderTop = "1px solid var(--background-modifier-border)";
				divider.style.marginTop = "1.5em";
				divider.style.marginBottom = "1.5em";
			}
			
			const questionCard = scrollContainer.createDiv("quiz-review-question-card-qg");
			
			// Question header with status
			const header = questionCard.createDiv("quiz-review-question-header-qg");
			const statusIcon = header.createSpan("quiz-review-status-icon-qg");
			statusIcon.textContent = isCorrect ? "✓" : "✗";
			statusIcon.style.color = isCorrect ? "var(--text-success)" : "var(--text-error)";
			statusIcon.style.fontWeight = "bold";
			statusIcon.style.marginRight = "0.5em";
			
			const questionNumber = header.createSpan("quiz-review-question-number-qg");
			questionNumber.textContent = `Question ${index + 1}`;
			questionNumber.style.fontWeight = "bold";
			
			// Question text
			const questionText = questionCard.createDiv("quiz-review-question-text-qg");
			const component = new Component();
			question.question.split("\\n").forEach(fragment => {
				MarkdownRenderer.render(this.app, fragment, questionText, "", component);
			});
			
			// User answer section
			const userAnswerSection = questionCard.createDiv("quiz-review-answer-section-qg");
			userAnswerSection.createEl("div", { 
				text: "Your answer:", 
				cls: "quiz-review-label-qg",
				attr: { style: "font-weight: bold; margin-bottom: 0.25em;" }
			});
			const userAnswerDiv = userAnswerSection.createDiv("quiz-review-user-answer-qg");
			this.renderAnswer(userAnswerDiv, question, userAnswer, false);
			
			// Correct answer section
			const correctAnswerSection = questionCard.createDiv("quiz-review-answer-section-qg");
			correctAnswerSection.createEl("div", { 
				text: "Correct answer:", 
				cls: "quiz-review-label-qg",
				attr: { style: "font-weight: bold; margin-bottom: 0.25em; margin-top: 0.5em;" }
			});
			const correctAnswerDiv = correctAnswerSection.createDiv("quiz-review-correct-answer-qg");
			this.renderAnswer(correctAnswerDiv, question, question.answer, true);
		});
		
		// Close button
		const buttonContainer = content.createDiv("quiz-review-buttons-qg");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "center";
		buttonContainer.style.marginTop = "1.5em";
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
			cls: "mod-cta"
		});
		closeButton.addEventListener("click", () => {
			this.close();
		});
	}

	private renderAnswer(container: HTMLElement, question: Question, answer: any, isCorrect: boolean): void {
		const component = new Component();
		
		if (isTrueFalse(question)) {
			container.textContent = answer === true ? "True" : "False";
		} else if (isMultipleChoice(question)) {
			if (typeof answer === "number" && answer >= 0 && answer < question.options.length) {
				const optionContainer = container.createDiv();
				MarkdownRenderer.render(this.app, question.options[answer], optionContainer, "", component);
			} else {
				container.textContent = "No answer";
			}
		} else if (isSelectAllThatApply(question)) {
			if (Array.isArray(answer) && answer.length > 0) {
				const selectedOptions = answer.map((idx: number) => {
					if (idx >= 0 && idx < question.options.length) {
						return question.options[idx];
					}
					return null;
				}).filter(Boolean);
				
				if (selectedOptions.length > 0) {
					selectedOptions.forEach((option: string | null, i: number) => {
						if (option) {
							const optionDiv = container.createDiv();
							MarkdownRenderer.render(this.app, option, optionDiv, "", component);
							if (i < selectedOptions.length - 1) {
								container.createEl("br");
							}
						}
					});
				} else {
					container.textContent = "No answer";
				}
			} else {
				container.textContent = "No answer";
			}
		} else if (isFillInTheBlank(question)) {
			if (Array.isArray(answer)) {
				container.textContent = answer.join(", ");
			} else {
				container.textContent = "No answer";
			}
		} else if (isMatching(question)) {
			if (Array.isArray(answer) && answer.length > 0) {
				answer.forEach((pair: { leftOption: string; rightOption: string }, i: number) => {
					const pairDiv = container.createDiv();
					pairDiv.textContent = `${pair.leftOption} → ${pair.rightOption}`;
					if (i < answer.length - 1) {
						container.createEl("br");
					}
				});
			} else {
				container.textContent = "No answer";
			}
		} else if (isShortOrLongAnswer(question)) {
			if (typeof answer === "string") {
				const answerDiv = container.createDiv();
				MarkdownRenderer.render(this.app, answer, answerDiv, "", component);
			} else {
				container.textContent = "No answer";
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
		super.onClose();
	}
}

