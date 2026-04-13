const test = require("node:test");
const assert = require("node:assert/strict");

const {
	DEFAULT_SETTINGS,
	DEFAULT_SYSTEM_PROMPT_TEMPLATE,
	DEFAULT_USER_PROMPT_TEMPLATE,
	getApiPermissionPattern,
	lintPromptTemplates,
	migrateLegacyPromptSettings,
	normalizeDisabledDomains,
	normalizeBaseUrl,
	normalizeShowTranslationDebugInfo,
	normalizeSelectionPanelPositionMode,
	normalizeTranslationAppearance,
	validateSettings,
} = require("../storage.js");

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
	assert.ok(result.errors.length >= 3);
});

test("validateSettings merges prompt template defaults", () => {
	const result = validateSettings({
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "gpt-demo",
		targetLanguage: "日本語",
	});

	assert.equal(result.isValid, true);
	assert.equal(
		result.settings.systemPromptTemplate,
		DEFAULT_SYSTEM_PROMPT_TEMPLATE,
	);
	assert.equal(
		result.settings.userPromptTemplate,
		DEFAULT_USER_PROMPT_TEMPLATE,
	);
	assert.equal(
		result.settings.translationUnderlineColor,
		DEFAULT_SETTINGS.translationUnderlineColor,
	);
	assert.equal(
		result.settings.translationUnderlineStyle,
		DEFAULT_SETTINGS.translationUnderlineStyle,
	);
	assert.equal(
		result.settings.translationUnderlineThickness,
		DEFAULT_SETTINGS.translationUnderlineThickness,
	);
	assert.equal(
		result.settings.translationUnderlineOffset,
		DEFAULT_SETTINGS.translationUnderlineOffset,
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

test("normalizeTranslationAppearance clamps and sanitizes underline settings", () => {
	assert.deepEqual(
		normalizeTranslationAppearance({
			translationUnderlineColor: "not-a-color",
			translationUnderlineStyle: "wavy",
			translationUnderlineThickness: 99,
			translationUnderlineOffset: -4,
		}),
		{
			translationUnderlineColor: "#1f7a4f",
			translationUnderlineStyle: "dashed",
			translationUnderlineThickness: 6,
			translationUnderlineOffset: 0,
		},
	);
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

test("migrateLegacyPromptSettings folds instructions into system prompt template", () => {
	const result = migrateLegacyPromptSettings({
		instructions: "Translate carefully.",
		targetLanguage: "台灣正體中文",
	});

	assert.match(result.systemPromptTemplate, /^Translate carefully\./);
	assert.equal(result.userPromptTemplate, DEFAULT_USER_PROMPT_TEMPLATE);
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

test("lintPromptTemplates warns when target language or output format hints are missing", () => {
	const warnings = lintPromptTemplates({
		systemPromptTemplate: "Translate carefully.",
		userPromptTemplate: "{{sourcePayload}}",
	});

	assert.ok(warnings.some((warning) => warning.includes("{{targetLanguage}}")));
	assert.ok(
		warnings.some((warning) => warning.includes("JSON translations output")),
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
