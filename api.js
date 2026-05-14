((root) => {
	const DEFAULT_MAX_BATCH_CHARS = 5000;
	const DEFAULT_MAX_CONCURRENCY = 5;
	const ChunkPlan = root.TranslatorApiChunkPlan;
	const ProtectedFragments = root.TranslatorProtectedFragments;
	const translationCache = root.TranslatorApiCache.createTranslationCache();
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
							translatedText: { type: "string" },
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
	function clearTranslationCache() {
		translationCache.clear();
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

	const maskProtectedFragments = ProtectedFragments.maskProtectedFragments;
	const unmaskProtectedFragments = ProtectedFragments.unmaskProtectedFragments;
	const chunkTranslationItems = ChunkPlan.chunkTranslationItems;
	const createRecursiveChunkPlan = ChunkPlan.createRecursiveChunkPlan;
	const splitTextRecursively = ChunkPlan.splitTextRecursively;
	const createProgressiveMergeState = ChunkPlan.createProgressiveMergeState;
	const consumeProgressiveTranslations =
		ChunkPlan.consumeProgressiveTranslations;
	const mergeRecursiveTranslations = ChunkPlan.mergeRecursiveTranslations;
	const getIncompleteSegmentIds = ChunkPlan.getIncompleteSegmentIds;
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

	const validateProtectedFragments =
		ProtectedFragments.validateProtectedFragments;
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

		const { cachedTranslations, missingItems } =
			translationCache.splitItemsByCache(settings, items);

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

		translationCache.cacheTranslations(
			settings,
			missingItems,
			freshTranslations,
		);

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
		estimateTokenCount,
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
