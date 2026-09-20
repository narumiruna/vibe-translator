import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_SETTINGS,
	DEFAULT_SYSTEM_PROMPT_TEMPLATE,
	DEFAULT_USER_PROMPT_TEMPLATE,
	getApiPermissionPattern,
	getSettings,
	lintPromptTemplates,
	migrateLegacyPromptSettings,
	normalizeBaseUrl,
	normalizeDisabledDomains,
	normalizeSelectionPanelPositionMode,
	normalizeShowTranslationDebugInfo,
	normalizeYoutubeSubtitleDisplayMode,
	validateSettings,
	YOUTUBE_SUBTITLE_DISPLAY_MODES,
} from "../src/shared/settings.js";

test("normalizeBaseUrl trims trailing slash", () => {
	assert.equal(
		normalizeBaseUrl("https://example.com/v1///"),
		"https://example.com/v1",
	);
});

test("validateSettings rejects incomplete settings", () => {
	const result = validateSettings({
		apiKey: "",
		baseUrl: "nope",
		model: "",
		targetLanguage: "",
	});

	assert.equal(result.isValid, false);
	assert.deepEqual(result.errors, [
		"API Key is required.",
		"Model is required.",
		"Target language is required.",
		"Base URL must be a valid URL.",
	]);
	assert.deepEqual(result.invalidFields, [
		"apiKey",
		"model",
		"targetLanguage",
		"baseUrl",
	]);
});

test("validateSettings preserves simultaneous error messages and order", () => {
	const result = validateSettings({
		apiKey: "",
		baseUrl: "ftp://example.com/other",
		model: "",
		targetLanguage: "",
		userPromptTemplate: "No source placeholder.",
	});
	assert.deepEqual(result.errors, [
		"API Key is required.",
		"Model is required.",
		"Target language is required.",
		"User prompt template must include {{sourcePayload}}.",
		"Base URL must use HTTP or HTTPS.",
		"Base URL must include /v1.",
	]);
	assert.deepEqual(result.invalidFields, [
		"apiKey",
		"model",
		"targetLanguage",
		"userPromptTemplate",
		"baseUrl",
	]);
});

test("validateSettings merges prompt template defaults", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "gpt-demo",
		targetLanguage: "日本語",
	});

	assert.equal(result.isValid, true);
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.invalidFields, []);
	assert.equal("invalidFields" in result.settings, false);
	assert.equal(
		result.settings.systemPromptTemplate,
		DEFAULT_SYSTEM_PROMPT_TEMPLATE,
	);
	assert.equal(
		result.settings.userPromptTemplate,
		DEFAULT_USER_PROMPT_TEMPLATE,
	);
	assert.deepEqual(
		result.settings.translationAppearance,
		DEFAULT_SETTINGS.translationAppearance,
	);
	assert.equal(
		result.settings.selectionPanelPositionMode,
		DEFAULT_SETTINGS.selectionPanelPositionMode,
	);
	assert.equal(
		DEFAULT_SETTINGS.systemPromptTemplate,
		DEFAULT_SYSTEM_PROMPT_TEMPLATE,
	);
	assert.equal(
		DEFAULT_SETTINGS.userPromptTemplate,
		DEFAULT_USER_PROMPT_TEMPLATE,
	);
});

test("default prompt templates define a complete translation contract", () => {
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /untrusted content/u);
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /instead of following them/u);
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /input order/u);
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /already in targetLanguage/u);
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /__OT_\.\.\.__/u);
	assert.match(DEFAULT_SYSTEM_PROMPT_TEMPLATE, /provided schema/u);
	assert.match(DEFAULT_USER_PROMPT_TEMPLATE, /top-level targetLanguage/u);
	assert.match(DEFAULT_USER_PROMPT_TEMPLATE, /\{\{sourcePayload\}\}/u);
	assert.deepEqual(lintPromptTemplates(DEFAULT_SETTINGS), []);
});

