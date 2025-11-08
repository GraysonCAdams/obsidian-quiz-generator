import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import AnthropicClient from "../clients/anthropicClient";

export default class AnthropicGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(
			settings,
			new AnthropicClient(settings),
			{
				providerName: "Anthropic",
				similarityUnsupportedMessage: "Anthropic does not support grading short and long answer questions. Please switch to a provider that offers embedding models.",
			}
		);
	}
}
