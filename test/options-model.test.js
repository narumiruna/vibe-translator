import assert from "node:assert/strict";
import test from "node:test";
import {
	applyAppearancePreset,
	buildPromptPreview,
	createOptionsDraft,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	resetAppearanceDraft,
	updateDraftField,
} from "../src/options/model.js";
import Appearance from "../src/shared/appearance.js";
import Settings from "../src/shared/settings.js";

function createValidSettings(overrides = {}) {
	return {
		...Settings.DEFAULT_SETTINGS,
		apiKey: "test-key",
		model: "test-model",
		...overrides,
	};
}

test("options drafts are independent normalized copies", () => {
	const settings = createValidSettings();
	const draft = createOptionsDraft(settings);
	const updated = updateDraftField(
		draft,
		["translationAppearance", "inline", "fontSizePx"],
		19,
	);

	assert.notEqual(draft, settings);
	assert.notEqual(draft.translationAppearance, settings.translationAppearance);
	assert.equal(draft.translationAppearance.inline.fontSizePx, 16);
	assert.equal(updated.translationAppearance.inline.fontSizePx, 19);
	assert.equal(settings.translationAppearance.inline.fontSizePx, 16);
});

test("dirty state compares normalized settings rather than raw formatting", () => {
	const settings = createValidSettings({
		disabledDomains: "example.com\nchat.openai.com",
	});
	const draft = createOptionsDraft(settings);

	assert.equal(isOptionsDraftDirty(draft, settings), false);
	assert.equal(
		isOptionsDraftDirty(
			{
				...draft,
				disabledDomains: " EXAMPLE.COM, chat.openai.com ",
			},
			settings,
		),
		false,
	);
	assert.equal(
		isOptionsDraftDirty({ ...draft, model: "another-model" }, settings),
		true,
	);
});

test("appearance presets replace inline values but preserve selection customization", () => {
	const draft = createOptionsDraft(
		createValidSettings({
			translationAppearance: {
				...Appearance.createTranslationAppearancePreset("calm-reading"),
				selection: {
					...Appearance.DEFAULT_TRANSLATION_APPEARANCE.selection,
					widthPx: 360,
				},
			},
		}),
	);
	const updated = applyAppearancePreset(draft, "minimal");

	assert.equal(updated.translationAppearance.presetId, "minimal");
	assert.equal(updated.translationAppearance.inline.showBackground, false);
	assert.equal(updated.translationAppearance.selection.widthPx, 360);
	assert.equal(draft.translationAppearance.presetId, "calm-reading");
});

test("custom appearance edits and reset stay isolated from unrelated settings", () => {
	const draft = createOptionsDraft(
		createValidSettings({ targetLanguage: "日本語" }),
	);
	const custom = updateDraftField(
		draft,
		["translationAppearance", "inline", "fontSizePx"],
		20,
	);
	const reset = resetAppearanceDraft(custom);

	assert.equal(custom.translationAppearance.presetId, "custom");
	assert.equal(custom.translationAppearance.inline.fontSizePx, 20);
	assert.deepEqual(
		reset.translationAppearance,
		Appearance.DEFAULT_TRANSLATION_APPEARANCE,
	);
	assert.equal(reset.targetLanguage, "日本語");
	assert.equal(reset.apiKey, "test-key");
});

test("validation errors map to the controls that need correction", () => {
	const validation = Settings.validateSettings({
		...createValidSettings(),
		apiKey: "",
		baseUrl: "https://api.example.com/not-v1",
		model: "",
		targetLanguage: "",
		userPromptTemplate: "Translate without source data.",
	});

	assert.deepEqual(getInvalidFieldIds(validation.errors), [
		"api-key",
		"base-url",
		"model",
		"target-language",
		"user-prompt-template",
	]);
	assert.deepEqual(getInvalidFieldIds([]), []);
});

test("prompt preview applies defaults and reports warnings and token estimates", () => {
	const preview = buildPromptPreview(
		createValidSettings({
			systemPromptTemplate: "",
			targetLanguage: "繁體中文",
			userPromptTemplate: "Translate without a source placeholder.",
		}),
	);

	assert.match(preview.systemPrompt, /bilingual technical reading aids/u);
	assert.match(preview.userPrompt, /Translate without a source placeholder/u);
	assert.ok(preview.totalTokens > 0);
	assert.equal(preview.totalTokens, preview.systemTokens + preview.userTokens);
	assert.match(preview.warnings.join(" "), /sourcePayload/u);
});
