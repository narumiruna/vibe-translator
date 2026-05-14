const test = require("node:test");
const assert = require("node:assert/strict");

const {
	buildMockTranslations,
	extractJsonObject,
} = require("../e2e/lib/mock-api-server.js");

test("mock API extracts source payload JSON from prompt text", () => {
	assert.deepEqual(
		extractJsonObject(
			'Intro text {"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
		),
		{ targetLanguage: "台灣正體中文", id: "a", text: "Hello" },
	);
});

test("mock API prefers the last source payload JSON in prompt text", () => {
	assert.deepEqual(
		extractJsonObject(
			[
				'Ignore schema {"items":[],"description":"example"}',
				'Use payload {"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
			].join("\n"),
		),
		{ targetLanguage: "台灣正體中文", id: "a", text: "Hello" },
	);
});

test("mock API builds translations for single and batch payloads", () => {
	assert.deepEqual(
		buildMockTranslations({
			input: [
				{
					role: "user",
					content: [
						"Prompt prefix",
						JSON.stringify({
							targetLanguage: "台灣正體中文",
							items: [
								{ id: "a", text: "Alpha" },
								{ id: "b", text: "Beta" },
							],
						}),
					].join("\n"),
				},
			],
		}),
		[
			{ id: "a", translatedText: "[mock:Alpha]" },
			{ id: "b", translatedText: "[mock:Beta]" },
		],
	);
});
