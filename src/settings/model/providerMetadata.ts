import { Provider } from "../../generators/providers";
import { openAIEmbeddingModels, openAITextGenModels } from "../../generators/openai/openAIModels";
import { googleTextGenModels, googleEmbeddingModels } from "../../generators/google/googleModels";
import { anthropicTextGenModels } from "../../generators/anthropic/anthropicModels";
import { perplexityTextGenModels } from "../../generators/perplexity/perplexityModels";
import { mistralTextGenModels, mistralEmbeddingModels } from "../../generators/mistral/mistralModels";
import { cohereTextGenModels, cohereEmbeddingModels } from "../../generators/cohere/cohereModels";
import { DEFAULT_OPENAI_SETTINGS } from "./openai/openAIConfig";
import { DEFAULT_GOOGLE_SETTINGS } from "./google/googleConfig";
import { DEFAULT_ANTHROPIC_SETTINGS } from "./anthropic/anthropicConfig";
import { DEFAULT_PERPLEXITY_SETTINGS } from "./perplexity/perplexityConfig";
import { DEFAULT_MISTRAL_SETTINGS } from "./mistral/mistralConfig";
import { DEFAULT_COHERE_SETTINGS } from "./cohere/cohereConfig";
import { ProviderSettingsConfig } from "./providerSettingsFactory";

export const providerSettingsMetadata: Partial<Record<Provider, ProviderSettingsConfig>> = {
	[Provider.OPENAI]: {
		providerName: "OpenAI",
		apiKeyField: "openAIApiKey",
		apiKeyDescription: "Enter your OpenAI API key here.",
		baseURLField: "openAIBaseURL",
		baseURLDescription: "Enter your OpenAI API base URL here.",
		defaultBaseURL: DEFAULT_OPENAI_SETTINGS.openAIBaseURL,
		textGenModelField: "openAITextGenModel",
		textGenModels: openAITextGenModels,
		embeddingModelField: "openAIEmbeddingModel",
		embeddingModels: openAIEmbeddingModels,
		hasEmbedding: true,
	},
	[Provider.GOOGLE]: {
		providerName: "Google",
		apiKeyField: "googleApiKey",
		apiKeyDescription: "Enter your Google AI Studio API key here.",
		baseURLField: "googleBaseURL",
		baseURLDescription: "Enter your Google AI Studio API base URL here.",
		defaultBaseURL: DEFAULT_GOOGLE_SETTINGS.googleBaseURL,
		textGenModelField: "googleTextGenModel",
		textGenModels: googleTextGenModels,
		embeddingModelField: "googleEmbeddingModel",
		embeddingModels: googleEmbeddingModels,
		hasEmbedding: true,
	},
	[Provider.ANTHROPIC]: {
		providerName: "Anthropic",
		apiKeyField: "anthropicApiKey",
		apiKeyDescription: "Enter your Anthropic API key here.",
		baseURLField: "anthropicBaseURL",
		baseURLDescription: "Enter your Anthropic API base URL here.",
		defaultBaseURL: DEFAULT_ANTHROPIC_SETTINGS.anthropicBaseURL,
		textGenModelField: "anthropicTextGenModel",
		textGenModels: anthropicTextGenModels,
		hasEmbedding: false,
	},
	[Provider.PERPLEXITY]: {
		providerName: "Perplexity",
		apiKeyField: "perplexityApiKey",
		apiKeyDescription: "Enter your Perplexity API key here.",
		baseURLField: "perplexityBaseURL",
		baseURLDescription: "Enter your Perplexity API base URL here.",
		defaultBaseURL: DEFAULT_PERPLEXITY_SETTINGS.perplexityBaseURL,
		textGenModelField: "perplexityTextGenModel",
		textGenModels: perplexityTextGenModels,
		hasEmbedding: false,
	},
	[Provider.MISTRAL]: {
		providerName: "Mistral",
		apiKeyField: "mistralApiKey",
		apiKeyDescription: "Enter your Mistral API key here.",
		baseURLField: "mistralBaseURL",
		baseURLDescription: "Enter your Mistral API base URL here.",
		defaultBaseURL: DEFAULT_MISTRAL_SETTINGS.mistralBaseURL,
		textGenModelField: "mistralTextGenModel",
		textGenModels: mistralTextGenModels,
		embeddingModelField: "mistralEmbeddingModel",
		embeddingModels: mistralEmbeddingModels,
		hasEmbedding: true,
	},
	[Provider.COHERE]: {
		providerName: "Cohere",
		apiKeyField: "cohereApiKey",
		apiKeyDescription: "Enter your Cohere API key here.",
		baseURLField: "cohereBaseURL",
		baseURLDescription: "Enter your Cohere API base URL here.",
		defaultBaseURL: DEFAULT_COHERE_SETTINGS.cohereBaseURL,
		textGenModelField: "cohereTextGenModel",
		textGenModels: cohereTextGenModels,
		embeddingModelField: "cohereEmbeddingModel",
		embeddingModels: cohereEmbeddingModels,
		hasEmbedding: true,
	},
};

