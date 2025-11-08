import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { MultipleChoice } from "../../utils/types";

interface MultipleChoiceQuestionProps {
	app: App;
	question: MultipleChoice;
	onAnswer?: (correct: boolean, userAnswer?: any) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
	hideResults?: boolean;
	savedUserAnswer?: any;
}

const MultipleChoiceQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false, hideResults = false, savedUserAnswer }: MultipleChoiceQuestionProps) => {
	// Support both single answer (legacy) and multiple selections (up to 4)
	const normalizeSavedAnswer = (answer: any): number[] => {
		if (answer === null || answer === undefined) return [];
		if (Array.isArray(answer)) return answer;
		return [answer];
	};
	
	const [userAnswer, setUserAnswer] = useState<number[]>(normalizeSavedAnswer(savedUserAnswer));
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const MAX_SELECTIONS = 4;
	
	// Update userAnswer when savedUserAnswer changes (e.g., when navigating back to question)
	useEffect(() => {
		if (savedUserAnswer !== undefined) {
			setUserAnswer(normalizeSavedAnswer(savedUserAnswer));
		}
	}, [savedUserAnswer]);
	const questionRef = useRef<HTMLDivElement>(null);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const repeatButtonRef = useRef<HTMLAnchorElement | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const component = new Component();
		
		// Clear previous content
		if (questionRef.current) {
			questionRef.current.empty();
		}

		question.question.split("\\n").forEach(questionFragment => {
			if (questionRef.current) {
				MarkdownRenderer.render(app, questionFragment, questionRef.current, "", component);
			}
		});
		
		// Insert repeat button inline with question text if enabled
		if (questionRef.current && showRepeat && onRepeat) {
			const existingRepeat = questionRef.current.querySelector('.quiz-repeat-question-link-qg');
			if (existingRepeat) {
				existingRepeat.remove();
			}
			
			const repeatLink = document.createElement('a');
			repeatLink.className = 'quiz-repeat-question-link-qg';
			repeatLink.href = '#';
			repeatLink.title = 'Repeat question';
			repeatLink.addEventListener('click', (e) => {
				e.preventDefault();
				onRepeat();
			});
			repeatButtonRef.current = repeatLink;
			setIcon(repeatLink, 'repeat');
			
			// Find the first paragraph or text element and insert inline
			const firstParagraph = questionRef.current.querySelector('p');
			if (firstParagraph) {
				// Insert after the paragraph's content, but still within the paragraph
				firstParagraph.appendChild(repeatLink);
			} else {
				// Fallback: find first text node or element and append inline
				const firstElement = questionRef.current.firstElementChild || questionRef.current.firstChild;
				if (firstElement && firstElement instanceof HTMLElement) {
					firstElement.appendChild(repeatLink);
				} else {
					// Last resort: append to container
					questionRef.current.appendChild(repeatLink);
				}
			}
		}

		buttonRefs.current = buttonRefs.current.slice(0, question.options.length);
		buttonRefs.current.forEach((button, index) => {
			if (button) {
				button.empty();
				MarkdownRenderer.render(app, question.options[index], button, "", component);
			}
		});
	}, [app, question, showRepeat, onRepeat]);

	const getButtonClass = (buttonAnswer: number) => {
		let baseClass = "multiple-choice-button-qg";
		
		// Add focused class if this button is focused
		const canEdit = hideResults || !answered;
		if (focusedIndex === buttonAnswer && userAnswer.length === 0 && canEdit) {
			baseClass += " focused-choice-qg";
		}
		
		// Don't show correct/incorrect styling if results are hidden
		if (hideResults) {
			if (userAnswer.length === 0) return baseClass;
			if (userAnswer.includes(buttonAnswer)) return `${baseClass} selected-choice-qg`;
			return baseClass;
		}
		
		if (userAnswer.length === 0) return baseClass;
		const correct = buttonAnswer === question.answer;
		const selected = userAnswer.includes(buttonAnswer);
		if (correct && selected) return `${baseClass} correct-choice-qg`;
		if (correct) return `${baseClass} correct-choice-qg not-selected-qg`;
		if (selected) return `${baseClass} incorrect-choice-qg`;
		return baseClass;
	};

	const handleAnswer = (answer: number) => {
		if (userAnswer.length === 0 && onChoose) {
			onChoose(); // Play choose sound on first selection
		}
		
		// Toggle selection - allow up to 4 selections
		let newAnswer: number[];
		if (userAnswer.includes(answer)) {
			// Deselect if already selected
			newAnswer = userAnswer.filter(a => a !== answer);
		} else {
			// Add selection if under limit
			if (userAnswer.length < MAX_SELECTIONS) {
				newAnswer = [...userAnswer, answer];
			} else {
				// At limit, replace oldest selection
				newAnswer = [...userAnswer.slice(1), answer];
			}
		}
		
		setUserAnswer(newAnswer);
		setFocusedIndex(null); // Clear focus after selection
		
		// Mark as correct if the correct answer is among the selections
		const isCorrect = newAnswer.includes(question.answer);
		onAnswer?.(isCorrect, newAnswer);
	};
	
	// Allow editing in review-at-end mode
	const canEdit = hideResults || !answered;

	// Keyboard navigation handler
	useEffect(() => {
		const canEdit = hideResults || !answered;
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
					handleAnswer(answerIndex);
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
				const nextIndex = event.shiftKey 
					? (currentFocus <= 0 ? question.options.length - 1 : currentFocus - 1)
					: (currentFocus >= question.options.length - 1 ? 0 : currentFocus + 1);
				setFocusedIndex(nextIndex);
			} else if (event.key === ' ') {
				event.preventDefault();
				if (focusedIndex !== null) {
					handleAnswer(focusedIndex);
				} else if (question.options.length > 0) {
					// If nothing focused, select first option
					setFocusedIndex(0);
					handleAnswer(0);
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedIndex, answered, userAnswer, question.options.length]);

	// Reset focus when question changes
	useEffect(() => {
		setFocusedIndex(null);
	}, [question]);

	return (
		<div className="question-container-qg" ref={containerRef} tabIndex={-1}>
			<div className="question-qg" ref={questionRef} />
			<div className="multiple-choice-container-qg">
				{question.options.map((_, index) => (
					<button
						key={index}
						ref={(el) => buttonRefs.current[index] = el}
						className={getButtonClass(index)}
						onClick={() => handleAnswer(index)}
						disabled={!canEdit}
						data-choice-number={index + 1}
					/>
				))}
			</div>
		</div>
	);
};

export default MultipleChoiceQuestion;
