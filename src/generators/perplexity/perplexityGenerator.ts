import OpenAI from "openai";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { handleTruncationNotice, handleGenerationError } from "../../utils/errorHandler";

export default class PerplexityGenerator extends Generator {
	private readonly perplexity: OpenAI;

	constructor(settings: QuizSettings) {
		super(settings);
		this.perplexity = new OpenAI({
			apiKey: this.settings.perplexityApiKey,
			baseURL: this.settings.perplexityBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.perplexity.chat.completions.create({
				model: this.settings.perplexityTextGenModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
			});

			handleTruncationNotice(response.choices[0].finish_reason);

			return response.choices[0].message.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		throw new Error("Perplexity does not support grading short and long answer questions. Please switch to a provider that offers embedding models.");
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.perplexity.chat.completions.create({
				model: this.settings.perplexityTextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away." },
					{ role: "user", content: hintPrompt },
				],
				max_tokens: 200,
			});

			return response.choices[0].message.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.perplexity.chat.completions.create({
				model: this.settings.perplexityTextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes." },
					{ role: "user", content: titleGenerationPrompt },
				],
				max_tokens: 100,
				temperature: 0.7,
			});

			const title = response.choices[0].message.content?.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}
}
