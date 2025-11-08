import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import { MutableRefObject, useEffect, useRef } from "react";

export interface QuestionMarkdownOptions {
	app: App;
	question: string;
	showRepeat?: boolean;
	onRepeat?: () => void;
}

export const useQuestionMarkdown = ({
	app,
	question,
	showRepeat = false,
	onRepeat,
}: QuestionMarkdownOptions): MutableRefObject<HTMLDivElement | null> => {
	const questionRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const container = questionRef.current;
		if (!container) {
			return;
		}

		const component = new Component();

		container.empty();

		question.split("\\n").forEach(fragment => {
			MarkdownRenderer.render(app, fragment, container, "", component);
		});

		if (showRepeat && onRepeat) {
			const existingRepeat = container.querySelector(".quiz-repeat-question-link-qg");
			if (existingRepeat) {
				existingRepeat.remove();
			}

			const repeatLink = document.createElement("a");
			repeatLink.className = "quiz-repeat-question-link-qg";
			repeatLink.href = "#";
			repeatLink.title = "Repeat question";
			repeatLink.addEventListener("click", event => {
				event.preventDefault();
				onRepeat();
			});
			setIcon(repeatLink, "repeat");

			const firstParagraph = container.querySelector("p");
			if (firstParagraph) {
				firstParagraph.appendChild(repeatLink);
			} else {
				const firstElement = container.firstElementChild || container.firstChild;
				if (firstElement instanceof HTMLElement) {
					firstElement.appendChild(repeatLink);
				} else {
					container.appendChild(repeatLink);
				}
			}
		}

		return () => {
			component.unload();
		};
	}, [app, question, showRepeat, onRepeat]);

	return questionRef;
};

