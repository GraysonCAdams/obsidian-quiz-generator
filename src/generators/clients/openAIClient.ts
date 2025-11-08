import OpenAI from "openai";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class OpenAIClient implements LLMClient {
	private readonly openai: OpenAI;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = true;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.openai = new OpenAI({
			apiKey: settings.openAIApiKey,
			baseURL: settings.openAIBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const response = await this.openai.chat.completions.create({
			model: this.settings.openAITextGenModel,
			messages: this.buildMessages(request),
			response_format: request.format === ChatResponseFormat.JSON ? { type: "json_object" } : undefined,
			max_tokens: request.maxTokens,
			temperature: request.temperature,
		});

		const choice = response.choices[0];
		return {
			content: choice?.message?.content ?? null,
			finishReason: choice?.finish_reason ?? null,
		};
	}

	public async calculateSimilarity(userAnswer: string, answer: string): Promise<number> {
		const embedding = await this.openai.embeddings.create({
			model: this.settings.openAIEmbeddingModel,
			input: [userAnswer, answer],
		});

		return cosineSimilarity(embedding.data[0].embedding, embedding.data[1].embedding);
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

