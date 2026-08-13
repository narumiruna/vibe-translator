import test from "node:test";
import assert from "node:assert/strict";

import { createTranslationCache } from "../src/translation/cache.js";

function buildSettings(overrides = {}) {
	return {
		baseUrl: "https://example.com/v1",
		model: "demo",
		systemPromptTemplate: "system",
		userPromptTemplate: "user {{sourcePayload}}",
		targetLanguage: "台灣正體中文",
		...overrides,
	};
}

test("translation cache splits cached and missing items", () => {
	const cache = createTranslationCache();
	const settings = buildSettings();
	const items = [
		{ id: "a", kind: "paragraph", text: "Alpha" },
		{ id: "b", kind: "paragraph", text: "Beta" },
	];

	cache.set(settings, items[0], "阿爾法");

	assert.deepEqual(cache.splitItemsByCache(settings, items), {
		cachedTranslations: [{ id: "a", translation: "阿爾法" }],
		missingItems: [items[1]],
	});
});

test("translation cache evicts least recently used entries", () => {
	const cache = createTranslationCache({ limit: 2 });
	const settings = buildSettings();
	const alpha = { id: "a", text: "Alpha" };
	const beta = { id: "b", text: "Beta" };
	const gamma = { id: "c", text: "Gamma" };

	cache.set(settings, alpha, "A");
	cache.set(settings, beta, "B");
	assert.equal(cache.get(settings, alpha), "A");
	cache.set(settings, gamma, "C");

	assert.equal(cache.get(settings, beta), null);
	assert.equal(cache.get(settings, alpha), "A");
	assert.equal(cache.get(settings, gamma), "C");
});
