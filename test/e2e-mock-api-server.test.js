import test from "node:test";
import assert from "node:assert/strict";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
	buildMockTranslations,
	createMockApiServer,
	extractJsonObject,
	stringifyMessageContent,
} = require("../e2e/lib/mock-api-server.cjs");

test("mock API extracts source payload JSON from prompt text", () => {
	assert.deepEqual(
		extractJsonObject(
			'Intro text {"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
		),
		{ targetLanguage: "台灣正體中文", id: "a", text: "Hello" },
	);
});

test("mock API prefers the last target-language payload JSON in prompt text", () => {
	assert.deepEqual(
		extractJsonObject(
			[
				'Ignore payload {"targetLanguage":"台灣正體中文","id":"old","text":"Old"}',
				'Use payload {"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
			].join("\n"),
		),
		{ targetLanguage: "台灣正體中文", id: "a", text: "Hello" },
	);
});

test("mock API falls back to the last item payload when target language is absent", () => {
	assert.deepEqual(
		extractJsonObject(
			[
				'Ignore schema {"items":[],"description":"example"}',
				'Use payload {"items":[{"id":"a","text":"Hello"}]}',
			].join("\n"),
		),
		{ items: [{ id: "a", text: "Hello" }] },
	);
});

test("mock API stringifies Responses-style message content arrays", () => {
	assert.equal(
		stringifyMessageContent([
			{ type: "input_text", text: "Prompt" },
			'{"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
			{ type: "image_url", url: "https://example.invalid/image.png" },
		]),
		'Prompt\n{"targetLanguage":"台灣正體中文","id":"a","text":"Hello"}',
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

test("mock API preserves protected placeholders beyond its text preview", () => {
	const [translation] = buildMockTranslations({
		input: [
			{
				role: "user",
				content: JSON.stringify({
					targetLanguage: "台灣正體中文",
					id: "a",
					text: `${"Long source text ".repeat(5)}__OT_TOKEN_7__`,
				}),
			},
		],
	});

	assert.match(translation.translatedText, /__OT_TOKEN_7__/);
});

test("mock API server exposes models and responses endpoints", async () => {
	const server = await createMockApiServer();

	try {
		const modelsResponse = await fetch(`${server.baseUrl}/models`);
		assert.equal(modelsResponse.status, 200);
		assert.deepEqual(await modelsResponse.json(), {
			data: [{ id: "mock-model" }],
		});

		const responsesResponse = await fetch(`${server.baseUrl}/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: [
					{
						role: "user",
						content:
							'{"targetLanguage":"台灣正體中文","id":"a","text":"Alpha"}',
					},
				],
			}),
		});
		assert.equal(responsesResponse.status, 200);
		assert.deepEqual(await responsesResponse.json(), {
			output_parsed: {
				translations: [{ id: "a", translatedText: "[mock:Alpha]" }],
			},
			output_text: JSON.stringify({
				translations: [{ id: "a", translatedText: "[mock:Alpha]" }],
			}),
		});
	} finally {
		await server.close();
	}
});

test("mock API server can fail matching response requests", async () => {
	const server = await createMockApiServer({ failOnTextIncludes: "Fail me" });

	try {
		const response = await fetch(`${server.baseUrl}/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: [
					{
						role: "user",
						content:
							'{"targetLanguage":"台灣正體中文","id":"a","text":"Fail me"}',
					},
				],
			}),
		});

		assert.equal(response.status, 500);
		assert.match((await response.json()).error.message, /Mock translation/);

		server.setFailOnTextIncludes("");
		const recovered = await fetch(`${server.baseUrl}/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				input: [
					{
						role: "user",
						content:
							'{"targetLanguage":"台灣正體中文","id":"a","text":"Fail me"}',
					},
				],
			}),
		});

		assert.equal(recovered.status, 200);
	} finally {
		await server.close();
	}
});
