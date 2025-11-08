import Anthropic from "@anthropic-ai/sdk";
import { QuizSettings } from "../../settings/config";
import { AnthropicTextGenModel } from "../anthropic/anthropicModels";
import { LLMChatRequest, LLMClient, LLMResponse } from "./types";

export default class AnthropicClient implements LLMClient {
	private readonly anthropic: Anthropic;
	private readonly settings: QuizSettings;

	public readonly supportsSimilarity = false;

	constructor(settings: QuizSettings) {
		this.settings = settings;
		this.anthropic = new Anthropic({
			apiKey: settings.anthropicApiKey,
			baseURL: settings.anthropicBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generate(request: LLMChatRequest): Promise<LLMResponse> {
		const response = await this.anthropic.messages.create({
			model: this.settings.anthropicTextGenModel,
			system: request.systemPrompt,
			messages: [{ role: "user", content: request.userPrompt }],
			max_tokens: request.maxTokens ?? this.getDefaultMaxTokens(),
			temperature: request.temperature,
		});

		const textBlock = response.content.find((content): content is { type: "text"; text: string } => content.type === "text");

		return {
			content: textBlock?.text ?? null,
			finishReason: response.stop_reason ?? null,
		};
	}

	public calculateSimilarity(): Promise<number> {
		return Promise.reject(new Error("Anthropic does not support embedding similarity."));
	}

	private getDefaultMaxTokens(): number {
		// Mirror previous behaviour: Sonnet supports larger output
		return this.settings.anthropicTextGenModel === AnthropicTextGenModel.CLAUDE_3_5_SONNET ? 8192 : 4096;
	}
}

