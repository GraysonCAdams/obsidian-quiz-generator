import { CohereClient } from "cohere-ai/Client";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { handleTruncationNotice, handleGenerationError, handleEmbeddingError } from "../../utils/errorHandler";

export default class CohereGenerator extends Generator {
	private readonly cohere: CohereClient;

	constructor(settings: QuizSettings) {
		super(settings);
		this.cohere = new CohereClient({
			token: this.settings.cohereApiKey,
			environment: this.settings.cohereBaseURL,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string> {
		try {
			const response = await this.cohere.chat({
				model: this.settings.cohereTextGenModel,
				preamble: this.systemPrompt(),
				message: this.userPrompt(contents),
				responseFormat: { type: "json_object" },
			});

			handleTruncationNotice(response.finishReason === "MAX_TOKENS" ? "max_tokens" : null);

			return response.text;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.cohere.embed({
				model: this.settings.cohereEmbeddingModel,
				texts: [userAnswer, answer],
				inputType: "classification",
			});

			return cosineSimilarity((embedding.embeddings as number[][])[0], (embedding.embeddings as number[][])[1]);
		} catch (error) {
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.cohere.chat({
				model: this.settings.cohereTextGenModel,
				preamble: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away.",
				message: hintPrompt,
			});

			return response.text;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.cohere.chat({
				model: this.settings.cohereTextGenModel,
				preamble: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes.",
				message: titleGenerationPrompt,
			});

			const title = response.text?.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}
}
