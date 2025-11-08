import { GoogleGenerativeAI } from "@google/generative-ai";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { handleGenerationError, handleEmbeddingError } from "../../utils/errorHandler";

export default class GoogleGenerator extends Generator {
	private readonly google: GoogleGenerativeAI;

	constructor(settings: QuizSettings) {
		super(settings);
		this.google = new GoogleGenerativeAI(this.settings.googleApiKey);
	}

	public async generateQuiz(contents: string[]): Promise<string> {
		try {
			const model = this.google.getGenerativeModel(
				{
					model: this.settings.googleTextGenModel,
					systemInstruction: this.systemPrompt(),
					generationConfig: { responseMimeType: "application/json" },
				},
				{
					baseUrl: this.settings.googleBaseURL,
				}
			);
			const response = await model.generateContent(this.userPrompt(contents));

			return response.response.text();
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const model = this.google.getGenerativeModel(
				{
					model: this.settings.googleEmbeddingModel,
				},
				{
					baseUrl: this.settings.googleBaseURL,
				}
			);
			const embedding = await model.batchEmbedContents({
				requests: [
					{ content: { role: "user", parts: [{ text: userAnswer }] } },
					{ content: { role: "user", parts: [{ text: answer }] } },
				],
			});

			return cosineSimilarity(embedding.embeddings[0].values, embedding.embeddings[1].values);
		} catch (error) {
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const model = this.google.getGenerativeModel(
				{
					model: this.settings.googleTextGenModel,
					systemInstruction: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away.",
				},
				{
					baseUrl: this.settings.googleBaseURL,
				}
			);
			const response = await model.generateContent(hintPrompt);

			return response.response.text();
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const model = this.google.getGenerativeModel(
				{
					model: this.settings.googleTextGenModel,
					systemInstruction: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes.",
				},
				{
					baseUrl: this.settings.googleBaseURL,
				}
			);
			const response = await model.generateContent(titleGenerationPrompt);

			const title = response.response.text()?.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}
}
