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
			return handleGenerationError(error);
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
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.openai.chat.completions.create({
				model: this.settings.openAITextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away." },
					{ role: "user", content: hintPrompt },
				],
				max_tokens: 200,
			});

			return response.choices[0].message.content;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.openai.chat.completions.create({
				model: this.settings.openAITextGenModel,
				messages: [
					{ role: "system", content: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes." },
					{ role: "user", content: titleGenerationPrompt },
				],
				max_tokens: 100,
				temperature: 0.7,
			});

			const title = response.choices[0].message.content?.trim();
			// Remove quotes if present
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}

	public async generateRecommendations(incorrectQuestions: Array<{question: string, userAnswer: any, correctAnswer: any, questionType: string}>): Promise<string | null> {
		try {
			const recommendationsPrompt = this.createRecommendationsPrompt(incorrectQuestions);

			const response = await this.openai.chat.completions.create({
				model: this.settings.openAITextGenModel,
				messages: [
					{ role: "system", content: "You are an academic tutor providing evidence-based study recommendations. Your advice should follow educational principles and learning science." },
					{ role: "user", content: recommendationsPrompt },
				],
				max_tokens: 500,
				temperature: 0.7,
			});

			return response.choices[0].message.content?.trim() || null;
		} catch (error) {
			return handleGenerationError(error);
		}
	}
}
