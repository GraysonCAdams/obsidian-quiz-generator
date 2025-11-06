import OpenAI from "openai";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { handleTruncationNotice, handleGenerationError, handleEmbeddingError } from "../../utils/errorHandler";

export default class OpenAIGenerator extends Generator {
	private readonly openai: OpenAI;

	constructor(settings: QuizSettings) {
		super(settings);
		this.openai = new OpenAI({
			apiKey: this.settings.openAIApiKey,
			baseURL: this.settings.openAIBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.settings.openAITextGenModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
				response_format: { type: "json_object" },
			});

			handleTruncationNotice(response.choices[0].finish_reason);

			return response.choices[0].message.content;
		} catch (error) {
			handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.openai.embeddings.create({
				model: this.settings.openAIEmbeddingModel,
				input: [userAnswer, answer],
			});

			return cosineSimilarity(embedding.data[0].embedding, embedding.data[1].embedding);
		} catch (error) {
			handleEmbeddingError(error);
		}
	}
}
