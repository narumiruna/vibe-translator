import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";

import { browserApiFor, withBrowserApi } from "./browser-apis.js";
import {
	browserBuiltinProviders,
	openaiCodexProvider,
} from "./browser-provider-catalog.js";
import { createBrowserCodexOAuth, OPENAI_PROVIDER_ID } from "./codex-oauth.js";

const CUSTOM_PROVIDER_ID = "openai-compatible";
const RADIUS_CONFIG_URL = "https://radius.pi.dev/v1/config";
const BROWSER_EXCLUDED_PROVIDERS = Object.freeze(["amazon-bedrock"]);

function requiredPromptValue(value, prompt) {
	const normalized = String(value || "").trim();
	if (!normalized) {
		throw new Error(`${prompt.message} is required.`);
	}
	return normalized;
}

function browserAzureProvider(provider) {
	const apiKey = provider.auth.apiKey;
	if (!apiKey) {
		return provider;
	}

	return {
		...provider,
		auth: {
			apiKey: {
				...apiKey,
				async login(interaction) {
					const keyPrompt = {
						type: "secret",
						message: "Enter Azure OpenAI API key",
					};
					const urlPrompt = {
						type: "text",
						message: "Enter Azure OpenAI base URL",
						placeholder: "https://RESOURCE.openai.azure.com",
					};
					const key = requiredPromptValue(
						await interaction.prompt(keyPrompt),
						keyPrompt,
					);
					const baseUrl = requiredPromptValue(
						await interaction.prompt(urlPrompt),
						urlPrompt,
					);
					const apiVersion = String(
						await interaction.prompt({
							type: "text",
							message: "Enter Azure API version (leave blank for v1)",
							placeholder: "v1",
						}),
					).trim();
					const deploymentMap = String(
						await interaction.prompt({
							type: "text",
							message:
								"Optional model-to-deployment map (model=deployment, comma-separated)",
						}),
					).trim();

					return {
						type: "api_key",
						key,
						env: {
							AZURE_OPENAI_BASE_URL: baseUrl,
							...(apiVersion ? { AZURE_OPENAI_API_VERSION: apiVersion } : {}),
							...(deploymentMap
								? { AZURE_OPENAI_DEPLOYMENT_NAME_MAP: deploymentMap }
								: {}),
						},
					};
				},
			},
		},
	};
}

function browserVertexProvider(provider) {
	const apiKey = provider.auth.apiKey;
	if (!apiKey) {
		return provider;
	}

	return {
		...provider,
		auth: {
			apiKey: {
				...apiKey,
				async login(interaction) {
					const prompt = {
						type: "secret",
						message: "Enter Google Cloud API key",
					};
					return {
						type: "api_key",
						key: requiredPromptValue(await interaction.prompt(prompt), prompt),
					};
				},
			},
		},
	};
}

function createBrowserCodexProvider() {
	const provider = openaiCodexProvider();
	return {
		...provider,
		auth: { oauth: createBrowserCodexOAuth() },
	};
}

function browserProvider(provider) {
	if (provider.id === OPENAI_PROVIDER_ID) {
		return createBrowserCodexProvider();
	}

	const withoutNodeOAuth = {
		...provider,
		auth: provider.auth.apiKey ? { apiKey: provider.auth.apiKey } : {},
	};

	if (provider.id === "azure-openai-responses") {
		return browserAzureProvider(withoutNodeOAuth);
	}
	if (provider.id === "google-vertex") {
		return browserVertexProvider(withoutNodeOAuth);
	}
	return withoutNodeOAuth;
}

function createBrowserProviders() {
	return browserBuiltinProviders().map((provider) =>
		withBrowserApi(browserProvider(provider)),
	);
}

function createCustomProvider(options = {}) {
	const baseUrl = String(options.baseUrl || "https://api.openai.com/v1")
		.trim()
		.replace(/\/+$/, "");
	const modelId =
		String(options.model || "custom-model").trim() || "custom-model";
	const model = {
		id: modelId,
		name: modelId,
		api: "openai-responses",
		provider: CUSTOM_PROVIDER_ID,
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 128000,
		maxTokens: 16384,
		compat: { supportsStrictMode: true },
	};

	return createProvider({
		id: CUSTOM_PROVIDER_ID,
		name: "Custom OpenAI-compatible",
		baseUrl,
		auth: {
			apiKey: envApiKeyAuth("API key", []),
		},
		models: [model],
		api: browserApiFor("openai-responses"),
	});
}

function replaceEndpointVariables(value, env = {}) {
	return String(value || "").replace(/\{([A-Z0-9_]+)\}/g, (_match, key) => {
		const replacement = String(env[key] || "").trim();
		if (!replacement) {
			throw new Error(`Provider configuration is missing ${key}.`);
		}
		return encodeURIComponent(replacement);
	});
}

function modelEndpointUrls(provider, model, credential) {
	if (provider.id === "azure-openai-responses") {
		const configured =
			credential?.type === "api_key"
				? credential.env?.AZURE_OPENAI_BASE_URL
				: undefined;
		return configured ? [configured] : [];
	}

	if (provider.id === "google-vertex") {
		return ["https://aiplatform.googleapis.com"];
	}

	if (provider.id === "radius") {
		return [RADIUS_CONFIG_URL, ...(model.baseUrl ? [model.baseUrl] : [])];
	}

	const endpoint = model.baseUrl || provider.baseUrl;
	if (!endpoint) {
		return [];
	}

	const env = credential?.type === "api_key" ? credential.env : undefined;
	return [replaceEndpointVariables(endpoint, env)];
}

export {
	BROWSER_EXCLUDED_PROVIDERS,
	CUSTOM_PROVIDER_ID,
	createBrowserCodexProvider,
	createBrowserProviders,
	createCustomProvider,
	modelEndpointUrls,
	RADIUS_CONFIG_URL,
	replaceEndpointVariables,
};
