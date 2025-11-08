import { GoogleGenerativeAI } from "@google/generative-ai";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { LLMChatRequest, LLMClient, LLMResponse, ChatResponseFormat } from "./types";

export default class GoogleClient implements LLMClient {
	private readonly google: GoogleGenerativeAI;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = true;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.google = new GoogleGenerativeAI(settings.googleApiKey);
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const model = this.google.getGenerativeModel(
			{
				model: this.settings.googleTextGenModel,
				systemInstruction: request.systemPrompt,
				generationConfig: this.buildGenerationConfig(request),
			},
			{
				baseUrl: this.settings.googleBaseURL,
			}
		);

		const response = await model.generateContent(request.userPrompt);
		const content = response.response.text();

		return {
			content: content ?? null,
			finishReason: undefined,
		};
	}

	public async calculateSimilarity(userAnswer: string, answer: string): Promise<number> {
		const model = this.google.getGenerativeModel(
			{
				model: this.settings.googleEmbeddingModel,
			},
			{
				baseUrl: this.settings.googleBaseURL,
			}
		);

		const embedding = await model.batchEmbedContents({
			requests: [
				{ content: { role: "user", parts: [{ text: userAnswer }] } },
				{ content: { role: "user", parts: [{ text: answer }] } },
			],
		});

		return cosineSimilarity(embedding.embeddings[0].values, embedding.embeddings[1].values);
	}

	private buildGenerationConfig(request: LLMChatRequest) {
		if (request.format === ChatResponseFormat.JSON) {
			return { responseMimeType: "application/json" };
		}

		return undefined;
	}
}