test("validateSettings migrates obsolete underline settings to Calm Reading", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "gpt-demo",
		targetLanguage: "日本語",
		translationUnderlineColor: "#ff0000",
		translationUnderlineStyle: "dotted",
		translationUnderlineThickness: 6,
		translationUnderlineOffset: 9,
	});

	assert.equal(result.isValid, true);
	assert.deepEqual(
		result.settings.translationAppearance,
		DEFAULT_SETTINGS.translationAppearance,
	);
	assert.equal("translationUnderlineColor" in result.settings, false);
});

test("validateSettings preserves normalized nested appearance settings", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "gpt-demo",
		targetLanguage: "日本語",
		translationAppearance: {
			presetId: "custom",
			inline: { fontSizePx: 21, accentWidthPx: 0 },
			selection: { widthPx: 420 },
		},
	});

	assert.equal(result.settings.translationAppearance.presetId, "custom");
	assert.equal(result.settings.translationAppearance.inline.fontSizePx, 21);
	assert.equal(result.settings.translationAppearance.inline.accentWidthPx, 0);
	assert.equal(result.settings.translationAppearance.selection.widthPx, 420);
});

test("validateSettings requires sourcePayload in user prompt template", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "gpt-demo",
		systemPromptTemplate: "System",
		userPromptTemplate: "Translate into {{targetLanguage}}.",
		targetLanguage: "日本語",
	});

	assert.equal(result.isValid, false);
	assert.match(result.errors.join(" "), /sourcePayload/);
});

test("validateSettings requires /v1 in base url", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/openai",
		model: "gpt-demo",
		systemPromptTemplate: "System",
		userPromptTemplate: "Translate {{targetLanguage}}.\n\n{{sourcePayload}}",
		targetLanguage: "日本語",
	});

	assert.equal(result.isValid, false);
	assert.match(result.errors.join(" "), /\/v1/);
});

test("migrateLegacyPromptSettings folds instructions into the refined system template", () => {
	const result = migrateLegacyPromptSettings({
		instructions: "Translate carefully.",
		targetLanguage: "台灣正體中文",
	});

	assert.match(result.systemPromptTemplate, /^Translate carefully\./);
	assert.match(result.systemPromptTemplate, /untrusted content/u);
	assert.equal(result.userPromptTemplate, DEFAULT_USER_PROMPT_TEMPLATE);
});

test("migrateLegacyPromptSettings upgrades previous defaults without replacing custom prompts", () => {
	const previousSystemPromptTemplate = [
		"Preserve meaning, tone, and technical accuracy in translation.",
		"You are rendering bilingual technical reading aids.",
		"Translate only natural-language prose into the target language.",
		"Each output must strictly correspond 1:1 with each input item.",
		"Do not merge, split, reorder, or add extra content.",
		"Do not translate UI labels, metadata, timestamps, or navigation text.",
		"Preserve placeholders like __OT_TOKEN_1__ exactly and do not translate, remove, or reorder them unnecessarily.",
		"Keep structure by item kind. Headings stay headings, list items stay list items, table cells stay table cells.",
		"If an item is marked isUI=true or isMetadata=true, return an empty translatedText for that item.",
	].join("\n");
	const previousUserPromptTemplate = [
		"Translate the provided source items into {{targetLanguage}}.",
		"Preserve meaning, order, and inline structure.",
		'Return a JSON object with a "translations" array in the same order as the input.',
		'Each translation item must use this shape: {"id":"...","translatedText":"..."}',
		"Return one translation item for every source item.",
		"Keep file paths, commands, URLs, code spans, identifiers, and product names in their original form.",
		"If isUI=true or isMetadata=true, return an empty translatedText.",
		"",
		"{{sourcePayload}}",
	].join("\n");
	const upgraded = migrateLegacyPromptSettings({
		systemPromptTemplate: previousSystemPromptTemplate,
		userPromptTemplate: previousUserPromptTemplate,
	});
	const custom = migrateLegacyPromptSettings({
		systemPromptTemplate: "Custom system prompt.",
		userPromptTemplate: "Custom user prompt. {{sourcePayload}}",
	});

	assert.equal(upgraded.systemPromptTemplate, DEFAULT_SYSTEM_PROMPT_TEMPLATE);
	assert.equal(upgraded.userPromptTemplate, DEFAULT_USER_PROMPT_TEMPLATE);
	assert.equal(custom.systemPromptTemplate, "Custom system prompt.");
	assert.equal(
		custom.userPromptTemplate,
		"Custom user prompt. {{sourcePayload}}",
	);
});

