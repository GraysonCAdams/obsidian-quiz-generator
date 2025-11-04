import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Matching } from "../../utils/types";
import { shuffleArray } from "../../utils/helpers";

interface MatchingQuestionProps {
	app: App;
	question: Matching;
	onAnswer?: (correct: boolean) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
}

const MatchingQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false }: MatchingQuestionProps) => {
	const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
	const [selectedRight, setSelectedRight] = useState<number | null>(null);
	const [selectedPairs, setSelectedPairs] = useState<{ leftIndex: number, rightIndex: number }[]>([]);
	const [status, setStatus] = useState<"answering" | "submitted" | "reviewing">("answering");
	const [focusedSide, setFocusedSide] = useState<"left" | "right" | null>(null);
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	
	// If already answered, set status to submitted
	useEffect(() => {
		if (answered) {
			setStatus("submitted");
		}
	}, [answered]);

	const leftOptions = useMemo<{ value: string, index: number }[]>(() =>
			shuffleArray(question.answer.map((pair, index) => ({ value: pair.leftOption, index }))),
		[question]
	);
	const rightOptions = useMemo<{ value: string, index: number }[]>(() =>
			shuffleArray(question.answer.map((pair, index) => ({ value: pair.rightOption, index }))),
		[question]
	);
	const correctPairsMap = useMemo<Map<number, number>>(() => {
		const leftIndexMap = new Map<string, number>(leftOptions.map((option, index) => [option.value, index]));
		const rightIndexMap = new Map<string, number>(rightOptions.map((option, index) => [option.value, index]));

		return question.answer.reduce((acc, pair) => {
			const leftIndex = leftIndexMap.get(pair.leftOption)!;
			const rightIndex = rightIndexMap.get(pair.rightOption)!;
			acc.set(leftIndex, rightIndex);
			return acc;
		}, new Map<number, number>());
	}, [question, leftOptions, rightOptions]);

	const questionRef = useRef<HTMLDivElement>(null);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const repeatButtonRef = useRef<HTMLAnchorElement | null>(null);

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

		buttonRefs.current = buttonRefs.current.slice(0, question.answer.length * 2);
		question.answer.forEach((_, index) => {
			const leftButton = buttonRefs.current[index * 2];
			const rightButton = buttonRefs.current[index * 2 + 1];
			if (leftButton) {
				leftButton.empty();
				MarkdownRenderer.render(app, leftOptions[index].value, leftButton, "", component);
			}
			if (rightButton) {
				rightButton.empty();
				MarkdownRenderer.render(app, rightOptions[index].value, rightButton, "", component);
			}
		});
	}, [app, question, leftOptions, rightOptions, showRepeat, onRepeat]);

	const handleLeftClick = (leftIndex: number) => {
		if (onChoose) {
			onChoose(); // Play choose sound when clicking
		}
		if (selectedLeft === leftIndex) {
			setSelectedLeft(null);
		} else if (selectedRight !== null) {
			const pairToReplace = selectedPairs.find(pair => pair.leftIndex === leftIndex);
			if (pairToReplace) {
				setSelectedPairs(selectedPairs.map(pair =>
					pair.rightIndex === pairToReplace.rightIndex ? { leftIndex: leftIndex, rightIndex: selectedRight } : pair
				));
			} else {
				setSelectedPairs([...selectedPairs, { leftIndex: leftIndex, rightIndex: selectedRight }]);
			}
			setSelectedLeft(null);
			setSelectedRight(null);
		} else if (!selectedPairs.some(pair => pair.leftIndex === leftIndex)) {
			setSelectedLeft(leftIndex);
		}
	};

	const handleRightClick = (rightIndex: number) => {
		if (onChoose) {
			onChoose(); // Play choose sound when clicking
		}
		if (selectedRight === rightIndex) {
			setSelectedRight(null);
		} else if (selectedLeft !== null) {
			const pairToReplace = selectedPairs.find(pair => pair.rightIndex === rightIndex);
			if (pairToReplace) {
				setSelectedPairs(selectedPairs.map(pair =>
					pair.leftIndex === pairToReplace.leftIndex ? { leftIndex: selectedLeft, rightIndex: rightIndex } : pair
				));
			} else {
				setSelectedPairs([...selectedPairs, { leftIndex: selectedLeft, rightIndex: rightIndex }]);
			}
			setSelectedLeft(null);
			setSelectedRight(null);
		} else if (!selectedPairs.some(pair => pair.rightIndex === rightIndex)) {
			setSelectedRight(rightIndex);
		}
	};

	const handleLeftDoubleClick = (leftIndex: number) => {
		setSelectedPairs(selectedPairs.filter(pair => pair.leftIndex !== leftIndex));
	};

	const handleRightDoubleClick = (rightIndex: number) => {
		setSelectedPairs(selectedPairs.filter(pair => pair.rightIndex !== rightIndex));
	};

	const getLeftButtonClass = (leftIndex: number): string => {
		let baseClass = "matching-button-qg";
		
		// Add focused class if this button is focused
		if (focusedSide === "left" && focusedIndex === leftIndex && status === "answering") {
			baseClass += " focused-choice-qg";
		}
		
		if (status === "answering" &&
			(selectedLeft === leftIndex || selectedPairs.some(pair => pair.leftIndex === leftIndex))) {
			return `${baseClass} selected-choice-qg`;
		}

		if (status === "submitted") {
			const rightIndex = correctPairsMap.get(leftIndex);
			const correct = selectedPairs.some(pair => pair.leftIndex === leftIndex && pair.rightIndex === rightIndex);
			return correct ? `${baseClass} correct-choice-qg` : `${baseClass} incorrect-choice-qg`;
		}

		if (status === "reviewing") {
			const rightIndex = correctPairsMap.get(leftIndex);
			const correct = selectedPairs.some(pair => pair.leftIndex === leftIndex && pair.rightIndex === rightIndex);
			return `${baseClass} correct-choice-qg` + (correct ? "" : " not-selected-qg");
		}

		return baseClass;
	};

	const getRightButtonClass = (rightIndex: number): string => {
		let baseClass = "matching-button-qg";
		
		// Add focused class if this button is focused
		if (focusedSide === "right" && focusedIndex === rightIndex && status === "answering") {
			baseClass += " focused-choice-qg";
		}
		
		if (status === "answering" &&
			(selectedRight === rightIndex || selectedPairs.some(pair => pair.rightIndex === rightIndex))) {
			return `${baseClass} selected-choice-qg`;
		}

		if (status === "submitted") {
			const leftIndex = selectedPairs.find(pair => pair.rightIndex === rightIndex)?.leftIndex;
			if (leftIndex !== undefined) {
				const correctRightIndex = correctPairsMap.get(leftIndex);
				return correctRightIndex === rightIndex
					? `${baseClass} correct-choice-qg`
					: `${baseClass} incorrect-choice-qg`;
			}
		}

		if (status === "reviewing") {
			const leftIndex = selectedPairs.find(pair => pair.rightIndex === rightIndex)?.leftIndex;
			if (leftIndex !== undefined) {
				const correctRightIndex = correctPairsMap.get(leftIndex);
				return `${baseClass} correct-choice-qg` + (correctRightIndex === rightIndex ? "" : " not-selected-qg");
			}
		}

		return baseClass;
	};

	// Keyboard navigation handler
	useEffect(() => {
		if (status !== "answering") return;

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

			const totalOptions = question.answer.length * 2; // Left + Right options

			// Number keys should work globally when the question is visible
			if (/^[1-9]$/.test(event.key) || /^Numpad[1-9]$/.test(event.key)) {
				// Handle number keys (1-9) and numpad keys for matching
				event.preventDefault();
				const numKey = event.key.startsWith('Numpad') 
					? parseInt(event.key.replace('Numpad', ''), 10)
					: parseInt(event.key, 10);
				// Number keys map to left options first (1-N), then right options (N+1 to 2N)
				if (numKey <= question.answer.length) {
					// Left side option
					const leftIndex = numKey - 1;
					if (leftIndex >= 0 && leftIndex < question.answer.length) {
						setFocusedSide("left");
						setFocusedIndex(leftIndex);
						handleLeftClick(leftIndex);
					}
				} else {
					// Right side option
					const rightIndex = numKey - question.answer.length - 1;
					if (rightIndex >= 0 && rightIndex < question.answer.length) {
						setFocusedSide("right");
						setFocusedIndex(rightIndex);
						handleRightClick(rightIndex);
					}
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
				// Calculate current position: left options are 0 to length-1, right options are length to 2*length-1
				let currentPos = -1;
				if (focusedSide === "left" && focusedIndex !== null) {
					currentPos = focusedIndex;
				} else if (focusedSide === "right" && focusedIndex !== null) {
					currentPos = question.answer.length + focusedIndex;
				}
				
				const nextPos = event.shiftKey 
					? (currentPos <= 0 ? totalOptions - 1 : currentPos - 1)
					: (currentPos >= totalOptions - 1 ? 0 : currentPos + 1);
				
				if (nextPos < question.answer.length) {
					setFocusedSide("left");
					setFocusedIndex(nextPos);
				} else {
					setFocusedSide("right");
					setFocusedIndex(nextPos - question.answer.length);
			}
			} else if (event.key === ' ') {
				event.preventDefault();
				if (focusedSide !== null && focusedIndex !== null) {
					if (focusedSide === "left") {
						handleLeftClick(focusedIndex);
					} else {
						handleRightClick(focusedIndex);
					}
				} else if (question.answer.length > 0) {
					// If nothing focused, start with first left option
					setFocusedSide("left");
					setFocusedIndex(0);
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedSide, focusedIndex, status, question.answer.length]);

	// Reset focus when question changes
	useEffect(() => {
		setFocusedSide(null);
		setFocusedIndex(null);
	}, [question]);

	return (
		<div className="question-container-qg" ref={containerRef} tabIndex={-1}>
			<div className="question-qg" ref={questionRef} />
			<div className="matching-container-qg">
				{question.answer.map((_, index) => (
					<Fragment key={index}>
						<div className="matching-button-container-qg">
							<svg className="svg-left-qg" viewBox="0 0 40 40">
								<circle className="svg-circle-qg" cx="20" cy="20" r="18" />
								<text className="svg-circle-text-qg" x="20" y="26">
									{(() => {
										const pairIndex = status === "reviewing"
											? Array.from(correctPairsMap.keys()).findIndex(leftIndex => leftIndex === index)
											: selectedPairs.findIndex(pair => pair.leftIndex === index);
										return pairIndex === -1 ? "" : pairIndex + 1;
									})()}
								</text>
							</svg>
							<button
								ref={el => buttonRefs.current[index * 2] = el}
								className={getLeftButtonClass(index)}
								onClick={() => handleLeftClick(index)}
								onDoubleClick={() => handleLeftDoubleClick(index)}
								disabled={status !== "answering"}
								data-choice-number={index + 1}
							/>
						</div>
						<div className="matching-button-container-qg">
							<svg className="svg-right-qg" viewBox="0 0 40 40">
								<circle className="svg-circle-qg" cx="20" cy="20" r="18" />
								<text className="svg-circle-text-qg" x="20" y="26">
									{(() => {
										const pairIndex = status === "reviewing"
											? Array.from(correctPairsMap.values()).findIndex(rightIndex => rightIndex === index)
											: selectedPairs.findIndex(pair => pair.rightIndex === index);
										return pairIndex === -1 ? "" : pairIndex + 1;
									})()}
								</text>
							</svg>
							<button
								ref={(el) => buttonRefs.current[index * 2 + 1] = el}
								className={getRightButtonClass(index)}
								onClick={() => handleRightClick(index)}
								onDoubleClick={() => handleRightDoubleClick(index)}
								disabled={status !== "answering"}
								data-choice-number={index + question.answer.length + 1}
							/>
						</div>
					</Fragment>
				))}
			</div>
			<button
				className="submit-answer-qg"
				onClick={() => {
					if (status === "answering") {
						// Check if all pairs are correct
						const allCorrect = selectedPairs.every(pair => 
							correctPairsMap.get(pair.leftIndex) === pair.rightIndex
						);
						onAnswer?.(allCorrect);
						setStatus("submitted");
						setFocusedSide(null);
						setFocusedIndex(null);
					} else {
						setStatus("reviewing");
					}
				}}
				disabled={
					status !== "answering" ||
					selectedPairs.length !== question.answer.length
				}
			>
				{status === "answering" ? "Submit" : "Reveal answer"}
			</button>
		</div>
	);
};

export default MatchingQuestion;
