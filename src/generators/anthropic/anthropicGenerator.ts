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
			handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		throw new Error("Anthropic does not support grading short and long answer questions. Please switch to a provider that offers embedding models.");
	}

	private getMaxTokens(): number {
		return this.settings.anthropicTextGenModel === AnthropicTextGenModel.CLAUDE_3_5_SONNET ? 8192 : 4096;
	}
}