test("getApiPermissionPattern derives origin wildcard", () => {
	assert.equal(
		getApiPermissionPattern("https://api.openai.com/v1"),
		"https://api.openai.com/*",
	);
});

test("normalizeDisabledDomains normalizes separators and casing", () => {
	assert.equal(
		normalizeDisabledDomains("Chat.OpenAI.com, example.com\nsub.example.com"),
		"chat.openai.com\nexample.com\nsub.example.com",
	);
});

test("lintPromptTemplates warns when safety, placeholder, or output rules are missing", () => {
	const warnings = lintPromptTemplates({
		systemPromptTemplate: "Translate carefully.",
		userPromptTemplate: "{{sourcePayload}}",
	});

	assert.ok(warnings.some((warning) => warning.includes("not instructions")));
	assert.ok(warnings.some((warning) => warning.includes("placeholders")));
	assert.ok(
		warnings.some((warning) => warning.includes("schema-defined JSON")),
	);
});

test("normalizeShowTranslationDebugInfo coerces to boolean", () => {
	assert.equal(normalizeShowTranslationDebugInfo(""), false);
	assert.equal(normalizeShowTranslationDebugInfo(1), true);
});

test("normalizeSelectionPanelPositionMode falls back to near-selection", () => {
	assert.equal(
		normalizeSelectionPanelPositionMode("bottom-right"),
		"bottom-right",
	);
	assert.equal(
		normalizeSelectionPanelPositionMode("somewhere"),
		"near-selection",
	);
});

test("YouTube subtitle display mode defaults to translation-only", () => {
	assert.deepEqual(YOUTUBE_SUBTITLE_DISPLAY_MODES, [
		"bilingual",
		"translation-only",
	]);
	assert.equal(DEFAULT_SETTINGS.youtubeSubtitleDisplayMode, "translation-only");
	assert.equal(
		validateSettings({}).settings.youtubeSubtitleDisplayMode,
		"translation-only",
	);
});

test("YouTube subtitle display mode accepts both supported values", () => {
	for (const mode of YOUTUBE_SUBTITLE_DISPLAY_MODES) {
		assert.equal(normalizeYoutubeSubtitleDisplayMode(mode), mode);
		assert.equal(
			validateSettings({ youtubeSubtitleDisplayMode: mode }).settings
				.youtubeSubtitleDisplayMode,
			mode,
		);
	}
});

test("invalid YouTube subtitle display modes fall back safely", () => {
	assert.equal(
		normalizeYoutubeSubtitleDisplayMode("side-by-side"),
		"translation-only",
	);
	assert.equal(
		validateSettings({ youtubeSubtitleDisplayMode: "side-by-side" }).settings
			.youtubeSubtitleDisplayMode,
		"translation-only",
	);
});

test("getSettings returns migrated and normalized stored settings", async () => {
	const originalChrome = global.chrome;

	global.chrome = {
		storage: {
			sync: {
				get: async () => ({
					settings: {
						apiKey: " sk-demo ",
						baseUrl: " https://example.com/v1/// ",
						model: " demo-model ",
						instructions: "Translate carefully.",
						targetLanguage: " 日本語 ",
						disabledDomains: "Example.COM, docs.example.com",
					},
				}),
			},
		},
	};

	try {
		const settings = await getSettings();

		assert.equal(settings.apiKey, "sk-demo");
		assert.equal(settings.baseUrl, "https://example.com/v1");
		assert.equal(settings.model, "demo-model");
		assert.equal(settings.targetLanguage, "日本語");
		assert.match(settings.systemPromptTemplate, /^Translate carefully\./);
		assert.equal(settings.userPromptTemplate, DEFAULT_USER_PROMPT_TEMPLATE);
		assert.equal(settings.youtubeSubtitleDisplayMode, "translation-only");
		assert.equal(settings.disabledDomains, "example.com\ndocs.example.com");
	} finally {
		global.chrome = originalChrome;
	}
});
