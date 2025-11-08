import { App, Component, MarkdownRenderer, Notice, setIcon } from "obsidian";
import { useEffect, useRef, useState, useCallback } from "react";
import { FillInTheBlank } from "../../utils/types";

interface FillInTheBlankQuestionProps {
	app: App;
	question: FillInTheBlank;
	onAnswer?: (correct: boolean, userAnswer?: any) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
	hideResults?: boolean;
	savedInputs?: string[];
	onDraftChange?: (values: string[]) => void;
}

const FillInTheBlankQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false, hideResults = false, savedInputs, onDraftChange }: FillInTheBlankQuestionProps) => {
	const [submitted, setSubmitted] = useState<boolean>(false);
	const [revealedAnswers, setRevealedAnswers] = useState<boolean>(false);
	
	// If already answered, set submitted state (but allow editing in review mode)
	useEffect(() => {
		if (answered && !hideResults) {
			setSubmitted(true);
			setRevealedAnswers(true);
		} else if (answered && hideResults) {
			// In review mode, keep submitted as false to allow editing
			setSubmitted(false);
			setRevealedAnswers(false);
		}
	}, [answered, hideResults]);
	const questionContainerRef = useRef<HTMLDivElement>(null);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const inputValuesRef = useRef<string[]>(Array(question.answer.length).fill(""));
	const repeatButtonRef = useRef<HTMLAnchorElement | null>(null);
	const hasInitializedRef = useRef<boolean>(false);

	useEffect(() => {
		if (!questionContainerRef.current) return;

		// Track which input has focus before recreating
		const activeElement = document.activeElement;
		const focusedInputIndex = inputRefs.current.findIndex(input => input === activeElement);

		// Only recreate DOM if question changed or not yet initialized
		const shouldRecreate = !hasInitializedRef.current || 
			questionContainerRef.current.children.length === 0 ||
			!inputRefs.current.some(ref => ref !== null);

		if (shouldRecreate) {
			questionContainerRef.current.empty();
			inputRefs.current = [];
			hasInitializedRef.current = true;
		}

		const baseValues =
			submitted || answered
				? [...question.answer]
				: savedInputs && savedInputs.length === question.answer.length
					? [...savedInputs]
					: Array(question.answer.length).fill("");
		inputValuesRef.current = baseValues;

		const container = questionContainerRef.current;
		
		// If inputs already exist, sync values from inputs to ref (preserve what user is typing)
		// and only update from savedInputs if they differ significantly
		if (inputRefs.current.length > 0 && inputRefs.current.every(ref => ref !== null)) {
			// First, sync current input values to ref (preserve user's typing)
			inputRefs.current.forEach((input, index) => {
				if (input && index < inputValuesRef.current.length) {
					// Preserve what user is currently typing - don't overwrite from savedInputs
					inputValuesRef.current[index] = input.value;
				}
			});
			
			// Update disabled state
			inputRefs.current.forEach((input) => {
				if (input) {
					if (submitted) {
						input.disabled = true;
					} else {
						input.disabled = false;
					}
				}
			});
			
			// Restore focus if an input was focused
			if (focusedInputIndex >= 0 && focusedInputIndex < inputRefs.current.length && inputRefs.current[focusedInputIndex]) {
				inputRefs.current[focusedInputIndex]!.focus();
			}
			return;
		}

		let blankIndex = 0;

		// Normalize newlines so blanks stay inline with text
		const normalizedQuestion = question.question.replace(/\s*\n\s*/g, ' ');
		
		// Split by blanks and create elements
		const parts = normalizedQuestion.split(/(`_+`)/g);
		
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
					input.value = inputValuesRef.current[currentIndex] ?? "";
					let hasPlayedChoose = false;

					// Handle input changes
					input.addEventListener("input", (e) => {
						inputValuesRef.current[currentIndex] = (e.target as HTMLInputElement).value;
						onDraftChange?.([...inputValuesRef.current]);
						if (onChoose && !hasPlayedChoose && inputValuesRef.current[currentIndex].length === 1) {
							// Play choose sound on first character typed
							onChoose();
							hasPlayedChoose = true;
						}
					});
					
					// Handle focus for choose sound - removed to prevent issues
					// onChoose will be triggered by first character typed instead

					// Handle Enter key
					input.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							// In review mode, Enter should ALWAYS just navigate - don't submit
							if (hideResults) {
								const navEvent = new CustomEvent('quiz-navigate-next');
								window.dispatchEvent(navEvent);
								return;
							}
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
		
		// Insert repeat button inline with question text if enabled (find the first text span)
		if (showRepeat && onRepeat) {
			const textSpans = container.querySelectorAll('.fill-blank-text-qg');
			if (textSpans.length > 0) {
				// Use first text span instead of last to make it inline with the title
				const firstTextSpan = textSpans[0];
				const existingRepeat = container.querySelector('.quiz-repeat-question-link-qg');
				if (existingRepeat) {
					existingRepeat.remove();
				}
				
				const repeatLink = document.createElement('a');
				repeatLink.className = 'quiz-repeat-question-link-qg';
				repeatLink.href = '#';
				repeatLink.title = 'Repeat question';
				repeatLink.addEventListener('click', (e) => {
					e.preventDefault();
					if (onRepeat) onRepeat();
				});
				repeatButtonRef.current = repeatLink;
				setIcon(repeatLink, 'repeat');
				// Insert inline with the first text span
				firstTextSpan.appendChild(repeatLink);
			}
		}
	}, [app, question.question, question.answer, submitted, answered, savedInputs, showRepeat, onDraftChange, onChoose]);

	const handleSubmit = () => {
		// In review-at-end mode, Enter should ALWAYS navigate to next question (like pressing next page key)
		// Don't submit, don't clear input, don't call onAnswer - just navigate
		if (hideResults) {
			// Always navigate in review mode, regardless of input content
			// The draft is already saved via onChange callback, so we don't need to do anything else
			const event = new CustomEvent('quiz-navigate-next');
			window.dispatchEvent(event);
			return;
		}
		
		const currentValues = inputValuesRef.current;
		
		// Check if all inputs are empty
		const allEmpty = currentValues.every(val => !val.trim());
		
		if (allEmpty) {
			// Reveal all answers (normal mode)
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
			onAnswer?.(false, []);
			return;
		}

		const userAnswerValues = [...currentValues];

		// Check answers (only in normal mode)
		let allCorrect = true;
		
		currentValues.forEach((value, index) => {
			if (value.trim() && value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				allCorrect = false;
			}
			// Fill in correct answer if wrong
			if (!value.trim() || value.toLowerCase().trim() !== question.answer[index].toLowerCase()) {
				inputValuesRef.current[index] = question.answer[index];
				if (inputRefs.current[index]) {
					inputRefs.current[index]!.value = question.answer[index];
				}
			}
		});

		setSubmitted(true);
		onAnswer?.(allCorrect, userAnswerValues);
		onDraftChange?.([...inputValuesRef.current]);

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
