import assert from "node:assert/strict";
import test from "node:test";

import {
	applyTranslationResponseFormat,
	buildTranslationInput,
	parseTranslationText,
	TRANSLATION_RESPONSE_FORMAT,
} from "../src/translation/responses.js";

function buildSettings(overrides = {}) {
	return {
		apiKey: "x",
		baseUrl: "https://example.com/v1",
		model: "demo",
		systemPromptTemplate: "System template for {{targetLanguage}}.",
		userPromptTemplate: "User template. {{sourcePayload}}",
		targetLanguage: "台灣正體中文",
		...overrides,
	};
}

test("responses adapter builds prompt input from templates", () => {
	const input = buildTranslationInput({
		...buildSettings(),
		items: [{ id: "a", kind: "paragraph", text: "Hello" }],
	});

	assert.equal(input[0].role, "system");
	assert.match(input[0].content, /台灣正體中文/);
	assert.equal(input[1].role, "user");
	assert.match(input[1].content, /"id":"a"/);
});

test("responses adapter adds the translation schema to pi-ai payloads", () => {
	const request = applyTranslationResponseFormat({
		model: "demo",
		stream: true,
	});

	assert.equal(request.model, "demo");
	assert.equal(request.stream, true);
	assert.equal(request.text.format, TRANSLATION_RESPONSE_FORMAT);
	assert.equal(request.text.format.type, "json_schema");
});

test("responses adapter parses fenced translation JSON", () => {
	assert.deepEqual(
		parseTranslationText(
			'```json\n{"translations":[{"id":"a","translatedText":"你好"}]}\n```',
		),
		[{ id: "a", translation: "你好" }],
	);
});
