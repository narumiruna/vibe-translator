import { Agent } from "@earendil-works/pi-agent-core";
import {
	contentText,
	createModels,
	createProvider,
} from "@earendil-works/pi-ai";
import * as OpenAIResponsesApi from "@earendil-works/pi-ai/api/openai-responses";
import { validateProtectedFragments } from "./protected-fragments.js";
import {
	applyTranslationResponseFormat,
	buildTranslationInput,
	InvalidTranslationResponseError,
	parseTranslationText,
	validateTranslationCoverage,
} from "./responses.js";

const TRANSLATION_PROVIDER_ID = "openai-compatible";
const ZERO_COST = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
});

function createTranslationModel(settings) {
	return {
		id: settings.model,
		name: settings.model,
		api: "openai-responses",
		provider: TRANSLATION_PROVIDER_ID,
		baseUrl: settings.baseUrl,
		reasoning: false,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 16_384,
		compat: {
			supportsDeveloperRole: false,
			supportsLongCacheRetention: false,
			sessionAffinityFormat: "openai-nosession",
		},
	};
}

function createTranslationModels(model) {
	const models = createModels();
	models.setProvider(
		createProvider({
			id: TRANSLATION_PROVIDER_ID,
			name: "OpenAI-compatible API",
			baseUrl: model.baseUrl,
			auth: {
				apiKey: {
					name: "API key",
					resolve: async () => ({ auth: {} }),
				},
			},
			models: [model],
			api: OpenAIResponsesApi,
		}),
	);
	return models;
}

function createTranslationStreamFunction(model, fetchImpl) {
	const models = createTranslationModels(model);

	return (requestModel, context, options) =>
		models.streamSimple(requestModel, context, {
			...options,
			cacheRetention: "none",
			fetch: fetchImpl,
			maxRetries: 0,
			onPayload: applyTranslationResponseFormat,
		});
}

function getFinalAssistantMessage(agent) {
	return agent.state.messages.findLast(
		(message) => message.role === "assistant",
	);
}

async function callTranslationAgent(settings, items, options = {}) {
	const [systemMessage, userMessage] = buildTranslationInput({
		systemPromptTemplate: settings.systemPromptTemplate,
		userPromptTemplate: settings.userPromptTemplate,
		items,
		targetLanguage: settings.targetLanguage,
	});
	const model = createTranslationModel(settings);
	const streamFn =
		options.streamFn ||
		createTranslationStreamFunction(model, options.fetchImpl);
	const agent = new Agent({
		initialState: {
			model,
			systemPrompt: systemMessage.content,
			thinkingLevel: "off",
			tools: [],
		},
		getApiKey: () => settings.apiKey,
		streamFn,
		transport: "sse",
	});

	await agent.prompt(userMessage.content);

	const response = getFinalAssistantMessage(agent);
	if (!response) {
		throw new Error("Translation agent did not return a response.");
	}
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(
			response.errorMessage || "Translation request did not complete.",
		);
	}

	try {
		const translations = parseTranslationText(contentText(response.content));

		validateTranslationCoverage(items, translations);
		validateProtectedFragments(items, translations);

		return translations;
	} catch (error) {
		throw new InvalidTranslationResponseError(error);
	}
}

export { callTranslationAgent };
