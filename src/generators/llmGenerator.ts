import Generator from "./generator";
import { QuizSettings } from "../settings/config";
import { handleGenerationError, handleTruncationNotice, handleEmbeddingError } from "../utils/errorHandler";
import { ChatResponseFormat, LLMChatRequest, LLMClient } from "./clients/types";

interface LLMGeneratorOptions {
	providerName: string;
	similarityUnsupportedMessage?: string;
	temperatureOverrides?: Partial<Record<"hint" | "title" | "recommendations", number>>;
}

export default abstract class LLMGenerator extends Generator {
	protected readonly client: LLMClient;
	private readonly providerName: string;
	private readonly similarityUnsupportedMessage?: string;
	private readonly temperatureOverrides?: Partial<Record<"hint" | "title" | "recommendations", number>>;

	protected constructor(settings: QuizSettings, client: LLMClient, options: LLMGeneratorOptions) {
		super(settings);
		this.client = client;
		this.providerName = options.providerName;
		this.similarityUnsupportedMessage = options.similarityUnsupportedMessage;
		this.temperatureOverrides = options.temperatureOverrides;
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.client.generate(this.createJsonRequest(this.systemPrompt(), this.userPrompt(contents)));
			handleTruncationNotice(response.finishReason);
			return response.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		if (!this.client.supportsSimilarity) {
			throw new Error(
				this.similarityUnsupportedMessage ??
				`${this.providerName} does not support grading short and long answer questions. Please switch to a provider that offers embedding models.`
			);
		}

		try {
			return await this.client.calculateSimilarity(userAnswer, answer);
		} catch (error) {
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(
		question: string,
		answer: string | boolean | number | number[] | string[] | Array<{ leftOption: string; rightOption: string }>,
		sourceContent?: string
	): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);
			const response = await this.client.generate(this.createTextRequest(
				"You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away.",
				hintPrompt,
				"hint",
				200
			));
			return response.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);
			const response = await this.client.generate(this.createTextRequest(
				"You are a helpful assistant that generates concise, descriptive titles for educational quizzes.",
				titleGenerationPrompt,
				"title",
				100,
				0.7
			));

			const title = response.content?.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error(`Error generating quiz title with ${this.providerName}:`, error);
			return null;
		}
	}

	public async generateRecommendations(
		incorrectQuestions: Array<{ question: string; userAnswer: any; correctAnswer: any; questionType: string }>
	): Promise<string | null> {
		try {
			const recommendationsPrompt = this.createRecommendationsPrompt(incorrectQuestions);
			const response = await this.client.generate(this.createTextRequest(
				"You are an academic tutor providing evidence-based study recommendations. Your advice should follow educational principles and learning science.",
				recommendationsPrompt,
				"recommendations",
				500,
				0.7
			));

			return response.content?.trim() || null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	private createJsonRequest(systemPrompt: string, userPrompt: string): LLMChatRequest {
		return {
			systemPrompt,
			userPrompt,
			format: ChatResponseFormat.JSON,
		};
	}

	private createTextRequest(
		systemPrompt: string,
		userPrompt: string,
		context: "hint" | "title" | "recommendations",
		maxTokens?: number,
		defaultTemperature?: number
	): LLMChatRequest {
		return {
			systemPrompt,
			userPrompt,
			format: ChatResponseFormat.TEXT,
			maxTokens,
			temperature: this.temperatureOverrides?.[context] ?? defaultTemperature,
		};
	}
}

