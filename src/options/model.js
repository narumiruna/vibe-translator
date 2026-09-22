import * as Appearance from "../shared/appearance.js";
import * as Settings from "../shared/settings.js";
import * as Api from "../translation/api.js";

const CONNECTION_ERROR_FALLBACK =
	"Connection test failed. Check the endpoint and model.";
const INVALID_DRAFT_FIELD_IDS = Object.freeze({
	provider: "provider",
	customBaseUrl: "custom-base-url",
	model: "model",
	targetLanguage: "target-language",
	systemPromptTemplate: "system-prompt-template",
	userPromptTemplate: "user-prompt-template",
});

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function createOptionsDraft(input) {
	return clone(Settings.validateSettings(input || {}).settings);
}

function updateDraftField(draft, path, value) {
	const keys = Array.isArray(path) ? path : [path];
	const next = clone(draft);
	let target = next;

	for (const key of keys.slice(0, -1)) {
		target[key] = { ...target[key] };
		target = target[key];
	}

	target[keys.at(-1)] = value;
	if (keys[0] === "translationAppearance" && keys.at(-1) !== "presetId") {
		next.translationAppearance.presetId = "custom";
	}

	return next;
}

function normalizeOptionsDraft(draft) {
	return Settings.validateSettings(draft || {}).settings;
}

function isOptionsDraftDirty(draft, savedSettings) {
	return (
		JSON.stringify(normalizeOptionsDraft(draft)) !==
		JSON.stringify(normalizeOptionsDraft(savedSettings))
	);
}

function getInvalidFieldIds(invalidFields = []) {
	// Focus priority belongs to the UI, not the validator's message order.
	return Object.entries(INVALID_DRAFT_FIELD_IDS)
		.filter(([field]) => invalidFields.includes(field))
		.map(([, id]) => id);
}

function clearEditedFieldError(invalidFields, path) {
	const field = Array.isArray(path) ? path[0] : path;
	const fieldId = INVALID_DRAFT_FIELD_IDS[field];

	if (!fieldId || !invalidFields?.has(fieldId)) {
		return invalidFields;
	}

	const next = new Set(invalidFields);
	next.delete(fieldId);
	return next;
}

function getConnectionErrorMessage(error) {
	const message = typeof error === "string" ? error.trim() : "";

	return message || CONNECTION_ERROR_FALLBACK;
}

function applyAppearancePreset(draft, presetId) {
	if (presetId === "custom") {
		return updateDraftField(
			draft,
			["translationAppearance", "presetId"],
			"custom",
		);
	}

	const preset = Appearance.createTranslationAppearancePreset(presetId);
	preset.selection = clone(draft.translationAppearance.selection);

	return {
		...draft,
		translationAppearance: Appearance.normalizeTranslationAppearance(preset),
	};
}

function resetAppearanceDraft(draft) {
	return {
		...draft,
		translationAppearance: clone(Appearance.DEFAULT_TRANSLATION_APPEARANCE),
	};
}

function buildPromptPreview(draft) {
	const systemPromptTemplate =
		String(draft?.systemPromptTemplate || "").trim() ||
		Settings.DEFAULT_SETTINGS.systemPromptTemplate;
	const userPromptTemplate =
		String(draft?.userPromptTemplate || "").trim() ||
		Settings.DEFAULT_SETTINGS.userPromptTemplate;
	const targetLanguage =
		String(draft?.targetLanguage || "").trim() ||
		Settings.DEFAULT_SETTINGS.targetLanguage;
	const input = Api.buildTranslationInput({
		systemPromptTemplate,
		userPromptTemplate,
		items: [
			{ id: "preview-1", kind: "paragraph", text: "Sample source text." },
		],
		targetLanguage,
	});
	const systemPrompt = input[0]?.content || "";
	const userPrompt = input[1]?.content || "";
	const systemTokens = Api.estimateTokenCount(systemPrompt);
	const userTokens = Api.estimateTokenCount(userPrompt);

	return {
		systemPrompt,
		systemTokens,
		totalTokens: systemTokens + userTokens,
		userPrompt,
		userTokens,
		warnings: Settings.lintPromptTemplates({
			...draft,
			systemPromptTemplate,
			userPromptTemplate,
		}),
	};
}

export {
	applyAppearancePreset,
	buildPromptPreview,
	clearEditedFieldError,
	createOptionsDraft,
	getConnectionErrorMessage,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	normalizeOptionsDraft,
	resetAppearanceDraft,
	updateDraftField,
};
