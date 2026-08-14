import Appearance from "../shared/appearance.js";
import Settings from "../shared/settings.js";
import Api from "../translation/api.js";

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
		[/API Key/u, "api-key"],
		[/Base URL/u, "base-url"],
		[/Model/u, "model"],
		[/Target language/u, "target-language"],
		[/System prompt template/u, "system-prompt-template"],
		[/User prompt template/u, "user-prompt-template"],
	];

	return fields
		.filter(([pattern]) =>
			(errors || []).some((message) => pattern.test(String(message))),
		)
		.map(([, id]) => id);
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
	createOptionsDraft,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	normalizeOptionsDraft,
	resetAppearanceDraft,
	updateDraftField,
};

export {
	applyAppearancePreset,
	buildPromptPreview,
	createOptionsDraft,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	normalizeOptionsDraft,
	resetAppearanceDraft,
	updateDraftField,
};
export default api;
