import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import PerplexityClient from "../clients/perplexityClient";

export default class PerplexityGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(
			settings,
			new PerplexityClient(settings),
			{
				providerName: "Perplexity",
				similarityUnsupportedMessage: "Perplexity does not support grading short and long answer questions. Please switch to a provider that offers embedding models.",
				temperatureOverrides: {
					title: 0.7,
					recommendations: 0.7,
				},
			}
		);
	}
}
