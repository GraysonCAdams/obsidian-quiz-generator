import OpenAI from "openai";
import { QuizSettings } from "../../settings/config";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class PerplexityClient implements LLMClient {
	private readonly perplexity: OpenAI;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = false;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.perplexity = new OpenAI({
			apiKey: settings.perplexityApiKey,
			baseURL: settings.perplexityBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const response = await this.perplexity.chat.completions.create({
			model: this.settings.perplexityTextGenModel,
			messages: this.buildMessages(request),
			max_tokens: request.maxTokens,
			temperature: request.temperature,
		});

		const choice = response.choices[0];
		return {
			content: choice?.message?.content ?? null,
			finishReason: choice?.finish_reason ?? null,
		};
	}

	public calculateSimilarity(): Promise<number> {
		return Promise.reject(new Error("Perplexity does not support embedding similarity."));
	}

	private buildMessages(request: LLMChatRequest) {
		const messages: Array<{ role: "system" | "user"; content: string }> = [];

		if (request.systemPrompt) {
			messages.push({ role: "system", content: request.systemPrompt });
		}

		messages.push({ role: "user", content: request.userPrompt });

		return messages;
	}
}

