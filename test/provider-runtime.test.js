import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { test } from "vitest";

import { BROWSER_APIS } from "../src/auth/browser-apis.js";
import { getBrowserOAuthProviderIds } from "../src/auth/browser-oauth.js";
import { CREDENTIALS_KEY } from "../src/auth/credential-store.js";
import { LEGACY_MIGRATION_KEY, ProviderRuntime } from "../src/auth/runtime.js";
import * as Settings from "../src/shared/settings.js";
import {
	clearTranslationCache,
	createTranslationApi,
} from "../src/translation/api.js";

const require = createRequire(import.meta.url);
const { createMockApiServer } = require("../e2e/lib/mock-api-server.cjs");

class MemoryStorage {
	values = {};
	accessLevel = "";

	async get(key) {
		if (typeof key === "string") {
			return { [key]: this.values[key] };
		}
		return { ...this.values };
	}

	async set(items) {
		Object.assign(this.values, structuredClone(items));
	}

	async remove(key) {
		for (const item of Array.isArray(key) ? key : [key]) {
			delete this.values[item];
		}
	}

	async setAccessLevel({ accessLevel }) {
		this.accessLevel = accessLevel;
	}
}

function createChrome() {
	return {
		storage: {
			local: new MemoryStorage(),
			sync: new MemoryStorage(),
		},
	};
}

test("provider runtime exposes every browser-compatible pi-ai catalog", async () => {
	const runtime = new ProviderRuntime({ chrome: createChrome() });
	const providers = await runtime.getCatalog(Settings.DEFAULT_SETTINGS);
	const providerIds = providers.map((provider) => provider.id);

	const expectedProviderIds = builtinProviders()
		.map((provider) => provider.id)
		.filter((providerId) => providerId !== "amazon-bedrock");
	assert.deepEqual(
		providerIds
			.filter((providerId) => providerId !== "openai-compatible")
			.sort(),
		expectedProviderIds.sort(),
	);
	assert.ok(providerIds.includes("openai"));
	assert.ok(providerIds.includes("openai-codex"));
	assert.ok(providerIds.includes("openrouter"));
	assert.ok(providerIds.includes("openai-compatible"));
	assert.equal(providerIds.includes("amazon-bedrock"), false);
	assert.ok(
		providers.find((provider) => provider.id === "openrouter").models.length >
			300,
	);
	assert.deepEqual(
		providers
			.find((provider) => provider.id === "openai-codex")
			.authMethods.map((method) => method.type),
		["oauth"],
	);
	assert.deepEqual(
		providers
			.find((provider) => provider.id === "anthropic")
			.authMethods.map((method) => method.type),
		["api_key", "oauth"],
	);
	for (const providerId of getBrowserOAuthProviderIds()) {
		const provider = providers.find((item) => item.id === providerId);
		assert.ok(provider, `Missing browser OAuth provider ${providerId}`);
		assert.ok(
			provider.authMethods.some((method) => method.type === "oauth"),
			`Missing OAuth method for ${providerId}`,
		);
		assert.ok(
			provider.authMethods
				.find((method) => method.type === "oauth")
				.setupOrigins.every((origin) => origin.endsWith("/*")),
			`Invalid OAuth setup origin for ${providerId}`,
		);
	}
	assert.deepEqual(
		providers
			.find((provider) => provider.id === "radius")
			.authMethods.find((method) => method.type === "api_key").setupOrigins,
		["https://radius.pi.dev/*"],
	);
	for (const apiId of new Set(
		providers.flatMap((provider) => provider.models.map((model) => model.api)),
	)) {
		assert.ok(BROWSER_APIS[apiId], `Missing browser API adapter for ${apiId}`);
	}
});

test("provider runtime invalidates only the expected credential type", async () => {
	const runtime = new ProviderRuntime({ chrome: createChrome() });
	const providerId = "anthropic";
	const apiKey = { type: "api_key", key: "api-key" };

	await runtime.credentials.modify(providerId, async () => apiKey);
	await runtime.invalidateCredential(providerId, "oauth");
	assert.deepEqual(await runtime.credentials.read(providerId), apiKey);

	await runtime.credentials.modify(providerId, async () => ({
		type: "oauth",
		access: "access-token",
		expires: Date.now() + 60_000,
		refresh: "refresh-token",
	}));
	await runtime.invalidateCredential(providerId, "oauth");
	assert.equal(await runtime.credentials.read(providerId), undefined);
});

test("provider runtime migrates legacy secrets into trusted local credentials", async () => {
	const chrome = createChrome();
	chrome.storage.sync.values[Settings.STORAGE_KEY] = {
		apiKey: " legacy-secret ",
		baseUrl: "https://custom.example/v1/",
		model: "legacy-model",
		targetLanguage: "日本語",
	};
	const runtime = new ProviderRuntime({ chrome, settingsApi: Settings });

	await runtime.initialize();

	assert.equal(chrome.storage.local.accessLevel, "TRUSTED_CONTEXTS");
	assert.equal(chrome.storage.local.values[LEGACY_MIGRATION_KEY], true);
	assert.deepEqual(
		chrome.storage.local.values[CREDENTIALS_KEY][Settings.CUSTOM_PROVIDER],
		{ type: "api_key", key: "legacy-secret" },
	);
	const migrated = chrome.storage.sync.values[Settings.STORAGE_KEY];
	assert.equal(migrated.provider, Settings.CUSTOM_PROVIDER);
	assert.equal(migrated.customBaseUrl, "https://custom.example/v1");
	assert.equal("apiKey" in migrated, false);
	assert.equal("baseUrl" in migrated, false);
});

