const TRANSLATION_RESPONSE_FORMAT = Object.freeze({
	type: "json_schema",
	name: "translation_result",
	schema: {
		type: "object",
		description: "Translations corresponding one-to-one with the input items.",
		properties: {
			translations: {
				type: "array",
				description: "One result per input item, in the same order.",
				items: {
					type: "object",
					properties: {
						id: {
							type: "string",
							description: "The input item id copied without changes.",
						},
						translatedText: {
							type: "string",
							description: "Only the translated text for this item.",
						},
					},
					required: ["id", "translatedText"],
					additionalProperties: false,
				},
			},
		},
		required: ["translations"],
		additionalProperties: false,
	},
	strict: true,
});

class InvalidTranslationResponseError extends Error {
	constructor(cause) {
		super(cause?.message || String(cause), { cause });
		this.name = "InvalidTranslationResponseError";
	}
}

function renderPromptTemplate(template, variables) {
	return String(template || "").replace(/\{\{(\w+)\}\}/g, (_match, key) => {
		if (!Object.hasOwn(variables, key)) {
			return "";
		}

		return String(variables[key]);
	});
}

function estimateTokenCount(value) {
	const text = String(value || "").trim();

	if (!text) {
		return 0;
	}

	return Math.max(1, Math.ceil(text.length / 4));
}

function buildTranslationInput(options) {
	const items = options.items || [];
	const targetLanguage = options.targetLanguage;
	const payloadItems = items.map((item) => ({
		id: item.id,
		kind: item.kind || "paragraph",
		isUI: Boolean(item.isUI),
		isMetadata: Boolean(item.isMetadata),
		containsMath: Boolean(item.containsMath),
		text: item.text,
	}));
	const userPayload =
		payloadItems.length === 1
			? {
					targetLanguage,
					...payloadItems[0],
				}
			: {
					targetLanguage,
					items: payloadItems,
				};
	const templateVariables = {
		targetLanguage,
		sourcePayload: JSON.stringify(userPayload),
		itemCount: String(payloadItems.length),
		itemKind:
			payloadItems.length === 1 ? payloadItems[0].kind || "text" : "items",
	};

	return [
		{
			role: "system",
			content: renderPromptTemplate(
				options.systemPromptTemplate,
				templateVariables,
			),
		},
		{
			role: "user",
			content: renderPromptTemplate(
				options.userPromptTemplate,
				templateVariables,
			),
		},
	];
}

function applyTranslationResponseFormat(payload) {
	return {
		...(payload && typeof payload === "object" ? payload : {}),
		text: {
			...(payload?.text && typeof payload.text === "object"
				? payload.text
				: {}),
			format: TRANSLATION_RESPONSE_FORMAT,
		},
	};
}

function stripCodeFences(text) {
	return String(text || "")
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
}

function parseTranslationText(text) {
	const normalized = stripCodeFences(text);
	if (!normalized) {
		throw new Error("Response did not include translation output.");
	}

	const parsed = JSON.parse(normalized);
	const translations = Array.isArray(parsed) ? parsed : parsed?.translations;

	if (!Array.isArray(translations)) {
		throw new Error("Response JSON is missing translations array.");
	}

	return translations.map((item) => {
		if (
			!item ||
			typeof item.id !== "string" ||
			(typeof item.translatedText !== "string" &&
				typeof item.translation !== "string")
		) {
			throw new Error(
				"Response item is missing id or translatedText/translation.",
			);
		}

		return {
			id: item.id,
			translation:
				typeof item.translatedText === "string"
					? item.translatedText
					: item.translation,
		};
	});
}

function validateTranslationCoverage(items, translations) {
	const expectedIds = (items || [])
		.map((item) => item?.id)
		.filter((id) => typeof id === "string");
	const expectedIdSet = new Set(expectedIds);
	const seenIds = new Set();

	for (const translation of translations || []) {
		const id = translation?.id;

		if (!expectedIdSet.has(id)) {
			throw new Error(`Translation response included unknown id: ${id}`);
		}

		if (seenIds.has(id)) {
			throw new Error(`Translation response included duplicate id: ${id}`);
		}

		seenIds.add(id);
	}

	const missingIds = expectedIds.filter((id) => !seenIds.has(id));

	if (missingIds.length > 0) {
		throw new Error(
			`Translation response missing id(s): ${missingIds.join(", ")}`,
		);
	}
}

export {
	applyTranslationResponseFormat,
	buildTranslationInput,
	estimateTokenCount,
	InvalidTranslationResponseError,
	parseTranslationText,
	renderPromptTemplate,
	stripCodeFences,
	TRANSLATION_RESPONSE_FORMAT,
	validateTranslationCoverage,
};
