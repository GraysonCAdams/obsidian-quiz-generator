import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { FillInTheBlank } from "../../utils/types";

interface FillInTheBlankQuestionProps {
	app: App;
	question: FillInTheBlank;
}

const FillInTheBlankQuestion = ({ app, question }: FillInTheBlankQuestionProps) => {
	const [inputValues, setInputValues] = useState<string[]>(Array(question.answer.length).fill(""));
	const [submitted, setSubmitted] = useState<boolean>(false);
	const [revealedAnswers, setRevealedAnswers] = useState<boolean>(false);
	const questionContainerRef = useRef<HTMLDivElement>(null);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	useEffect(() => {
		if (!questionContainerRef.current) return;

		questionContainerRef.current.empty();
		inputRefs.current = [];

		const container = questionContainerRef.current;
		let blankIndex = 0;

		// Split by blanks and create elements
		const parts = question.question.split(/(`_+`)/g);
		
		parts.forEach((part) => {
			if (part.match(/`_+`/)) {
				// This is a blank - create an input field
				if (blankIndex < question.answer.length) {
					const input = container.createEl("input", {
						cls: "fill-blank-input-qg",
						type: "text",
						attr: {
							placeholder: "____",
						}
					});

					if (submitted) {
						input.disabled = true;
					}

					const currentIndex = blankIndex;
					input.value = inputValues[currentIndex];

					// Handle input changes
					input.addEventListener("input", (e) => {
						const newValues = [...inputValues];
						newValues[currentIndex] = (e.target as HTMLInputElement).value;
						setInputValues(newValues);
					});

					// Handle Enter key
					input.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							handleSubmit();
						}
					});

					inputRefs.current[currentIndex] = input;
					blankIndex++;
				}
			} else if (part) {
				// Regular text - render as markdown
				const textSpan = container.createEl("span", { cls: "fill-blank-text-qg" });
				const component = new Component();
				MarkdownRenderer.render(app, part, textSpan, "", component);
			}
		});
	}, [app, question, inputValues, submitted]);

	const handleSubmit = () => {
		// Check if all inputs are empty
		const allEmpty = inputValues.every(val => !val.trim());
		
		if (allEmpty) {
			// Reveal all answers
			setInputValues(question.answer);
			setRevealedAnswers(true);
			setSubmitted(true);
			new Notice("Answers revealed");
			return;
		}

		// Check answers
		let allCorrect = true;
		const newValues = [...inputValues];
		
		inputValues.forEach((value, index) => {
			if (value.trim() && value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				allCorrect = false;
			}
			// Fill in correct answer if empty or incorrect
			if (!value.trim() || value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				newValues[index] = question.answer[index];
			}
		});

		setInputValues(newValues);
		setSubmitted(true);

		if (allCorrect) {
			new Notice("Correct!");
		} else {
			new Notice("Incorrect - correct answers shown");
		}
	};

	return (
		<div className="question-container-qg">
			<div className="fill-blank-question-qg" ref={questionContainerRef} />
			{submitted && revealedAnswers && (
				<div className="fill-blank-revealed-notice-qg">
					Answers were revealed (marked incorrect)
				</div>
			)}
			<div className="instruction-footnote-qg">
				Fill in the blanks and press enter in any field to submit. Press enter without typing to reveal all answers.
			</div>
		</div>
	);
};

export default FillInTheBlankQuestion;
