import { Mistral } from "@mistralai/mistralai";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { handleTruncationNotice, handleGenerationError, handleEmbeddingError } from "../../utils/errorHandler";
import { showError } from "../../utils/notifications";

export default class MistralGenerator extends Generator {
	private readonly mistral: Mistral;

	constructor(settings: QuizSettings) {
		super(settings);
		this.mistral = new Mistral({
			apiKey: this.settings.mistralApiKey,
			serverURL: this.settings.mistralBaseURL,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.mistral.chat.complete({
				model: this.settings.mistralTextGenModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
				responseFormat: { type: "json_object" },
			});

			if (!response.choices || !response.choices[0].message.content) {
				return null;
			}

			handleTruncationNotice(response.choices[0].finishReason);

			return response.choices[0].message.content;
		} catch (error) {
			handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.mistral.embeddings.create({
				model: this.settings.mistralEmbeddingModel,
				inputs: [userAnswer, answer],
			});

			if (!embedding.data[0].embedding || !embedding.data[1].embedding) {
				showErrorNotification("Incomplete API response");
				return 0;
			}

			return cosineSimilarity(embedding.data[0].embedding, embedding.data[1].embedding);
		} catch (error) {
			handleEmbeddingError(error);
		}
	}
}
