import { Ollama } from "ollama/dist/browser.mjs";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class OllamaClient implements LLMClient {
	private readonly ollama: Ollama;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = true;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.ollama = new Ollama({ host: settings.ollamaBaseURL });
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const payload: Record<string, unknown> = {
			model: this.settings.ollamaTextGenModel,
			system: request.systemPrompt,
			prompt: request.userPrompt,
			stream: false,
		};

		if (request.format === ChatResponseFormat.JSON) {
			payload.format = "json";
		}

		const response = await this.ollama.generate(payload as any) as any;

		return {
			content: response.response ?? null,
			finishReason: response.done ? null : undefined,
		};
	}

	public async calculateSimilarity(userAnswer: string, answer: string): Promise<number> {
		const embedding = await this.ollama.embed({
			model: this.settings.ollamaEmbeddingModel,
			input: [userAnswer, answer],
		});

		return cosineSimilarity(embedding.embeddings[0], embedding.embeddings[1]);
	}
}

