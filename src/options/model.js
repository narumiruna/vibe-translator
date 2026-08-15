import Appearance from "../shared/appearance.js";
import Settings from "../shared/settings.js";
import Api from "../translation/api.js";

const CONNECTION_ERROR_FALLBACK =
	"Connection test failed. Check the endpoint and model.";
const INVALID_DRAFT_FIELD_IDS = Object.freeze({
	apiKey: "api-key",
	baseUrl: "base-url",
	model: "model",
	systemPromptTemplate: "system-prompt-template",
	targetLanguage: "target-language",
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

function getInvalidFieldIds(errors) {
	const fields = [
		[/API Key/u, INVALID_DRAFT_FIELD_IDS.apiKey],
		[/Base URL/u, INVALID_DRAFT_FIELD_IDS.baseUrl],
		[/Model/u, INVALID_DRAFT_FIELD_IDS.model],
		[/Target language/u, INVALID_DRAFT_FIELD_IDS.targetLanguage],
		[/System prompt template/u, INVALID_DRAFT_FIELD_IDS.systemPromptTemplate],
		[/User prompt template/u, INVALID_DRAFT_FIELD_IDS.userPromptTemplate],
	];

	return fields
		.filter(([pattern]) =>
			(errors || []).some((message) => pattern.test(String(message))),
		)
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

function getConnectionErrorMessage(error, apiKey) {
	const message = typeof error === "string" ? error.trim() : "";

	if (!message) {
		return CONNECTION_ERROR_FALLBACK;
	}

	const secret = String(apiKey || "");
	return secret ? message.replaceAll(secret, "[redacted]") : message;
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

const api = {
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
export default api;
