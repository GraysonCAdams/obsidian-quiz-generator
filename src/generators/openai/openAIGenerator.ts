import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import OpenAIClient from "../clients/openAIClient";

export default class OpenAIGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(
			settings,
			new OpenAIClient(settings),
			{
				providerName: "OpenAI",
				temperatureOverrides: {
					title: 0.7,
					recommendations: 0.7,
				},
			}
		);
	}
}
