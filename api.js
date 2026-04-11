((root) => {
	const DEFAULT_MAX_BATCH_CHARS = 5000;
	const DEFAULT_MAX_CONCURRENCY = 5;
	const TRANSLATION_CACHE_LIMIT = 500;
	const TRANSLATION_SCHEMA_VERSION = 1;
	const TRANSLATION_RESPONSE_FORMAT = Object.freeze({
		type: "json_schema",
		name: "translation_result",
		schema: {
			type: "object",
			properties: {
				translations: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							translation: { type: "string" },
						},
						required: ["id", "translation"],
						additionalProperties: false,
					},
				},
			},
			required: ["translations"],
			additionalProperties: false,
		},
		strict: true,
	});
	const SPLIT_BOUNDARIES = [
		{ regex: /\n\s*\n+/g, joiner: "\n\n" },
		{ regex: /\n+/g, joiner: "\n" },
		{ regex: /[.!?。！？]+\s+/g, joiner: " " },
		{ regex: /[,;:，；：、]\s*/g, joiner: " " },
		{ regex: /\s+/g, joiner: " " },
	];
	const TECH_TERM_REGEX =
		/\b(?:API|LLM|OpenAI|GitHub|Telegram|Markdown|README|Chrome|Yahoo Finance|JSON|HTML|CSS|JavaScript|TypeScript|Node\.js)\b/g;
	const FILE_PATH_REGEX =
		/\b(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w./-]*[\w.-]\b|\b[\w.-]+\.(?:md|txt|json|ya?ml|toml|js|jsx|ts|tsx|css|html|py|sh|rb|go|rs|java|kt|swift)\b/g;
	const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/g;
	const INLINE_CODE_REGEX = /`[^`\n]+`/g;
	const DISPLAY_LATEX_REGEX = /\$\$[\s\S]+?\$\$/g;
	const INLINE_DOLLAR_MATH_REGEX = /\$[^$\n]+\$/g;
	const INLINE_PAREN_MATH_REGEX = /\\\([\s\S]+?\\\)/g;
	const BLOCK_BRACKET_MATH_REGEX = /\\\[[\s\S]+?\\\]/g;
	const translationCache = new Map();

	function buildTranslationCacheKey(settings, item) {
		return JSON.stringify({
			schemaVersion: TRANSLATION_SCHEMA_VERSION,
			baseUrl: String(settings?.baseUrl || "").trim(),
			model: String(settings?.model || "").trim(),
			systemPromptTemplate: String(settings?.systemPromptTemplate || "").trim(),
			userPromptTemplate: String(settings?.userPromptTemplate || "").trim(),
			targetLanguage: String(settings?.targetLanguage || "").trim(),
			kind: String(item?.kind || "paragraph"),
			text: String(item?.text || ""),
		});
	}

	function getCachedTranslation(settings, item) {
		const cacheKey = buildTranslationCacheKey(settings, item);

		if (!translationCache.has(cacheKey)) {
			return null;
		}

		const cachedTranslation = translationCache.get(cacheKey);

		translationCache.delete(cacheKey);
		translationCache.set(cacheKey, cachedTranslation);

		return cachedTranslation;
	}

	function setCachedTranslation(settings, item, translation) {
		const cacheKey = buildTranslationCacheKey(settings, item);

		translationCache.delete(cacheKey);
		translationCache.set(cacheKey, String(translation || ""));

		while (translationCache.size > TRANSLATION_CACHE_LIMIT) {
			const oldestKey = translationCache.keys().next().value;

			if (!oldestKey) {
				break;
			}

			translationCache.delete(oldestKey);
		}
	}

	function clearTranslationCache() {
		translationCache.clear();
	}

	function splitItemsByCache(settings, items) {
		const cachedTranslations = [];
		const missingItems = [];

		for (const item of items || []) {
			const cachedTranslation = getCachedTranslation(settings, item);

			if (typeof cachedTranslation === "string") {
				cachedTranslations.push({
					id: item.id,
					translation: cachedTranslation,
				});
			} else {
				missingItems.push(item);
			}
		}

		return {
			cachedTranslations,
			missingItems,
		};
	}

	function mergeTranslationsInItemOrder(items, translations) {
		const translationById = new Map(
			(translations || []).map((item) => [item.id, item.translation]),
		);

		return (items || [])
			.filter((item) => translationById.has(item.id))
			.map((item) => ({
				id: item.id,
				translation: translationById.get(item.id),
			}));
	}

	function cacheTranslations(settings, items, translations) {
		const itemsById = new Map((items || []).map((item) => [item.id, item]));

		for (const translation of translations || []) {
			const item = itemsById.get(translation.id);

			if (!item) {
				continue;
			}

			setCachedTranslation(settings, item, translation.translation);
		}
	}

	function normalizeChunkText(text) {
		return String(text || "").trim();
	}

	function maskProtectedFragments(text, existingTokens) {
		const tokens = [...(existingTokens || [])];
		let maskedText = String(text || "");
		let counter = tokens.reduce((max, token) => {
			const match = /^__OT_TOKEN_(\d+)__$/.exec(String(token?.placeholder));

			return match ? Math.max(max, Number(match[1]) || 0) : max;
		}, 0);

		function replaceWithToken(regex) {
			maskedText = maskedText.replace(regex, (match) => {
				const placeholder = `__OT_TOKEN_${++counter}__`;

				tokens.push({
					placeholder,
					value: match,
				});

				return placeholder;
			});
		}

		replaceWithToken(DISPLAY_LATEX_REGEX);
		replaceWithToken(BLOCK_BRACKET_MATH_REGEX);
		replaceWithToken(INLINE_PAREN_MATH_REGEX);
		replaceWithToken(INLINE_DOLLAR_MATH_REGEX);
		replaceWithToken(INLINE_CODE_REGEX);
		replaceWithToken(URL_REGEX);
		replaceWithToken(FILE_PATH_REGEX);
		replaceWithToken(TECH_TERM_REGEX);

		return {
			maskedText,
			tokens,
		};
	}

	function shouldPreservePlaceholder(token) {
		return Boolean(token?.preservePlaceholder);
	}

	function unmaskProtectedFragments(text, tokens) {
		let restored = String(text || "");

		for (const token of tokens || []) {
			if (shouldPreservePlaceholder(token)) {
				continue;
			}

			restored = restored.split(token.placeholder).join(token.value);
		}

		return restored;
	}

	function collectPreservedFragments(tokens) {
		return (tokens || []).filter((token) => shouldPreservePlaceholder(token));
	}

	function extractTokensForText(text, tokens) {
		return (tokens || []).filter((token) =>
			String(text || "").includes(token.placeholder),
		);
	}

	function splitByBoundary(text, boundary) {
		const parts = [];
		let lastIndex = 0;

		boundary.regex.lastIndex = 0;
		let match = boundary.regex.exec(text);

		while (match !== null) {
			const part = normalizeChunkText(
				text.slice(lastIndex, match.index + match[0].length),
			);

			if (part) {
				parts.push(part);
			}

			lastIndex = match.index + match[0].length;
			match = boundary.regex.exec(text);
		}

		const tail = normalizeChunkText(text.slice(lastIndex));

		if (tail) {
			parts.push(tail);
		}

		return parts;
	}

	function hardSplitText(text, limit) {
		const normalized = normalizeChunkText(text);
		const parts = [];

		for (let index = 0; index < normalized.length; index += limit) {
			parts.push({
				text: normalized.slice(index, index + limit),
				joiner: index + limit < normalized.length ? " " : "",
			});
		}

		return parts;
	}

	function splitTextRecursively(text, limit, level) {
		const normalized = normalizeChunkText(text);
		const boundaryLevel = level || 0;

		if (!normalized) {
			return [];
		}

		if (normalized.length <= limit) {
			return [{ text: normalized, joiner: "" }];
		}

		if (boundaryLevel >= SPLIT_BOUNDARIES.length) {
			return hardSplitText(normalized, limit);
		}

		const boundary = SPLIT_BOUNDARIES[boundaryLevel];
		const parts = splitByBoundary(normalized, boundary);

		if (parts.length <= 1) {
			return splitTextRecursively(normalized, limit, boundaryLevel + 1);
		}

		const descriptors = [];

		for (let index = 0; index < parts.length; index += 1) {
			const part = parts[index];
			const nested =
				part.length <= limit
					? [{ text: part, joiner: "" }]
					: splitTextRecursively(part, limit, boundaryLevel + 1);

			descriptors.push(...nested);

			if (index < parts.length - 1 && descriptors.length > 0) {
				descriptors[descriptors.length - 1].joiner = boundary.joiner;
			}
		}

		return descriptors;
	}

	function chunkTranslationItems(items, maxChars) {
		const limit = maxChars || DEFAULT_MAX_BATCH_CHARS;
		const chunks = [];
		let current = [];
		let currentChars = 0;

		for (const item of items || []) {
			const textLength = (item.text || "").length;

			if (current.length > 0 && currentChars + textLength > limit) {
				chunks.push(current);
				current = [];
				currentChars = 0;
			}

			current.push(item);
			currentChars += textLength;
		}

		if (current.length > 0) {
			chunks.push(current);
		}

		return chunks;
	}

	function createRecursiveChunkPlan(items, maxChars) {
		const limit = maxChars || DEFAULT_MAX_BATCH_CHARS;
		const normalizedItems = [];
		const expandedItems = [];
		const mergePlan = new Map();

		for (const item of items || []) {
			const protectedFragments = maskProtectedFragments(
				item.text,
				item.protectedFragments,
			);
			const normalizedItem = {
				...item,
				maskedText: protectedFragments.maskedText,
				protectedFragments: protectedFragments.tokens,
			};
			const parts = splitTextRecursively(normalizedItem.maskedText, limit, 0);

			normalizedItems.push(normalizedItem);

			if (parts.length <= 1) {
				expandedItems.push({
					id: item.id,
					kind: item.kind || "paragraph",
					text: parts[0]
						? parts[0].text
						: normalizeChunkText(normalizedItem.maskedText),
					sourceId: item.id,
					partIndex: 0,
					partCount: 1,
					joiner: "",
					protectedFragments: extractTokensForText(
						normalizedItem.maskedText,
						normalizedItem.protectedFragments,
					),
				});
				mergePlan.set(item.id, {
					originalId: item.id,
					partIds: [item.id],
					protectedFragments: normalizedItem.protectedFragments,
				});
				continue;
			}

			const partIds = [];

			for (let index = 0; index < parts.length; index += 1) {
				const partId = `${item.id}__part_${index + 1}`;

				expandedItems.push({
					id: partId,
					kind: item.kind || "paragraph",
					text: parts[index].text,
					sourceId: item.id,
					partIndex: index,
					partCount: parts.length,
					joiner: parts[index].joiner,
					protectedFragments: extractTokensForText(
						parts[index].text,
						normalizedItem.protectedFragments,
					),
				});
				partIds.push(partId);
			}

			mergePlan.set(item.id, {
				originalId: item.id,
				partIds,
				protectedFragments: normalizedItem.protectedFragments,
			});
		}

		return {
			chunks: expandedItems.map((item) => [item]),
			expandedItems,
			items: normalizedItems,
			mergePlan,
		};
	}

	function renderPromptTemplate(template, variables) {
		return String(template || "").replace(/\{\{(\w+)\}\}/g, (_match, key) => {
			if (!Object.hasOwn(variables, key)) {
				return "";
			}

			return String(variables[key]);
		});
	}

	function buildTranslationInput(options) {
		const items = options.items || [];
		const targetLanguage = options.targetLanguage;
		const payloadItems = items.map((item) => ({
			id: item.id,
			kind: item.kind || "paragraph",
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

	function buildResponsesRequest(settings, items) {
		return {
			model: settings.model,
			input: buildTranslationInput({
				systemPromptTemplate: settings.systemPromptTemplate,
				userPromptTemplate: settings.userPromptTemplate,
				items,
				targetLanguage: settings.targetLanguage,
			}),
			text: {
				format: TRANSLATION_RESPONSE_FORMAT,
			},
		};
	}

	function extractOutputText(payload) {
		if (
			payload &&
			typeof payload.output_text === "string" &&
			payload.output_text.trim()
		) {
			return payload.output_text;
		}

		const output = Array.isArray(payload?.output) ? payload.output : [];
		const textParts = [];

		for (const item of output) {
			if (!item || !Array.isArray(item.content)) {
				continue;
			}

			for (const contentItem of item.content) {
				if (
					contentItem &&
					contentItem.type === "output_text" &&
					typeof contentItem.text === "string"
				) {
					textParts.push(contentItem.text);
				}
			}
		}

		return textParts.join("\n");
	}

	function stripCodeFences(text) {
		return String(text || "")
			.trim()
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/, "");
	}

	function parseTranslationResponse(payload) {
		let parsed = payload?.output_parsed;

		if (!parsed) {
			const fallbackText = stripCodeFences(extractOutputText(payload));

			if (!fallbackText) {
				throw new Error("Response did not include parsed output.");
			}

			parsed = JSON.parse(fallbackText);
		}

		const translations = Array.isArray(parsed) ? parsed : parsed?.translations;

		if (!Array.isArray(translations)) {
			throw new Error("Response JSON is missing translations array.");
		}

		return translations.map((item) => {
			if (
				!item ||
				typeof item.id !== "string" ||
				typeof item.translation !== "string"
			) {
				throw new Error("Response item is missing id or translation.");
			}

			return {
				id: item.id,
				translation: item.translation,
			};
		});
	}

	function validateProtectedFragments(items, translations) {
		const itemById = new Map((items || []).map((item) => [item.id, item]));

		for (const translation of translations || []) {
			const sourceItem = itemById.get(translation.id);

			if (!sourceItem) {
				throw new Error(`Unknown translation item id: ${translation.id}`);
			}

			for (const fragment of sourceItem.protectedFragments || []) {
				if (!translation.translation.includes(fragment.placeholder)) {
					throw new Error(
						`Protected placeholder missing from translation for ${translation.id}`,
					);
				}
			}
		}
	}

	async function callResponsesApi(settings, items, fetchImpl) {
		const requestPayload = buildResponsesRequest(settings, items);
		const response = await fetchImpl(`${settings.baseUrl}/responses`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${settings.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestPayload),
		});
		const rawText =
			typeof response.text === "function" ? await response.text() : "";
		let payload;

		try {
			payload = rawText ? JSON.parse(rawText) : {};
		} catch (_error) {
			payload = { error: { message: rawText || "Invalid JSON response." } };
		}

		if (!response.ok) {
			const message =
				payload?.error &&
				typeof payload.error.message === "string" &&
				payload.error.message.trim();

			throw new Error(
				message || `Translation request failed with status ${response.status}.`,
			);
		}

		const translations = parseTranslationResponse(payload);

		validateProtectedFragments(items, translations);

		return translations;
	}

	async function requestTranslations(options) {
		const settings = options.settings;
		const items = options.items || [];
		const fetchImpl = options.fetchImpl || root.fetch;

		if (items.length === 0) {
			return [];
		}

		const { cachedTranslations, missingItems } = splitItemsByCache(
			settings,
			items,
		);

		if (missingItems.length === 0) {
			return mergeTranslationsInItemOrder(items, cachedTranslations);
		}

		if (typeof fetchImpl !== "function") {
			throw new Error("Fetch is not available.");
		}

		let freshTranslations;

		try {
			freshTranslations = await callResponsesApi(
				settings,
				missingItems,
				fetchImpl,
			);
		} catch (error) {
			if (
				error instanceof SyntaxError ||
				/Response JSON|Unexpected token|missing id|parsed output|translations array|Protected placeholder/i.test(
					error.message,
				)
			) {
				freshTranslations = await callResponsesApi(
					settings,
					missingItems,
					fetchImpl,
				);
			} else {
				throw error;
			}
		}

		cacheTranslations(settings, missingItems, freshTranslations);

		return mergeTranslationsInItemOrder(
			items,
			cachedTranslations.concat(freshTranslations),
		);
	}

	async function requestTranslationsBatched(options) {
		const settings = options.settings;
		const chunks = options.chunks || [];
		const fetchImpl = options.fetchImpl || root.fetch;
		const concurrency = Math.max(
			1,
			Math.floor(options.concurrency || DEFAULT_MAX_CONCURRENCY),
		);
		const results = new Array(chunks.length);
		let nextIndex = 0;

		async function worker() {
			while (nextIndex < chunks.length) {
				const chunkIndex = nextIndex;
				nextIndex += 1;

				results[chunkIndex] = await requestTranslations({
					settings,
					items: chunks[chunkIndex],
					fetchImpl,
				});
			}
		}

		const workers = [];
		const workerCount = Math.min(concurrency, chunks.length);

		for (let index = 0; index < workerCount; index += 1) {
			workers.push(worker());
		}

		await Promise.all(workers);

		return results.flat();
	}

	async function requestTranslationsBatchedProgressive(options) {
		const settings = options.settings;
		const chunks = options.chunks || [];
		const fetchImpl = options.fetchImpl || root.fetch;
		const concurrency = Math.max(
			1,
			Math.floor(options.concurrency || DEFAULT_MAX_CONCURRENCY),
		);
		const onChunkResolved =
			typeof options.onChunkResolved === "function"
				? options.onChunkResolved
				: null;
		const onChunkRejected =
			typeof options.onChunkRejected === "function"
				? options.onChunkRejected
				: null;
		const successes = [];
		const failures = [];
		let nextIndex = 0;

		async function worker() {
			while (nextIndex < chunks.length) {
				const chunkIndex = nextIndex;
				const chunkItems = chunks[chunkIndex];
				nextIndex += 1;

				try {
					const result = await requestTranslations({
						settings,
						items: chunkItems,
						fetchImpl,
					});

					successes[chunkIndex] = result;

					if (onChunkResolved) {
						await onChunkResolved({
							chunkIndex,
							chunkItems,
							translations: result,
						});
					}
				} catch (error) {
					const failure = {
						chunkIndex,
						chunkItems,
						error,
					};

					failures.push(failure);

					if (onChunkRejected) {
						await onChunkRejected(failure);
					}
				}
			}
		}

		const workers = [];
		const workerCount = Math.min(concurrency, chunks.length);

		for (let index = 0; index < workerCount; index += 1) {
			workers.push(worker());
		}

		await Promise.all(workers);

		return {
			successes: successes.filter(Boolean).flat(),
			failures,
		};
	}

	function createProgressiveMergeState(plan) {
		return {
			completedSegmentIds: new Set(),
			partTranslations: new Map(),
			expandedById: new Map(
				(plan.expandedItems || []).map((item) => [item.id, item]),
			),
		};
	}

	function consumeProgressiveTranslations(plan, state, translations) {
		const completed = [];
		const touchedSegmentIds = new Set();

		for (const translation of translations || []) {
			state.partTranslations.set(translation.id, translation.translation);

			const meta = state.expandedById.get(translation.id);

			if (meta) {
				touchedSegmentIds.add(meta.sourceId);
			}
		}

		for (const sourceId of touchedSegmentIds) {
			if (state.completedSegmentIds.has(sourceId)) {
				continue;
			}

			const group = plan.mergePlan.get(sourceId);

			if (!group) {
				continue;
			}

			const hasAllParts = group.partIds.every((partId) =>
				state.partTranslations.has(partId),
			);

			if (!hasAllParts) {
				continue;
			}

			let mergedText = "";

			for (const partId of group.partIds) {
				const fragment = state.partTranslations.get(partId);
				const meta = state.expandedById.get(partId);

				if (typeof fragment !== "string" || !meta) {
					continue;
				}

				mergedText += fragment;

				if (meta.joiner) {
					mergedText += meta.joiner;
				}
			}

			const sourceItem = (plan.items || []).find(
				(item) => item.id === sourceId,
			);

			completed.push({
				id: sourceId,
				kind: sourceItem ? sourceItem.kind || "paragraph" : "paragraph",
				translation: unmaskProtectedFragments(
					mergedText.trim(),
					group.protectedFragments,
				),
				protectedFragments: collectPreservedFragments(group.protectedFragments),
			});
			state.completedSegmentIds.add(sourceId);
		}

		return completed;
	}

	function getIncompleteSegmentIds(plan, state) {
		return (plan.items || [])
			.map((item) => item.id)
			.filter((id) => !state.completedSegmentIds.has(id));
	}

	function mergeRecursiveTranslations(plan, translations) {
		const byId = new Map(
			(translations || []).map((item) => [item.id, item.translation]),
		);
		const expandedById = new Map(
			(plan.expandedItems || []).map((item) => [item.id, item]),
		);
		const merged = [];

		for (const item of plan.items || []) {
			const group = plan.mergePlan.get(item.id);

			if (!group) {
				continue;
			}

			let translation = "";

			for (const partId of group.partIds) {
				const fragment = byId.get(partId);
				const meta = expandedById.get(partId);

				if (typeof fragment !== "string" || !meta) {
					continue;
				}

				translation += fragment;

				if (meta.joiner) {
					translation += meta.joiner;
				}
			}

			merged.push({
				id: item.id,
				kind: item.kind || "paragraph",
				translation: unmaskProtectedFragments(
					translation.trim(),
					group.protectedFragments,
				),
				protectedFragments: collectPreservedFragments(group.protectedFragments),
			});
		}

		return merged;
	}

	const api = {
		DEFAULT_MAX_BATCH_CHARS,
		DEFAULT_MAX_CONCURRENCY,
		buildResponsesRequest,
		buildTranslationInput,
		clearTranslationCache,
		chunkTranslationItems,
		createRecursiveChunkPlan,
		extractOutputText,
		maskProtectedFragments,
		mergeRecursiveTranslations,
		parseTranslationResponse,
		consumeProgressiveTranslations,
		createProgressiveMergeState,
		requestTranslations,
		requestTranslationsBatched,
		requestTranslationsBatchedProgressive,
		splitTextRecursively,
		stripCodeFences,
		unmaskProtectedFragments,
		validateProtectedFragments,
		getIncompleteSegmentIds,
	};

	root.TranslatorApi = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
