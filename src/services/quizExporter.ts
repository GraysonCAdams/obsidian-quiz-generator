import { Question } from "../utils/types";
import {
	isTrueFalse,
	isMultipleChoice,
	isSelectAllThatApply,
	isFillInTheBlank,
	isMatching,
	isShortOrLongAnswer
} from "../utils/typeGuards";

export type ExportFormat = "anki" | "quizlet" | "remnote";

export default class QuizExporter {
	/**
	 * Exports quiz questions to Anki format (tab-separated values)
	 * Format: Question<TAB>Answer
	 */
	static exportToAnki(questions: Question[]): string {
		const lines: string[] = [];
		
		questions.forEach((q) => {
			const question = this.formatQuestion(q);
			const answer = this.formatAnswer(q);
			lines.push(`${question}\t${answer}`);
		});
		
		return lines.join("\n");
	}

	/**
	 * Exports quiz questions to Quizlet format (CSV)
	 * Format: Question,Answer
	 */
	static exportToQuizlet(questions: Question[]): string {
		const lines: string[] = [];
		lines.push("Question,Answer"); // CSV header
		
		questions.forEach((q) => {
			const question = this.formatQuestion(q);
			const answer = this.formatAnswer(q);
			// Escape commas and quotes in CSV
			const escapedQuestion = this.escapeCsv(question);
			const escapedAnswer = this.escapeCsv(answer);
			lines.push(`${escapedQuestion},${escapedAnswer}`);
		});
		
		return lines.join("\n");
	}

	/**
	 * Exports quiz questions to RemNote format (CSV)
	 * Format: Question,Answer
	 * Similar to Quizlet but can be imported into RemNote
	 */
	static exportToRemNote(questions: Question[]): string {
		// RemNote also uses CSV format
		return this.exportToQuizlet(questions);
	}

	/**
	 * Formats a question for display in export
	 */
	private static formatQuestion(q: Question): string {
		if (isTrueFalse(q)) {
			return q.question;
		} else if (isMultipleChoice(q)) {
			const options = q.options.map((opt, idx) => `${String.fromCharCode(97 + idx)}) ${opt}`).join("\n");
			return `${q.question}\n${options}`;
		} else if (isSelectAllThatApply(q)) {
			const options = q.options.map((opt, idx) => `${String.fromCharCode(97 + idx)}) ${opt}`).join("\n");
			return `${q.question}\n${options}`;
		} else if (isFillInTheBlank(q)) {
			return q.question;
		} else if (isMatching(q)) {
			// For matching, show the question with the pairs
			const leftItems: string[] = [];
			const rightItems: string[] = [];
			
			q.answer.forEach((pair, idx) => {
				leftItems.push(`${String.fromCharCode(97 + idx)}) ${pair.leftOption}`);
				rightItems.push(`${String.fromCharCode(110 + idx)}) ${pair.rightOption}`);
			});
			
			return `${q.question}\n${leftItems.join("\n")}\n\n${rightItems.join("\n")}`;
		} else if (isShortOrLongAnswer(q)) {
			return q.question;
		}
		
		return "";
	}

	/**
	 * Formats an answer for display in export
	 */
	private static formatAnswer(q: Question): string {
		if (isTrueFalse(q)) {
			return q.answer ? "True" : "False";
		} else if (isMultipleChoice(q)) {
			const correctOption = q.options[q.answer];
			return `${String.fromCharCode(97 + q.answer)}) ${correctOption}`;
		} else if (isSelectAllThatApply(q)) {
			const answers = q.answer
				.map((idx) => `${String.fromCharCode(97 + idx)}) ${q.options[idx]}`)
				.join("\n");
			return answers;
		} else if (isFillInTheBlank(q)) {
			return q.answer.join(", ");
		} else if (isMatching(q)) {
			const pairs = q.answer
				.map((pair) => `${pair.leftOption} → ${pair.rightOption}`)
				.join("\n");
			return pairs;
		} else if (isShortOrLongAnswer(q)) {
			return q.answer;
		}
		
		return "";
	}

	/**
	 * Escapes CSV special characters (commas and quotes)
	 */
	private static escapeCsv(text: string): string {
		// Replace newlines with spaces for CSV compatibility
		const normalized = text.replace(/\n/g, " | ");
		
		// If text contains comma, quote, or newline, wrap in quotes and escape quotes
		if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
			return `"${normalized.replace(/"/g, '""')}"`;
		}
		
		return normalized;
	}

	/**
	 * Exports questions to the specified format and triggers download
	 */
	static export(questions: Question[], format: ExportFormat, filename?: string): void {
		let content: string;
		let extension: string;
		let mimeType: string;

		switch (format) {
			case "anki":
				content = this.exportToAnki(questions);
				extension = "txt";
				mimeType = "text/tab-separated-values";
				break;
			case "quizlet":
				content = this.exportToQuizlet(questions);
				extension = "csv";
				mimeType = "text/csv";
				break;
			case "remnote":
				content = this.exportToRemNote(questions);
				extension = "csv";
				mimeType = "text/csv";
				break;
			default:
				throw new Error(`Unknown export format: ${format}`);
		}

		const defaultFilename = `quiz-export-${new Date().toISOString().split("T")[0]}.${extension}`;
		const finalFilename = filename || defaultFilename;

		// Create blob and trigger download
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = finalFilename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}
