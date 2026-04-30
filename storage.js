((root) => {
	const STORAGE_KEY = "settings";
	const LEGACY_DEFAULT_INSTRUCTIONS =
		"Preserve meaning, tone, and technical accuracy in translation.";

	function createDefaultSystemPromptTemplate(leadInstruction) {
		return [
			String(leadInstruction || LEGACY_DEFAULT_INSTRUCTIONS).trim(),
			"You are rendering bilingual technical reading aids.",
			"Translate only natural-language prose into the target language.",
			"Each output must strictly correspond 1:1 with each input item.",
			"Do not merge, split, reorder, or add extra content.",
			"Do not translate UI labels, metadata, timestamps, or navigation text.",
			"Preserve placeholders like __OT_TOKEN_1__ exactly and do not translate, remove, or reorder them unnecessarily.",
			"Keep structure by item kind. Headings stay headings, list items stay list items, table cells stay table cells.",
			"If an item is marked isUI=true or isMetadata=true, return an empty translatedText for that item.",
		].join("\n");
	}

	const DEFAULT_SYSTEM_PROMPT_TEMPLATE = createDefaultSystemPromptTemplate();
	const DEFAULT_USER_PROMPT_TEMPLATE = [
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
	const TRANSLATION_UNDERLINE_STYLES = Object.freeze([
		"solid",
		"dashed",
		"dotted",
	]);
	const SELECTION_PANEL_POSITION_MODES = Object.freeze([
		"near-selection",
		"bottom-right",
	]);
	const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i;

	function clampNumber(value, min, max, fallback) {
		const numeric = Number(value);

		if (!Number.isFinite(numeric)) {
			return fallback;
		}

		return Math.min(max, Math.max(min, numeric));
	}

	function normalizeUnderlineColor(value) {
		const trimmed = String(value || "").trim();

		return HEX_COLOR_REGEX.test(trimmed) ? trimmed.toLowerCase() : "#007aff";
	}

	function normalizeUnderlineStyle(value) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();

		return TRANSLATION_UNDERLINE_STYLES.includes(normalized)
			? normalized
			: "dashed";
	}

	function normalizeTranslationAppearance(input) {
		const source = input || {};

		return {
			translationUnderlineColor: normalizeUnderlineColor(
				source.translationUnderlineColor,
			),
			translationUnderlineStyle: normalizeUnderlineStyle(
				source.translationUnderlineStyle,
			),
			translationUnderlineThickness: clampNumber(
				source.translationUnderlineThickness,
				1,
				6,
				2,
			),
			translationUnderlineOffset: clampNumber(
				source.translationUnderlineOffset,
				0,
				12,
				3,
			),
		};
	}

	function normalizeShowTranslationDebugInfo(value) {
		return Boolean(value);
	}

	function normalizeSelectionPanelPositionMode(value) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();

		return SELECTION_PANEL_POSITION_MODES.includes(normalized)
			? normalized
			: "near-selection";
	}

	function lintPromptTemplates(input) {
		const settings = input || {};
		const systemPromptTemplate = String(
			settings.systemPromptTemplate || "",
		).trim();
		const userPromptTemplate = String(settings.userPromptTemplate || "").trim();
		const warnings = [];

		if (!userPromptTemplate.includes("{{sourcePayload}}")) {
			warnings.push(
				"User prompt template should include {{sourcePayload}} so source items are sent to the model.",
			);
		}

		if (
			!systemPromptTemplate.includes("{{targetLanguage}}") &&
			!userPromptTemplate.includes("{{targetLanguage}}")
		) {
			warnings.push(
				"Prompt templates should include {{targetLanguage}} so the requested language is explicit.",
			);
		}

		if (
			!/translatedText|translations|json/i.test(systemPromptTemplate) &&
			!/translatedText|translations|json/i.test(userPromptTemplate)
		) {
			warnings.push(
				"Prompt templates should explicitly require a JSON translations output format.",
			);
		}

		return warnings;
	}

	const DEFAULT_SETTINGS = Object.freeze({
		apiKey: "",
		baseUrl: "https://api.openai.com/v1",
		model: "",
		systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
		userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
		translationUnderlineColor: "#007aff",
		translationUnderlineStyle: "dashed",
		translationUnderlineThickness: 2,
		translationUnderlineOffset: 3,
		showTranslationDebugInfo: false,
		selectionPanelPositionMode: "near-selection",
		targetLanguage: "台灣正體中文",
		disabledDomains: "",
	});

	function migrateLegacyPromptSettings(input) {
		const source = input || {};
		const legacyInstructions = String(source.instructions || "").trim();
		const systemPromptTemplate = String(
			source.systemPromptTemplate || "",
		).trim();
		const userPromptTemplate = String(source.userPromptTemplate || "").trim();

		return {
			...source,
			systemPromptTemplate:
				systemPromptTemplate ||
				createDefaultSystemPromptTemplate(legacyInstructions),
			userPromptTemplate: userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE,
		};
	}

	function normalizeDisabledDomains(value) {
		return String(value || "")
			.split(/[\n,]+/)
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean)
			.join("\n");
	}

	function normalizeBaseUrl(value) {
		const trimmed = String(value || "").trim();

		if (!trimmed) {
			return DEFAULT_SETTINGS.baseUrl;
		}

		return trimmed.replace(/\/+$/, "");
	}

	function validateSettings(input) {
		const merged = migrateLegacyPromptSettings({
			...DEFAULT_SETTINGS,
			...(input || {}),
		});
		const settings = {
			apiKey: String(merged.apiKey || "").trim(),
			baseUrl: normalizeBaseUrl(merged.baseUrl),
			model: String(merged.model || "").trim(),
			systemPromptTemplate:
				String(merged.systemPromptTemplate || "").trim() ||
				DEFAULT_SETTINGS.systemPromptTemplate,
			userPromptTemplate:
				String(merged.userPromptTemplate || "").trim() ||
				DEFAULT_SETTINGS.userPromptTemplate,
			...normalizeTranslationAppearance(merged),
			showTranslationDebugInfo: normalizeShowTranslationDebugInfo(
				merged.showTranslationDebugInfo,
			),
			selectionPanelPositionMode: normalizeSelectionPanelPositionMode(
				merged.selectionPanelPositionMode,
			),
			targetLanguage: String(merged.targetLanguage || "").trim(),
			disabledDomains: normalizeDisabledDomains(merged.disabledDomains),
		};
		const errors = [];

		if (!settings.apiKey) {
			errors.push("API Key is required.");
		}

		if (!settings.model) {
			errors.push("Model is required.");
		}

		if (!settings.targetLanguage) {
			errors.push("Target language is required.");
		}

		if (!settings.systemPromptTemplate) {
			errors.push("System prompt template is required.");
		}

		if (!settings.userPromptTemplate) {
			errors.push("User prompt template is required.");
		} else if (!settings.userPromptTemplate.includes("{{sourcePayload}}")) {
			errors.push("User prompt template must include {{sourcePayload}}.");
		}

		try {
			const parsed = new URL(settings.baseUrl);

			if (!/^https?:$/.test(parsed.protocol)) {
				errors.push("Base URL must use HTTP or HTTPS.");
			}

			if (!/\/v1(?:\/|$)/.test(parsed.pathname)) {
				errors.push("Base URL must include /v1.");
			}
		} catch (_error) {
			errors.push("Base URL must be a valid URL.");
		}

		return {
			settings,
			errors,
			isValid: errors.length === 0,
		};
	}

	function hasCompleteSettings(settings) {
		return validateSettings(settings).isValid;
	}

	function getApiPermissionPattern(baseUrl) {
		const normalized = normalizeBaseUrl(baseUrl);
		const origin = new URL(normalized).origin;

		return `${origin}/*`;
	}

	async function getSettings() {
		if (!root.chrome || !chrome.storage?.sync) {
			return { ...DEFAULT_SETTINGS };
		}

		const stored = await chrome.storage.sync.get(STORAGE_KEY);

		return migrateLegacyPromptSettings({
			...DEFAULT_SETTINGS,
			...(stored[STORAGE_KEY] || {}),
		});
	}

	async function saveSettings(input) {
		const result = validateSettings(input);

		if (!result.isValid) {
			throw new Error(result.errors.join(" "));
		}

		if (!root.chrome || !chrome.storage?.sync) {
			return result.settings;
		}

		await chrome.storage.sync.set({
			[STORAGE_KEY]: result.settings,
		});

		return result.settings;
	}

	const api = {
		DEFAULT_SETTINGS,
		DEFAULT_SYSTEM_PROMPT_TEMPLATE,
		SELECTION_PANEL_POSITION_MODES,
		TRANSLATION_UNDERLINE_STYLES,
		DEFAULT_USER_PROMPT_TEMPLATE,
		LEGACY_DEFAULT_INSTRUCTIONS,
		STORAGE_KEY,
		createDefaultSystemPromptTemplate,
		getApiPermissionPattern,
		getSettings,
		hasCompleteSettings,
		migrateLegacyPromptSettings,
		normalizeBaseUrl,
		normalizeDisabledDomains,
		normalizeSelectionPanelPositionMode,
		normalizeShowTranslationDebugInfo,
		normalizeTranslationAppearance,
		lintPromptTemplates,
		saveSettings,
		validateSettings,
	};

	root.TranslatorStorage = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
