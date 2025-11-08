import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import MistralClient from "../clients/mistralClient";

export default class MistralGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(settings, new MistralClient(settings), { providerName: "Mistral" });
	}
}
