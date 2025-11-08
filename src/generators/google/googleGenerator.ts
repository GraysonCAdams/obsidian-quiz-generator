import { QuizSettings } from "../../settings/config";
import LLMGenerator from "../llmGenerator";
import GoogleClient from "../clients/googleClient";

export default class GoogleGenerator extends LLMGenerator {
	constructor(settings: QuizSettings) {
		super(settings, new GoogleClient(settings), { providerName: "Google" });
	}
}
