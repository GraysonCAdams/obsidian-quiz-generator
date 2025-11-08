import Anthropic from "@anthropic-ai/sdk";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { AnthropicTextGenModel } from "./anthropicModels";
import { handleTruncationNotice, handleGenerationError } from "../../utils/errorHandler";

export default class AnthropicGenerator extends Generator {
	private readonly anthropic: Anthropic;

	constructor(settings: QuizSettings) {
		super(settings);
		this.anthropic = new Anthropic({
			apiKey: this.settings.anthropicApiKey,
			baseURL: this.settings.anthropicBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.anthropic.messages.create({
				model: this.settings.anthropicTextGenModel,
				system: this.systemPrompt(),
				messages: [
					{ role: "user", content: this.userPrompt(contents) },
				],
				max_tokens: this.getMaxTokens(),
			});

			handleTruncationNotice(response.stop_reason);

			return response.content[0].type === "text" ? response.content[0].text : null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		throw new Error("Anthropic does not support grading short and long answer questions. Please switch to a provider that offers embedding models.");
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.anthropic.messages.create({
				model: this.settings.anthropicTextGenModel,
				system: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away.",
				messages: [
					{ role: "user", content: hintPrompt },
				],
				max_tokens: 200,
			});

			return response.content[0].type === "text" ? response.content[0].text : null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.anthropic.messages.create({
				model: this.settings.anthropicTextGenModel,
				system: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes.",
				messages: [
					{ role: "user", content: titleGenerationPrompt },
				],
				max_tokens: 100,
			});

			const title = response.content[0].type === "text" ? response.content[0].text.trim() : null;
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}

	public async generateRecommendations(incorrectQuestions: Array<{question: string, userAnswer: any, correctAnswer: any, questionType: string}>): Promise<string | null> {
		try {
			const recommendationsPrompt = this.createRecommendationsPrompt(incorrectQuestions);

			const response = await this.anthropic.messages.create({
				model: this.settings.anthropicTextGenModel,
				system: "You are an academic tutor providing evidence-based study recommendations. Your advice should follow educational principles and learning science.",
				messages: [
					{ role: "user", content: recommendationsPrompt },
				],
				max_tokens: 500,
			});

			return response.content[0].type === "text" ? response.content[0].text.trim() : null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	private getMaxTokens(): number {
		return this.settings.anthropicTextGenModel === AnthropicTextGenModel.CLAUDE_3_5_SONNET ? 8192 : 4096;
	}
}
