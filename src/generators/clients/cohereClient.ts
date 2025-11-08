import { CohereClient as CohereApiClient } from "cohere-ai/Client";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class CohereClient implements LLMClient {
	private readonly cohere: CohereApiClient;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = true;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.cohere = new CohereApiClient({
			token: settings.cohereApiKey,
			environment: settings.cohereBaseURL,
		});
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const response = await this.cohere.chat({
			model: this.settings.cohereTextGenModel,
			preamble: request.systemPrompt,
			message: request.userPrompt,
			responseFormat: request.format === ChatResponseFormat.JSON ? { type: "json_object" } : undefined,
		});

		return {
			content: response.text ?? null,
			finishReason: response.finishReason === "MAX_TOKENS" ? "max_tokens" : response.finishReason ?? null,
		};
	}

	public async calculateSimilarity(userAnswer: string, answer: string): Promise<number> {
		const embedding = await this.cohere.embed({
			model: this.settings.cohereEmbeddingModel,
			texts: [userAnswer, answer],
			inputType: "classification",
		});

		const vectors = embedding.embeddings as number[][];
		return cosineSimilarity(vectors[0], vectors[1]);
	}
}

