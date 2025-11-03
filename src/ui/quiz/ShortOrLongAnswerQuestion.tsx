import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShortOrLongAnswer } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import GeneratorFactory from "../../generators/generatorFactory";
import AnswerInput from "../components/AnswerInput";

interface ShortOrLongAnswerQuestionProps {
	app: App;
	question: ShortOrLongAnswer;
	settings: QuizSettings;
}

const ShortOrLongAnswerQuestion = ({ app, question, settings }: ShortOrLongAnswerQuestionProps) => {
	const [status, setStatus] = useState<"answering" | "evaluating" | "submitted">("answering");
	const [similarityPercentage, setSimilarityPercentage] = useState<number | null>(null);
	const [markedCorrect, setMarkedCorrect] = useState<boolean>(false);
	const component = useMemo<Component>(() => new Component(), []);
	const questionRef = useRef<HTMLDivElement>(null);
	const answerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		question.question.split("\\n").forEach(questionFragment => {
			if (questionRef.current) {
				MarkdownRenderer.render(app, questionFragment, questionRef.current, "", component);
			}
		});
	}, [app, question, component]);

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
			return;
		}

		try {
			setStatus("evaluating");
			new Notice("Evaluating answer...");
			const generator = GeneratorFactory.createInstance(settings);
			const similarity = await generator.shortOrLongAnswerSimilarity(input.trim(), question.answer);
			const percentage = Math.round(similarity * 100);
			setSimilarityPercentage(percentage);
			if (percentage >= 70) {
				new Notice(`Correct: ${percentage}% match`);
			} else {
				new Notice(`Incorrect: ${percentage}% match`);
			}
			setStatus("submitted");
		} catch (error) {
			setStatus("answering");
			new Notice((error as Error).message, 0);
		}
	};

	const handleMarkCorrect = () => {
		setMarkedCorrect(true);
		new Notice("Marked as correct");
	};

	const isIncorrect = status === "submitted" && similarityPercentage !== null && similarityPercentage < 70;
	const showOverride = isIncorrect && !markedCorrect;

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			{status === "submitted" && <button className="answer-qg" ref={answerRef} />}
			{showOverride && (
				<div className="override-container-qg">
					<button className="override-button-qg" onClick={handleMarkCorrect}>
						I was correct
					</button>
				</div>
			)}
			{markedCorrect && (
				<div className="override-notice-qg">
					✓ Marked as correct
				</div>
			)}
			<div className={status === "submitted" ? "input-container-qg" : "input-container-qg limit-height-qg"}>
				<AnswerInput onSubmit={handleSubmit} clearInputOnSubmit={false} disabled={status !== "answering"} />
				<div className="instruction-footnote-qg">
					Press enter to submit your answer. Press enter without typing to mark as incorrect and reveal the answer.
				</div>
			</div>
		</div>
	);
};

export default ShortOrLongAnswerQuestion;
