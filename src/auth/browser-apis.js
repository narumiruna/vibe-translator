import * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
import * as azureOpenAIResponses from "@earendil-works/pi-ai/api/azure-openai-responses";
import * as googleGenerativeAI from "@earendil-works/pi-ai/api/google-generative-ai";
import * as googleVertex from "@earendil-works/pi-ai/api/google-vertex";
import * as mistralConversations from "@earendil-works/pi-ai/api/mistral-conversations";
import * as openAICodexResponses from "@earendil-works/pi-ai/api/openai-codex-responses";
import * as openAICompletions from "@earendil-works/pi-ai/api/openai-completions";
import * as openAIResponses from "@earendil-works/pi-ai/api/openai-responses";
import * as piMessages from "@earendil-works/pi-ai/api/pi-messages";
import { resolveCloudflareModel } from "@earendil-works/pi-ai/providers/cloudflare-stream";

const BROWSER_APIS = Object.freeze({
	"anthropic-messages": anthropicMessages,
	"azure-openai-responses": azureOpenAIResponses,
	"google-generative-ai": googleGenerativeAI,
	"google-vertex": googleVertex,
	"mistral-conversations": mistralConversations,
	"openai-codex-responses": openAICodexResponses,
	"openai-completions": openAICompletions,
	"openai-responses": openAIResponses,
	"pi-messages": piMessages,
});

function browserApiFor(modelOrApi) {
	const apiId =
		typeof modelOrApi === "string" ? modelOrApi : String(modelOrApi?.api || "");
	const api = BROWSER_APIS[apiId];
	if (!api) {
		throw new Error(`No browser API implementation is available for ${apiId}.`);
	}
	return api;
}

function resolveBrowserModel(provider, model, options) {
	return provider.id.startsWith("cloudflare-")
		? resolveCloudflareModel(model, options?.env)
		: model;
}

function withBrowserApi(provider) {
	return {
		...provider,
		stream(model, context, options) {
			return browserApiFor(model).stream(
				resolveBrowserModel(provider, model, options),
				context,
				options,
			);
		},
		streamSimple(model, context, options) {
			return browserApiFor(model).streamSimple(
				resolveBrowserModel(provider, model, options),
				context,
				options,
			);
		},
	};
}

export { BROWSER_APIS, browserApiFor, withBrowserApi };
