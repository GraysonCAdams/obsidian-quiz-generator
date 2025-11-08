import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { TrueFalse } from "../../utils/types";

interface TrueFalseQuestionProps {
	app: App;
	question: TrueFalse;
	onAnswer?: (correct: boolean, userAnswer?: any) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
	hideResults?: boolean;
	savedUserAnswer?: any;
}

const TrueFalseQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false, hideResults = false, savedUserAnswer }: TrueFalseQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<boolean | null>(savedUserAnswer !== undefined ? savedUserAnswer : null);
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null); // 0 = true, 1 = false
	
	// Update userAnswer when savedUserAnswer changes (e.g., when navigating back to question)
	useEffect(() => {
		if (savedUserAnswer !== undefined) {
			setUserAnswer(savedUserAnswer);
		}
	}, [savedUserAnswer]);
	const questionRef = useRef<HTMLDivElement>(null);
	const repeatButtonRef = useRef<HTMLAnchorElement | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const trueButtonRef = useRef<HTMLButtonElement>(null);
	const falseButtonRef = useRef<HTMLButtonElement>(null);

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
			// Remove existing repeat button if any
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
	}, [app, question, showRepeat, onRepeat]);

	const getButtonClass = (buttonAnswer: boolean) => {
		let baseClass = "true-false-button-qg";
		const buttonIndex = buttonAnswer ? 0 : 1;
		
		// Add focused class if this button is focused
		const canEdit = hideResults || !answered;
		if (focusedIndex === buttonIndex && userAnswer === null && canEdit) {
			baseClass += " focused-choice-qg";
		}
		
		// Don't show correct/incorrect styling if results are hidden
		if (hideResults) {
			if (userAnswer === null) return baseClass;
			if (buttonAnswer === userAnswer) return `${baseClass} selected-choice-qg`;
			return baseClass;
		}
		
		if (userAnswer === null) return baseClass;
		const correct = buttonAnswer === question.answer;
		const selected = buttonAnswer === userAnswer;
		if (correct && selected) return `${baseClass} correct-choice-qg`;
		if (correct) return `${baseClass} correct-choice-qg not-selected-qg`;
		if (selected) return `${baseClass} incorrect-choice-qg`;
		return baseClass;
	};

	const handleAnswer = (answer: boolean) => {
		if (userAnswer === null && onChoose) {
			onChoose(); // Play choose sound on first selection
		}
		setUserAnswer(answer);
		setFocusedIndex(null); // Clear focus after selection
		onAnswer?.(answer === question.answer, answer);
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

			// Number keys and letter keys should work globally when the question is visible
			if (event.key === '1' || event.key === 'Numpad1' || event.key.toLowerCase() === 't') {
				// 1 or T = True
				event.preventDefault();
				setFocusedIndex(0);
				handleAnswer(true);
				return;
			} else if (event.key === '2' || event.key === 'Numpad2' || event.key.toLowerCase() === 'f') {
				// 2 or F = False
				event.preventDefault();
				setFocusedIndex(1);
				handleAnswer(false);
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
					? (currentFocus <= 0 ? 1 : currentFocus - 1)
					: (currentFocus >= 1 ? 0 : currentFocus + 1);
				setFocusedIndex(nextIndex);
			} else if (event.key === ' ') {
				event.preventDefault();
				if (focusedIndex !== null) {
					handleAnswer(focusedIndex === 0);
				} else {
					// If nothing focused, select first option (True)
					setFocusedIndex(0);
					handleAnswer(true);
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedIndex, answered, userAnswer]);

	// Reset focus when question changes
	useEffect(() => {
		setFocusedIndex(null);
	}, [question]);

	return (
		<div className="question-container-qg" ref={containerRef} tabIndex={-1}>
			<div className="question-qg" ref={questionRef} />
			<div className="true-false-container-qg">
				<button
					ref={trueButtonRef}
					className={getButtonClass(true)}
					onClick={() => handleAnswer(true)}
					disabled={!canEdit}
					data-choice-number="1"
				>
					True
				</button>
				<button
					ref={falseButtonRef}
					className={getButtonClass(false)}
					onClick={() => handleAnswer(false)}
					disabled={!canEdit}
					data-choice-number="2"
				>
					False
				</button>
			</div>
		</div>
	);
};

export default TrueFalseQuestion;
