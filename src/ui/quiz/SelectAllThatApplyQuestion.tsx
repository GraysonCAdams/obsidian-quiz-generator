import { App, Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { SelectAllThatApply } from "../../utils/types";
import { useQuestionMarkdown } from "../hooks/useQuestionMarkdown";

interface SelectAllThatApplyQuestionProps {
	app: App;
	question: SelectAllThatApply;
	onAnswer?: (correct: boolean, userAnswer?: any) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
	hideResults?: boolean;
	savedUserAnswer?: any;
}

const SelectAllThatApplyQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false, hideResults = false, savedUserAnswer }: SelectAllThatApplyQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<number[]>(Array.isArray(savedUserAnswer) ? savedUserAnswer : []);
	const [submitted, setSubmitted] = useState<boolean>(false);
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	
	// Update userAnswer when savedUserAnswer changes (e.g., when navigating back to question)
	useEffect(() => {
		if (Array.isArray(savedUserAnswer)) {
			setUserAnswer(savedUserAnswer);
		}
	}, [savedUserAnswer]);
	
	// If already answered, set submitted state
	useEffect(() => {
		if (answered) {
			setSubmitted(true);
		}
	}, [answered]);
	const questionRef = useQuestionMarkdown({
		app,
		question: question.question,
		showRepeat,
		onRepeat,
	});
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const containerRef = useRef<HTMLDivElement>(null);
	const submitButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const component = new Component();
		
		buttonRefs.current = buttonRefs.current.slice(0, question.options.length);
		buttonRefs.current.forEach((button, index) => {
			if (button) {
				button.empty();
				MarkdownRenderer.render(app, question.options[index], button, "", component);
			}
		});
		return () => {
			component.unload();
		};
	}, [app, question]);

	const toggleSelection = (buttonAnswer: number) => {
		if (!canEdit) return;
		
		// If editing in review-at-end mode, reset submitted status
		if (hideResults && submitted) {
			setSubmitted(false);
		}
		
		if (onChoose && !submitted) {
			onChoose(); // Play choose sound when selecting/deselecting options
		}
		setUserAnswer(prevUserAnswer => {
			if (prevUserAnswer.includes(buttonAnswer)) {
				return prevUserAnswer.filter(answer => answer !== buttonAnswer);
			} else {
				return [...prevUserAnswer, buttonAnswer];
			}
		});
	};

	const getButtonClass = (buttonAnswer: number) => {
		let baseClass = "select-all-that-apply-button-qg";
		
		// Add focused class if this button is focused
		if (focusedIndex === buttonAnswer && !submitted) {
			baseClass += " focused-choice-qg";
		}
		
		// Don't show correct/incorrect styling if results are hidden
		if (hideResults && submitted) {
			if (userAnswer.includes(buttonAnswer)) return `${baseClass} selected-choice-qg`;
			return baseClass;
		}
		
		if (submitted) {
			const correct = question.answer.includes(buttonAnswer);
			const selected = userAnswer.includes(buttonAnswer);
			if (correct && selected) return `${baseClass} correct-choice-qg`;
			if (correct) return `${baseClass} correct-choice-qg not-selected-qg`;
			if (selected) return `${baseClass} incorrect-choice-qg`;
		} else if (userAnswer.includes(buttonAnswer)) {
			return `${baseClass} selected-choice-qg`;
		}
		return baseClass;
	};

	const handleSubmit = () => {
		setSubmitted(true);
		setFocusedIndex(null); // Clear focus after submission
		// Check if arrays match (same elements, order doesn't matter)
		const correct = userAnswer.length === question.answer.length &&
			userAnswer.every(answer => question.answer.includes(answer));
		onAnswer?.(correct, [...userAnswer]);
	};
	
	// Allow editing in review-at-end mode
	const canEdit = hideResults || !submitted;
	
	// Auto-submit when answer changes in review-at-end mode (but allow editing after)
	useEffect(() => {
		if (hideResults && !submitted && userAnswer.length > 0) {
			// Auto-submit after a short delay to allow multiple selections
			const timeout = setTimeout(() => {
				if (!submitted && userAnswer.length > 0) {
					// Don't calculate correctness, just store the answer
					onAnswer?.(false, [...userAnswer]); // Pass false, will be calculated later
					setSubmitted(true);
					setFocusedIndex(null);
				}
			}, 500);
			return () => clearTimeout(timeout);
		}
	}, [hideResults, userAnswer.length, submitted, onAnswer]);

	// Keyboard navigation handler
	useEffect(() => {
		if (!canEdit) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			// Don't handle if in an input field
			const target = event.target as HTMLElement;
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				return;
			}

			// Check if we're in a modal (avoid interfering with other modals like credit check)
			const activeModal = document.querySelector('.modal.is-open');
			if (activeModal && !activeModal.querySelector('.modal-qg')) {
				return; // Don't handle if another modal is open
			}

			// Number keys should work globally when the question is visible
			if (/^[1-9]$/.test(event.key) || /^Numpad[1-9]$/.test(event.key)) {
				// Handle number keys (1-9) and numpad keys
				event.preventDefault();
				const numKey = event.key.startsWith('Numpad') 
					? parseInt(event.key.replace('Numpad', ''), 10)
					: parseInt(event.key, 10);
				const answerIndex = numKey - 1; // Convert 1-9 to 0-8
				if (answerIndex >= 0 && answerIndex < question.options.length) {
					setFocusedIndex(answerIndex);
					toggleSelection(answerIndex);
				}
				return;
			}

			// Tab and Space only work if container is focused
			if (!containerRef.current?.contains(document.activeElement) && 
				document.activeElement !== containerRef.current) {
				return;
			}

			if (event.key === 'Tab') {
				event.preventDefault();
				const currentFocus = focusedIndex === null ? -1 : focusedIndex;
				// If focused on submit button (index === question.options.length), wrap around
				if (currentFocus >= question.options.length) {
					setFocusedIndex(event.shiftKey ? question.options.length - 1 : 0);
					return;
				}
				const nextIndex = event.shiftKey 
					? (currentFocus <= 0 ? question.options.length : currentFocus - 1) // Can go to submit button
					: (currentFocus >= question.options.length - 1 ? question.options.length : currentFocus + 1); // Can go to submit button
				setFocusedIndex(nextIndex);
			} else if (event.key === ' ') {
				event.preventDefault();
				if (focusedIndex !== null) {
					if (focusedIndex === question.options.length) {
						// Submit button focused
						if (userAnswer.length > 0 && !submitted) {
							handleSubmit();
						}
					} else {
						// Option button focused
						toggleSelection(focusedIndex);
					}
				} else if (question.options.length > 0) {
					// If nothing focused, select first option
					setFocusedIndex(0);
					toggleSelection(0);
				}
			} else if (event.key === 'Enter' && focusedIndex === question.options.length && userAnswer.length > 0 && !submitted) {
				event.preventDefault();
				handleSubmit();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedIndex, submitted, userAnswer, question.options.length]);

	// Reset focus when question changes
	useEffect(() => {
		setFocusedIndex(null);
	}, [question]);

	return (
		<div className="question-container-qg" ref={containerRef} tabIndex={-1}>
			<div className="question-qg" ref={questionRef} />
			<div className="select-all-that-apply-container-qg">
				{question.options.map((_, index) => (
					<button
						key={index}
						ref={(el) => buttonRefs.current[index] = el}
						className={getButtonClass(index)}
						onClick={() => toggleSelection(index)}
						disabled={!canEdit}
						data-choice-number={index + 1}
					/>
				))}
			</div>
			{!hideResults && (
				<button
					ref={submitButtonRef}
					className={`submit-answer-qg ${focusedIndex === question.options.length && !submitted ? 'focused-choice-qg' : ''}`}
					onClick={handleSubmit}
					disabled={!userAnswer.length || submitted}
				>
					Submit
				</button>
			)}
		</div>
	);
};

export default SelectAllThatApplyQuestion;
