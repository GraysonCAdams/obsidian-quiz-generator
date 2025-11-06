/**
 * Base interface for provider configuration
 * All provider configs should extend this interface
 */
export interface BaseProviderConfig {
	apiKey: string;
	baseURL: string;
	textGenModel: string;
}

/**
 * Base interface for provider configuration with embedding support
 */
export interface BaseProviderConfigWithEmbedding extends BaseProviderConfig {
	embeddingModel: string;
}

/**
 * Helper type to create provider-specific config interfaces
 */
export type ProviderConfig<T extends BaseProviderConfig> = T;

