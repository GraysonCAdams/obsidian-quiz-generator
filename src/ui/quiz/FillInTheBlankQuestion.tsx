import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { FillInTheBlank } from "../../utils/types";

interface FillInTheBlankQuestionProps {
	app: App;
	question: FillInTheBlank;
}

const FillInTheBlankQuestion = ({ app, question }: FillInTheBlankQuestionProps) => {
	const [submitted, setSubmitted] = useState<boolean>(false);
	const [revealedAnswers, setRevealedAnswers] = useState<boolean>(false);
	const questionContainerRef = useRef<HTMLDivElement>(null);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const inputValuesRef = useRef<string[]>(Array(question.answer.length).fill(""));

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
					input.value = inputValuesRef.current[currentIndex];

					// Handle input changes
					input.addEventListener("input", (e) => {
						inputValuesRef.current[currentIndex] = (e.target as HTMLInputElement).value;
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
	}, [app, question, submitted]);

	const handleSubmit = () => {
		const currentValues = inputValuesRef.current;
		
		// Check if all inputs are empty
		const allEmpty = currentValues.every(val => !val.trim());
		
		if (allEmpty) {
			// Reveal all answers
			inputValuesRef.current = [...question.answer];
			// Update all input fields
			inputRefs.current.forEach((input, index) => {
				if (input) {
					input.value = question.answer[index];
				}
			});
			setRevealedAnswers(true);
			setSubmitted(true);
			new Notice("Answers revealed");
			return;
		}

		// Check answers
		let allCorrect = true;
		
		currentValues.forEach((value, index) => {
			if (value.trim() && value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				allCorrect = false;
			}
			// Fill in correct answer if empty or incorrect
			if (!value.trim() || value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				inputValuesRef.current[index] = question.answer[index];
				if (inputRefs.current[index]) {
					inputRefs.current[index]!.value = question.answer[index];
				}
			}
		});

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
