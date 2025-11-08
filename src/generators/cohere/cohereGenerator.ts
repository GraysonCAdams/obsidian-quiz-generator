import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import CohereClient from "../clients/cohereClient";

export default class CohereGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(settings, new CohereClient(settings), { providerName: "Cohere" });
	}
}
