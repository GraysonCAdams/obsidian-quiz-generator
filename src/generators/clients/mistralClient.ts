import { Mistral } from "@mistralai/mistralai";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { showError } from "../../utils/notifications";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class MistralClient implements LLMClient {
	private readonly mistral: Mistral;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = true;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.mistral = new Mistral({
			apiKey: settings.mistralApiKey,
			serverURL: settings.mistralBaseURL,
		});
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const response = await this.mistral.chat.complete({
			model: this.settings.mistralTextGenModel,
			messages: this.buildMessages(request),
			responseFormat: request.format === ChatResponseFormat.JSON ? { type: "json_object" } : undefined,
		});

		const choice = response.choices?.[0];
		return {
			content: choice?.message?.content ?? null,
			finishReason: choice?.finishReason ?? null,
		};
	}

	public async calculateSimilarity(userAnswer: string, answer: string): Promise<number> {
		const embedding = await this.mistral.embeddings.create({
			model: this.settings.mistralEmbeddingModel,
			inputs: [userAnswer, answer],
		});

		const first = embedding.data[0]?.embedding;
		const second = embedding.data[1]?.embedding;

		if (!first || !second) {
			showError("Incomplete API response");
			return 0;
		}

		return cosineSimilarity(first, second);
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

