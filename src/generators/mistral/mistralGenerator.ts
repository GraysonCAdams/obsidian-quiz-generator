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
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.mistral.embeddings.create({
				model: this.settings.mistralEmbeddingModel,
				inputs: [userAnswer, answer],
			});

			if (!embedding.data[0].embedding || !embedding.data[1].embedding) {
				showError("Incomplete API response");
				return 0;
			}

			return cosineSimilarity(embedding.data[0].embedding, embedding.data[1].embedding);
		} catch (error) {
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.mistral.chat.complete({
				model: this.settings.mistralTextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away." },
					{ role: "user", content: hintPrompt },
				],
			});

			if (!response.choices || !response.choices[0].message.content) {
				return null;
			}

			return response.choices[0].message.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.mistral.chat.complete({
				model: this.settings.mistralTextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes." },
					{ role: "user", content: titleGenerationPrompt },
				],
			});

			if (!response.choices || !response.choices[0].message.content) {
				return null;
			}

			const title = response.choices[0].message.content.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}

	public async generateRecommendations(incorrectQuestions: Array<{question: string, userAnswer: any, correctAnswer: any, questionType: string}>): Promise<string | null> {
		try {
			const recommendationsPrompt = this.createRecommendationsPrompt(incorrectQuestions);

			const response = await this.mistral.chat.complete({
				model: this.settings.mistralTextGenModel,
				messages: [
					{ role: "system", content: "You are an academic tutor providing evidence-based study recommendations. Your advice should follow educational principles and learning science." },
					{ role: "user", content: recommendationsPrompt },
				],
			});

			if (!response.choices || !response.choices[0].message.content) {
				return null;
			}

			return response.choices[0].message.content.trim() || null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}
}
