import { showWarning } from "./notifications";

/**
 * Truncation reasons that indicate token limit was reached
 */
export type TruncationReason = "length" | "max_tokens" | "model_length" | "stop_sequence";

/**
 * Handles truncation notices for quiz generation
 * Shows a warning if the generation was truncated due to token limits
 * @param reason - The finish reason from the API response
 */
export const handleTruncationNotice = (reason: string | null | undefined): void => {
	const truncationReasons: TruncationReason[] = ["length", "max_tokens", "model_length"];
	
	if (reason && truncationReasons.includes(reason as TruncationReason)) {
		showWarning("Generation truncated: Token limit reached");
	}
};

/**
 * Extracts error message from an error object
 * @param error - The error to extract message from
 * @returns The error message as a string
 */
export const extractErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "An unknown error occurred";
};

/**
 * Handles errors during quiz generation
 * Extracts error message and throws a new Error with it
 * @param error - The error that occurred
 * @throws Error with the extracted error message
 */
export const handleGenerationError = (error: unknown): never => {
	const message = extractErrorMessage(error);
	throw new Error(message);
};

/**
 * Handles errors during embedding generation
 * Extracts error message and throws a new Error with it
 * @param error - The error that occurred
 * @throws Error with embedding-specific error message
 */
export const handleEmbeddingError = (error: unknown): never => {
	const message = extractErrorMessage(error);
	throw new Error(`Embedding generation failed: ${message}`);
};

