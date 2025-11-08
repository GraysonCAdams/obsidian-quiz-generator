import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import OllamaClient from "../clients/ollamaClient";

export default class OllamaGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(settings, new OllamaClient(settings), { providerName: "Ollama" });
	}
}
