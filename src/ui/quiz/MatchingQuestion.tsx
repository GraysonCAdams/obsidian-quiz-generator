import { App, Component, MarkdownRenderer } from "obsidian";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Matching } from "../../utils/types";
import { shuffleArray } from "../../utils/helpers";
import { useQuestionMarkdown } from "../hooks/useQuestionMarkdown";

interface MatchingQuestionProps {
	app: App;
	question: Matching;
	onAnswer?: (correct: boolean, userAnswer?: any) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
	hideResults?: boolean;
	savedUserAnswer?: any;
	onDraftChange?: (pairs: { leftOption: string, rightOption: string }[]) => void;
	savedDraftPairs?: { leftOption: string, rightOption: string }[];
}

interface Point {
	x: number;
	y: number;
}

const MatchingQuestion = ({ app, question, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false, hideResults = false, savedUserAnswer, onDraftChange, savedDraftPairs }: MatchingQuestionProps) => {
	const [selectedPairs, setSelectedPairs] = useState<{ leftIndex: number, rightIndex: number }[]>([]);
	const [status, setStatus] = useState<"answering" | "submitted" | "reviewing">("answering");
	const [focusedSide, setFocusedSide] = useState<"left" | "right" | null>(null);
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const [pendingSelection, setPendingSelection] = useState<{ side: "left" | "right", index: number } | null>(null);
	
	// Drag state
	const [dragging, setDragging] = useState<{ side: "left" | "right", index: number } | null>(null);
	const [dragPosition, setDragPosition] = useState<Point | null>(null);
	
	const containerRef = useRef<HTMLDivElement>(null);
	const matchingContainerRef = useRef<HTMLDivElement>(null);
	const svgOverlayRef = useRef<SVGSVGElement>(null);
	const leftButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const rightButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const autoSubmittedRef = useRef<boolean>(false);
	
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
	
	// Update selectedPairs when savedUserAnswer or savedDraftPairs changes (e.g., when navigating back to question)
	useEffect(() => {
		const leftIndexMap = new Map<string, number>(leftOptions.map((option, index) => [option.value, index]));
		const rightIndexMap = new Map<string, number>(rightOptions.map((option, index) => [option.value, index]));
		
		// Priority: savedUserAnswer (complete answer) > savedDraftPairs (incomplete draft) > empty
		const pairsToRestore = savedUserAnswer && Array.isArray(savedUserAnswer) 
			? savedUserAnswer 
			: (savedDraftPairs && Array.isArray(savedDraftPairs) ? savedDraftPairs : null);
		
		if (pairsToRestore) {
			const restoredPairs = pairsToRestore
				.map((pair: { leftOption: string, rightOption: string }) => {
					const leftIndex = leftIndexMap.get(pair.leftOption);
					const rightIndex = rightIndexMap.get(pair.rightOption);
					if (leftIndex !== undefined && rightIndex !== undefined) {
						return { leftIndex, rightIndex };
					}
					return null;
				})
				.filter((pair): pair is { leftIndex: number, rightIndex: number } => pair !== null);
			
			setSelectedPairs(restoredPairs);
		} else {
			// Reset if no saved answer or draft
			setSelectedPairs([]);
		}
	}, [savedUserAnswer, savedDraftPairs, leftOptions, rightOptions]);
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

	const questionRef = useQuestionMarkdown({
		app,
		question: question.question,
		showRepeat,
		onRepeat,
	});

	useEffect(() => {
		const component = new Component();

		leftButtonRefs.current.forEach((button, index) => {
			if (button && index < leftOptions.length) {
				button.empty();
				MarkdownRenderer.render(app, leftOptions[index].value, button, "", component);
			}
		});
		rightButtonRefs.current.forEach((button, index) => {
			if (button && index < rightOptions.length) {
				button.empty();
				MarkdownRenderer.render(app, rightOptions[index].value, button, "", component);
			}
		});

		return () => {
			component.unload();
		};
	}, [app, leftOptions, rightOptions]);

	// Get button edge position (for line connections)
	const getButtonEdge = (side: "left" | "right", index: number): Point | null => {
		const button = side === "left" 
			? leftButtonRefs.current[index]
			: rightButtonRefs.current[index];
		if (!button || !matchingContainerRef.current) return null;
		
		const containerRect = matchingContainerRef.current.getBoundingClientRect();
		const buttonRect = button.getBoundingClientRect();
		// For left buttons, use right edge; for right buttons, use left edge
		const x = side === "left" 
			? buttonRect.right - containerRect.left
			: buttonRect.left - containerRect.left;
		const y = buttonRect.top + buttonRect.height / 2 - containerRect.top;
		return { x, y };
	};
	
	// Get button center position (for drag start)
	const getButtonCenter = (side: "left" | "right", index: number): Point | null => {
		const button = side === "left" 
			? leftButtonRefs.current[index]
			: rightButtonRefs.current[index];
		if (!button || !matchingContainerRef.current) return null;
		
		const containerRect = matchingContainerRef.current.getBoundingClientRect();
		const buttonRect = button.getBoundingClientRect();
		return {
			x: buttonRect.left + buttonRect.width / 2 - containerRect.left,
			y: buttonRect.top + buttonRect.height / 2 - containerRect.top
		};
	};
	
	// Generate colors for each match pair
	const getMatchColor = (pairIndex: number): string => {
		const colors = [
			'var(--text-accent)',
			'var(--text-success)',
			'var(--text-error)',
			'#8b5cf6', // purple
			'#06b6d4', // cyan
			'#f59e0b', // amber
			'#ef4444', // red
			'#10b981', // green
			'#3b82f6', // blue
		];
		return colors[pairIndex % colors.length];
	};

	// Find which button is at the given point
	const findButtonAtPoint = (point: Point): { side: "left" | "right", index: number } | null => {
		if (!matchingContainerRef.current) return null;
		const containerRect = matchingContainerRef.current.getBoundingClientRect();
		const clientX = point.x + containerRect.left;
		const clientY = point.y + containerRect.top;
		
		// Check left buttons
		for (let i = 0; i < leftButtonRefs.current.length; i++) {
			const button = leftButtonRefs.current[i];
			if (button) {
				const rect = button.getBoundingClientRect();
				if (clientX >= rect.left && clientX <= rect.right &&
					clientY >= rect.top && clientY <= rect.bottom) {
					return { side: "left", index: i };
				}
			}
		}
		
		// Check right buttons
		for (let i = 0; i < rightButtonRefs.current.length; i++) {
			const button = rightButtonRefs.current[i];
			if (button) {
				const rect = button.getBoundingClientRect();
				if (clientX >= rect.left && clientX <= rect.right &&
					clientY >= rect.top && clientY <= rect.bottom) {
					return { side: "right", index: i };
				}
			}
		}
		
		return null;
	};

	// Handle drag start
	const handleDragStart = (side: "left" | "right", index: number, event: React.MouseEvent | React.TouchEvent) => {
		// Allow editing in review-at-end mode
		const canEdit = hideResults || status === "answering";
		if (!canEdit) return;
		
		// If editing in review-at-end mode, reset status to allow re-submission
		if (hideResults && status === "submitted") {
			setStatus("answering");
			autoSubmittedRef.current = false;
		}
		
		event.preventDefault();
		event.stopPropagation();
		
		if (onChoose) {
			onChoose();
		}
		
		setDragging({ side, index });
		const point = side === "left" 
			? getButtonCenter("left", index)
			: getButtonCenter("right", index);
		if (point) {
			setDragPosition(point);
		}
	};

	// Handle drag move
	const handleDragMove = (event: MouseEvent | TouchEvent) => {
		if (!dragging || !matchingContainerRef.current) return;
		
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
		const containerRect = matchingContainerRef.current.getBoundingClientRect();
		
		setDragPosition({
			x: clientX - containerRect.left,
			y: clientY - containerRect.top
		});
	};

	// Handle drag end
	const handleDragEnd = (event: MouseEvent | TouchEvent) => {
		if (!dragging || !dragPosition) {
			setDragging(null);
			setDragPosition(null);
			return;
		}
		
		const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : (event as MouseEvent).clientX;
		const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : (event as MouseEvent).clientY;
		
		if (!matchingContainerRef.current) {
			setDragging(null);
			setDragPosition(null);
			return;
		}
		
		const containerRect = matchingContainerRef.current.getBoundingClientRect();
		const point: Point = {
			x: clientX - containerRect.left,
			y: clientY - containerRect.top
		};
		
		const targetButton = findButtonAtPoint(point);
		
		if (targetButton) {
			// If dragging from left to right
			if (dragging.side === "left" && targetButton.side === "right") {
				// Remove any existing connection from this left item
				const newPairs = selectedPairs.filter(pair => pair.leftIndex !== dragging.index);
				// Remove any existing connection to this right item
				const finalPairs = newPairs.filter(pair => pair.rightIndex !== targetButton.index);
				// Add new connection
				setSelectedPairs([...finalPairs, { leftIndex: dragging.index, rightIndex: targetButton.index }]);
			}
			// If dragging from right to left
			else if (dragging.side === "right" && targetButton.side === "left") {
				// Remove any existing connection from this right item
				const newPairs = selectedPairs.filter(pair => pair.rightIndex !== dragging.index);
				// Remove any existing connection to this left item
				const finalPairs = newPairs.filter(pair => pair.leftIndex !== targetButton.index);
				// Add new connection
				setSelectedPairs([...finalPairs, { leftIndex: targetButton.index, rightIndex: dragging.index }]);
			}
		}
		
		setDragging(null);
		setDragPosition(null);
	};

	// Set up drag event listeners
	useEffect(() => {
		if (!dragging) return;
		
		const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
		const handleMouseUp = (e: MouseEvent) => handleDragEnd(e);
		const handleTouchMove = (e: TouchEvent) => {
			e.preventDefault();
			handleDragMove(e);
		};
		const handleTouchEnd = (e: TouchEvent) => handleDragEnd(e);
		
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
		
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('touchend', handleTouchEnd);
		};
	}, [dragging, dragPosition]);

	// Remove connection by clicking on a button that's already connected
	const handleButtonClick = (side: "left" | "right", index: number) => {
		// Allow editing in review-at-end mode
		const canEdit = hideResults || status === "answering";
		if (!canEdit) return;
		
		// If editing in review-at-end mode, reset status to allow re-submission
		if (hideResults && status === "submitted") {
			setStatus("answering");
			autoSubmittedRef.current = false;
		}
		
		if (side === "left") {
			setSelectedPairs(selectedPairs.filter(pair => pair.leftIndex !== index));
		} else {
			setSelectedPairs(selectedPairs.filter(pair => pair.rightIndex !== index));
		}
	};

	const getLeftButtonClass = (leftIndex: number): string => {
		let baseClass = "matching-button-qg";
		
		if (focusedSide === "left" && focusedIndex === leftIndex && status === "answering") {
			baseClass += " focused-choice-qg";
		}
		
		if (status === "answering" && selectedPairs.some(pair => pair.leftIndex === leftIndex)) {
			return `${baseClass} selected-choice-qg`;
		}

		if (status === "submitted") {
			if (hideResults) {
				return selectedPairs.some(pair => pair.leftIndex === leftIndex) 
					? `${baseClass} selected-choice-qg` 
					: baseClass;
			}
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
		
		if (focusedSide === "right" && focusedIndex === rightIndex && status === "answering") {
			baseClass += " focused-choice-qg";
		}
		
		if (status === "answering" && selectedPairs.some(pair => pair.rightIndex === rightIndex)) {
			return `${baseClass} selected-choice-qg`;
		}

		if (status === "submitted") {
			if (hideResults) {
				return selectedPairs.some(pair => pair.rightIndex === rightIndex)
					? `${baseClass} selected-choice-qg`
					: baseClass;
			}
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

	// Render lines in SVG
	useEffect(() => {
		if (!svgOverlayRef.current || !matchingContainerRef.current) return;
		
		const svg = svgOverlayRef.current;
		svg.innerHTML = '';
		
		// Draw existing connections - use edge positions and unique colors
		selectedPairs.forEach((pair, pairIndex) => {
			const leftPoint = getButtonEdge("left", pair.leftIndex);
			const rightPoint = getButtonEdge("right", pair.rightIndex);
			
			if (leftPoint && rightPoint) {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', leftPoint.x.toString());
				line.setAttribute('y1', leftPoint.y.toString());
				line.setAttribute('x2', rightPoint.x.toString());
				line.setAttribute('y2', rightPoint.y.toString());
				line.setAttribute('stroke-width', '2');
				line.setAttribute('class', 'matching-line-qg');
				
				// Add color based on status
				if (status === "submitted") {
					if (!hideResults) {
						const correct = correctPairsMap.get(pair.leftIndex) === pair.rightIndex;
						line.setAttribute('stroke', correct ? 'var(--text-success)' : 'var(--text-error)');
					} else {
						// Use unique color for each pair when hiding results
						line.setAttribute('stroke', getMatchColor(pairIndex));
					}
				} else if (status === "reviewing") {
					const correct = correctPairsMap.get(pair.leftIndex) === pair.rightIndex;
					line.setAttribute('stroke', correct ? 'var(--text-success)' : 'var(--text-error)');
					if (!correct) {
						line.setAttribute('stroke-dasharray', '5,5');
					}
				} else {
					// Use unique color for each pair when answering
					line.setAttribute('stroke', getMatchColor(pairIndex));
				}
				
				svg.appendChild(line);
			}
		});
		
		// Draw current drag line - use edge for start point
		if (dragging && dragPosition) {
			const startPoint = dragging.side === "left"
				? getButtonEdge("left", dragging.index)
				: getButtonEdge("right", dragging.index);
			
			if (startPoint) {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', startPoint.x.toString());
				line.setAttribute('y1', startPoint.y.toString());
				line.setAttribute('x2', dragPosition.x.toString());
				line.setAttribute('y2', dragPosition.y.toString());
				line.setAttribute('stroke', 'var(--text-accent)');
				line.setAttribute('stroke-width', '2');
				line.setAttribute('stroke-dasharray', '5,5');
				line.setAttribute('class', 'matching-drag-line-qg');
				svg.appendChild(line);
			}
		}
	}, [selectedPairs, dragging, dragPosition, status, correctPairsMap, hideResults]);

	// Keyboard navigation handler
	useEffect(() => {
		// Allow editing in review-at-end mode
		const canEdit = hideResults || status === "answering";
		if (!canEdit) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				return;
			}

			const activeModal = document.querySelector('.modal.is-open');
			if (activeModal && !activeModal.querySelector('.modal-qg')) {
				return;
			}

			const totalOptions = question.answer.length * 2;

			if (/^[1-9]$/.test(event.key) || /^Numpad[1-9]$/.test(event.key)) {
				event.preventDefault();
				const numKey = event.key.startsWith('Numpad') 
					? parseInt(event.key.replace('Numpad', ''), 10)
					: parseInt(event.key, 10);
				
				let selectedSide: "left" | "right";
				let selectedIndex: number;
				
				if (numKey <= question.answer.length) {
					selectedSide = "left";
					selectedIndex = numKey - 1;
				} else {
					selectedSide = "right";
					selectedIndex = numKey - question.answer.length - 1;
				}
				
				if (selectedIndex < 0 || selectedIndex >= question.answer.length) {
					return;
				}
				
				setFocusedSide(selectedSide);
				setFocusedIndex(selectedIndex);
				
				// If there's a pending selection, try to chain them
				if (pendingSelection) {
					// Check if same key pressed twice (unlink)
					if (pendingSelection.side === selectedSide && pendingSelection.index === selectedIndex) {
						// Unlink: remove any connections involving this option
						if (selectedSide === "left") {
							setSelectedPairs(selectedPairs.filter(pair => pair.leftIndex !== selectedIndex));
						} else {
							setSelectedPairs(selectedPairs.filter(pair => pair.rightIndex !== selectedIndex));
						}
						setPendingSelection(null);
					} else if (pendingSelection.side !== selectedSide) {
						// Chain: connect left to right or right to left
						if (pendingSelection.side === "left") {
							// Remove any existing connections from left or to right
							const newPairs = selectedPairs.filter(
								pair => pair.leftIndex !== pendingSelection.index && pair.rightIndex !== selectedIndex
							);
							setSelectedPairs([...newPairs, { leftIndex: pendingSelection.index, rightIndex: selectedIndex }]);
						} else {
							// Remove any existing connections from right or to left
							const newPairs = selectedPairs.filter(
								pair => pair.rightIndex !== pendingSelection.index && pair.leftIndex !== selectedIndex
							);
							setSelectedPairs([...newPairs, { leftIndex: selectedIndex, rightIndex: pendingSelection.index }]);
						}
						setPendingSelection(null);
					} else {
						// Same side, different index - replace pending selection
						setPendingSelection({ side: selectedSide, index: selectedIndex });
					}
				} else {
					// No pending selection, set this as pending
					setPendingSelection({ side: selectedSide, index: selectedIndex });
				}
				return;
			}

			if (!containerRef.current?.contains(document.activeElement) && 
				document.activeElement !== containerRef.current) {
				return;
			}

			if (event.key === 'Tab') {
				event.preventDefault();
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
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [focusedSide, focusedIndex, status, question.answer.length, pendingSelection, selectedPairs]);

	// Save draft pairs whenever selectedPairs changes (if incomplete)
	useEffect(() => {
		if (onDraftChange && hideResults && status === "answering" && selectedPairs.length > 0 && selectedPairs.length < question.answer.length) {
			const userAnswerPairs = selectedPairs.map(pair => ({
				leftOption: leftOptions[pair.leftIndex]?.value || "",
				rightOption: rightOptions[pair.rightIndex]?.value || ""
			}));
			onDraftChange(userAnswerPairs);
		}
	}, [hideResults, status, selectedPairs, leftOptions, rightOptions, onDraftChange, question.answer.length]);

	// Auto-submit when all pairs are selected in review-at-end mode (but allow editing)
	useEffect(() => {
		if (hideResults && status === "answering" && selectedPairs.length === question.answer.length && !autoSubmittedRef.current) {
			autoSubmittedRef.current = true;
			// Don't calculate correctness in review-at-end mode, just store the answer
			const userAnswerPairs = selectedPairs.map(pair => ({
				leftOption: leftOptions[pair.leftIndex]?.value || "",
				rightOption: rightOptions[pair.rightIndex]?.value || ""
			}));
			onAnswer?.(false, userAnswerPairs); // Pass false for correct, will be calculated later
			// Clear draft when submitting complete answer
			if (onDraftChange) {
				onDraftChange([]);
			}
			setStatus("submitted");
			setFocusedSide(null);
			setFocusedIndex(null);
		}
	}, [hideResults, status, selectedPairs.length, question.answer.length, selectedPairs, correctPairsMap, leftOptions, rightOptions, onAnswer, onDraftChange]);
	
	// Reset focus when question changes
	useEffect(() => {
		setFocusedSide(null);
		setFocusedIndex(null);
		setDragging(null);
		setDragPosition(null);
		setPendingSelection(null);
		autoSubmittedRef.current = false;
	}, [question]);

	return (
		<div className="question-container-qg" ref={containerRef} tabIndex={-1}>
			<div className="question-qg" ref={questionRef} />
			<div className="matching-container-qg" ref={matchingContainerRef}>
				<svg 
					ref={svgOverlayRef}
					className="matching-lines-overlay-qg"
					style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
				/>
				<div className="matching-left-column-qg">
					{leftOptions.map((option, index) => {
						const canEdit = hideResults || status === "answering";
						return (
							<div key={index} className="matching-button-container-qg">
								<button
									ref={el => leftButtonRefs.current[index] = el}
									className={getLeftButtonClass(index)}
									onMouseDown={(e) => handleDragStart("left", index, e)}
									onTouchStart={(e) => handleDragStart("left", index, e)}
									onClick={() => handleButtonClick("left", index)}
									disabled={!canEdit}
									data-choice-number={index + 1}
								/>
							</div>
						);
					})}
				</div>
				<div className="matching-right-column-qg">
					{rightOptions.map((option, index) => {
						const canEdit = hideResults || status === "answering";
						return (
							<div key={index} className="matching-button-container-qg">
								<button
									ref={el => rightButtonRefs.current[index] = el}
									className={getRightButtonClass(index)}
									onMouseDown={(e) => handleDragStart("right", index, e)}
									onTouchStart={(e) => handleDragStart("right", index, e)}
									onClick={() => handleButtonClick("right", index)}
									disabled={!canEdit}
									data-choice-number={index + question.answer.length + 1}
								/>
							</div>
						);
					})}
				</div>
			</div>
			{!hideResults && (
				<button
					className="submit-answer-qg"
					onClick={() => {
						if (status === "answering") {
							const allCorrect = selectedPairs.every(pair => 
								correctPairsMap.get(pair.leftIndex) === pair.rightIndex
							);
							const userAnswerPairs = selectedPairs.map(pair => ({
								leftOption: leftOptions[pair.leftIndex]?.value || "",
								rightOption: rightOptions[pair.rightIndex]?.value || ""
							}));
							onAnswer?.(allCorrect, userAnswerPairs);
							setStatus("submitted");
							setFocusedSide(null);
							setFocusedIndex(null);
						}
					}}
					disabled={
						status !== "answering" ||
						selectedPairs.length !== question.answer.length
					}
				>
					Submit
				</button>
			)}
		</div>
	);
};

export default MatchingQuestion;