test("provider runtime resolves configured endpoint origins without credential data", async () => {
	const runtime = new ProviderRuntime({ chrome: createChrome() });
	await runtime.credentials.modify("cloudflare-workers-ai", async () => ({
		type: "api_key",
		key: "cloudflare-secret",
		env: { CLOUDFLARE_ACCOUNT_ID: "account-id" },
	}));
	const model = runtime.models.getModels("cloudflare-workers-ai")[0];
	const origins = await runtime.getModelEndpointPatterns({
		provider: "cloudflare-workers-ai",
		model: model.id,
	});

	assert.deepEqual(origins, ["https://api.cloudflare.com/*"]);
	assert.doesNotMatch(JSON.stringify(origins), /secret|account-id/u);
});

test("model cache identity tracks credential-scoped endpoint configuration", async () => {
	const runtime = new ProviderRuntime({ chrome: createChrome() });
	const providerId = "azure-openai-responses";
	const model = runtime.models.getModels(providerId)[0];
	const settings = { provider: providerId, model: model.id };
	const saveCredential = (env) =>
		runtime.credentials.modify(providerId, async () => ({
			type: "api_key",
			key: "azure-secret",
			env,
		}));

	await saveCredential({
		AZURE_OPENAI_API_VERSION: "2025-04-01-preview",
		AZURE_OPENAI_BASE_URL: "https://first.openai.azure.com",
		AZURE_OPENAI_DEPLOYMENT_NAME_MAP: `${model.id}=first-deployment`,
	});
	const firstIdentity = await runtime.getModelCacheIdentity(settings);
	await saveCredential({
		AZURE_OPENAI_API_VERSION: "2025-04-01-preview",
		AZURE_OPENAI_BASE_URL: "https://first.openai.azure.com",
		AZURE_OPENAI_DEPLOYMENT_NAME_MAP: `${model.id}=second-deployment`,
	});
	const secondDeploymentIdentity =
		await runtime.getModelCacheIdentity(settings);
	await saveCredential({
		AZURE_OPENAI_API_VERSION: "2025-04-01-preview",
		AZURE_OPENAI_BASE_URL: "https://second.openai.azure.com",
		AZURE_OPENAI_DEPLOYMENT_NAME_MAP: `${model.id}=second-deployment`,
	});
	const secondEndpointIdentity = await runtime.getModelCacheIdentity(settings);

	assert.match(firstIdentity, /^[a-f0-9]{64}$/u);
	assert.notEqual(firstIdentity, secondDeploymentIdentity);
	assert.notEqual(secondDeploymentIdentity, secondEndpointIdentity);
	assert.doesNotMatch(
		[firstIdentity, secondDeploymentIdentity, secondEndpointIdentity].join(""),
		/azure-secret|openai\.azure/u,
	);
});

test("provider translation cache follows the runtime model identity", async () => {
	clearTranslationCache();
	let calls = 0;
	let modelCacheIdentity = "backend-one";
	const seenIdentities = [];
	const api = createTranslationApi({
		async complete(settings) {
			calls += 1;
			seenIdentities.push(settings.modelCacheIdentity);
			return {
				text: JSON.stringify({
					translations: [{ id: "a", translation: `result-${calls}` }],
				}),
			};
		},
		async getModelCacheIdentity() {
			return modelCacheIdentity;
		},
	});
	const settings = Settings.DEFAULT_SETTINGS;
	const items = [{ id: "a", kind: "paragraph", text: "Alpha" }];

	const first = await api.requestTranslations({ settings, items });
	modelCacheIdentity = "backend-two";
	const second = await api.requestTranslations({ settings, items });

	assert.equal(calls, 2);
	assert.deepEqual(seenIdentities, ["backend-one", "backend-two"]);
	assert.deepEqual(first, [{ id: "a", translation: "result-1" }]);
	assert.deepEqual(second, [{ id: "a", translation: "result-2" }]);
});

test("production translation adapter sends custom provider requests through pi-ai", async () => {
	const server = await createMockApiServer();
	const runtime = new ProviderRuntime({ chrome: createChrome() });
	const api = createTranslationApi(runtime);
	const settings = Settings.validateSettings({
		...Settings.DEFAULT_SETTINGS,
		provider: Settings.CUSTOM_PROVIDER,
		customBaseUrl: server.baseUrl,
		model: "mock-model",
	}).settings;

	try {
		await runtime.credentials.modify(Settings.CUSTOM_PROVIDER, async () => ({
			type: "api_key",
			key: "mock-secret",
		}));
		const translations = await api.requestTranslations({
			settings,
			items: [{ id: "a", kind: "paragraph", text: "Alpha" }],
		});

		assert.deepEqual(translations, [{ id: "a", translation: "[mock:Alpha]" }]);
		assert.equal(server.getResponseRequestCount(), 1);
	} finally {
		await server.close();
	}
});
