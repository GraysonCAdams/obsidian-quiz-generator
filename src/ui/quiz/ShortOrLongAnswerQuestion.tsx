import { App, Component, MarkdownRenderer, Notice, setIcon } from "obsidian";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ShortOrLongAnswer } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import GeneratorFactory from "../../generators/generatorFactory";
import AnswerInput from "../components/AnswerInput";

interface ShortOrLongAnswerQuestionProps {
	app: App;
	question: ShortOrLongAnswer;
	settings: QuizSettings;
	onAnswer?: (correct: boolean) => void;
	onChoose?: () => void;
	answered?: boolean;
	onRepeat?: () => void;
	showRepeat?: boolean;
}

const ShortOrLongAnswerQuestion = ({ app, question, settings, onAnswer, onChoose, answered = false, onRepeat, showRepeat = false }: ShortOrLongAnswerQuestionProps) => {
	const [status, setStatus] = useState<"answering" | "evaluating" | "submitted">("answering");
	const [similarityPercentage, setSimilarityPercentage] = useState<number | null>(null);
	const [markedCorrect, setMarkedCorrect] = useState<boolean>(false);
	
	// If already answered, set status to submitted
	useEffect(() => {
		if (answered) {
			setStatus("submitted");
		}
	}, [answered]);
	const component = useMemo<Component>(() => new Component(), []);
	const questionRef = useRef<HTMLDivElement>(null);
	const answerRef = useRef<HTMLButtonElement>(null);
	const repeatButtonRef = useRef<HTMLAnchorElement | null>(null);

	useEffect(() => {
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
	}, [app, question, component, showRepeat, onRepeat]);

	useEffect(() => {
		if (answerRef.current && status === "submitted") {
			MarkdownRenderer.render(app, question.answer, answerRef.current, "", component);
		}
	}, [app, question, component, status]);

	const handleSubmit = async (input: string) => {
		// If empty, mark as incorrect and reveal answer
		if (!input.trim()) {
			setStatus("submitted");
			setSimilarityPercentage(0);
			new Notice("Incorrect: 0% match");
			onAnswer?.(false);
			return;
		}

		try {
			setStatus("evaluating");
			new Notice("Evaluating answer...");
			const generator = GeneratorFactory.createInstance(settings);
			const similarity = await generator.shortOrLongAnswerSimilarity(input.trim(), question.answer);
			const percentage = Math.round(similarity * 100);
			setSimilarityPercentage(percentage);
			const correct = percentage >= 70;
			if (correct) {
				new Notice(`Correct: ${percentage}% match`);
			} else {
				new Notice(`Incorrect: ${percentage}% match`);
			}
			onAnswer?.(correct);
			setStatus("submitted");
		} catch (error) {
			setStatus("answering");
			new Notice((error as Error).message, 0);
		}
	};

	const handleMarkCorrect = useCallback(() => {
		setMarkedCorrect(true);
		new Notice("Marked as correct");
		// Override the answer result to correct
		onAnswer?.(true);
		
		// Auto-progress to next question after 3 seconds
		setTimeout(() => {
			// Trigger a custom event that the parent can listen to for auto-progression
			const event = new CustomEvent('quiz-auto-progress');
			window.dispatchEvent(event);
		}, 3000);
	}, [onAnswer]);

	const isIncorrect = status === "submitted" && similarityPercentage !== null && similarityPercentage < 70;
	const isCorrect = status === "submitted" && similarityPercentage !== null && similarityPercentage >= 70;
	const showOverride = isIncorrect && !markedCorrect;
	const showGotIt = (isCorrect || isIncorrect) && !markedCorrect;

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			{status === "submitted" && <button className="answer-qg" ref={answerRef} />}
			{(showOverride || showGotIt) && (
				<div className="override-container-qg">
					{showOverride && (
						<button className="override-button-qg override-button-red-qg" onClick={handleMarkCorrect}>
							I was correct
						</button>
					)}
					{showGotIt && (
						<button className="override-button-qg override-button-green-qg" onClick={handleMarkCorrect}>
							Got it!
						</button>
					)}
				</div>
			)}
			{markedCorrect && (
				<div className="override-notice-qg">
					✓ Marked as correct
				</div>
			)}
			<div className={status === "submitted" ? "input-container-qg" : "input-container-qg limit-height-qg"}>
				<AnswerInput onSubmit={handleSubmit} clearInputOnSubmit={false} disabled={status !== "answering"} onChoose={onChoose} />
				<div className="instruction-footnote-qg">
					Press enter to submit your answer. Press enter without typing to mark as incorrect and reveal the answer.
				</div>
			</div>
		</div>
	);
};

export default ShortOrLongAnswerQuestion;
