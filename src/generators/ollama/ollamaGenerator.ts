import { Ollama } from "ollama/dist/browser.mjs";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";
import { handleGenerationError, handleEmbeddingError } from "../../utils/errorHandler";

export default class OllamaGenerator extends Generator {
	private readonly ollama: Ollama;

	constructor(settings: QuizSettings) {
		super(settings);
		this.ollama = new Ollama({ host: this.settings.ollamaBaseURL });
	}

	public async generateQuiz(contents: string[]): Promise<string> {
		try {
			const response = await this.ollama.generate({
				model: this.settings.ollamaTextGenModel,
				system: this.systemPrompt(),
				prompt: this.userPrompt(contents),
				format: "json",
				stream: false,
			});

			return response.response;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.ollama.embed({
				model: this.settings.ollamaEmbeddingModel,
				input: [userAnswer, answer],
			});

			return cosineSimilarity(embedding.embeddings[0], embedding.embeddings[1]);
		} catch (error) {
			return handleEmbeddingError(error);
		}
	}

	public async generateHint(question: string, answer: string | boolean | number | number[] | string[] | Array<{leftOption: string; rightOption: string}>, sourceContent?: string): Promise<string | null> {
		try {
			const answerText = this.formatAnswerForHint(answer);
			const hintPrompt = this.createHintPrompt(question, answerText, sourceContent);

			const response = await this.ollama.generate({
				model: this.settings.ollamaTextGenModel,
				system: "You are a helpful educational assistant that provides hints to guide students toward correct answers without giving them away.",
				prompt: hintPrompt,
				stream: false,
			});

			return response.response;
		} catch (error) {
			return handleGenerationError(error);
		}
	}

	public async generateQuizTitle(contents: string[], titlePrompt?: string | null): Promise<string | null> {
		try {
			const titleGenerationPrompt = this.createTitlePrompt(contents, titlePrompt);

			const response = await this.ollama.generate({
				model: this.settings.ollamaTextGenModel,
				system: "You are a helpful assistant that generates concise, descriptive titles for educational quizzes.",
				prompt: titleGenerationPrompt,
				stream: false,
			});

			const title = response.response?.trim();
			return title ? title.replace(/^["']|["']$/g, "") : null;
		} catch (error) {
			console.error("Error generating quiz title:", error);
			return null;
		}
	}
}
