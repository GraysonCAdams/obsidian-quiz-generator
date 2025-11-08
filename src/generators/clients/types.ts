export enum ChatResponseFormat {
	JSON = "json",
	TEXT = "text",
}

export interface LLMChatRequest {
	systemPrompt?: string;
	userPrompt: string;
	format: ChatResponseFormat;
	maxTokens?: number;
	temperature?: number;
}

export interface LLMResponse {
	content: string | null;
	finishReason?: string | null;
}

export interface LLMClient {
	readonly supportsSimilarity: boolean;
	generate(request: LLMChatRequest): Promise<LLMResponse>;
	calculateSimilarity(userAnswer: string, answer: string): Promise<number>;
}

