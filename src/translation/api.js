import CacheApi from "./cache.js";
import ChunkPlan from "./chunk-plan.js";
import ProtectedFragments from "./protected-fragments.js";
import ResponsesApi from "./responses.js";

const DEFAULT_MAX_BATCH_CHARS = 5000;
const DEFAULT_MAX_CONCURRENCY = 5;
const translationCache = CacheApi.createTranslationCache();
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
const consumeProgressiveTranslations = ChunkPlan.consumeProgressiveTranslations;
const mergeRecursiveTranslations = ChunkPlan.mergeRecursiveTranslations;
const getIncompleteSegmentIds = ChunkPlan.getIncompleteSegmentIds;
const buildResponsesRequest = ResponsesApi.buildResponsesRequest;
const buildTranslationInput = ResponsesApi.buildTranslationInput;
const callResponsesApi = ResponsesApi.callResponsesApi;
const estimateTokenCount = ResponsesApi.estimateTokenCount;
const extractOutputText = ResponsesApi.extractOutputText;
const parseTranslationResponse = ResponsesApi.parseTranslationResponse;
const stripCodeFences = ResponsesApi.stripCodeFences;
const validateProtectedFragments =
	ProtectedFragments.validateProtectedFragments;
async function requestTranslations(options) {
	const settings = options.settings;
	const items = options.items || [];
	const fetchImpl = options.fetchImpl || globalThis.fetch;

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
			/Response JSON|Unexpected token|missing id|duplicate id|unknown id|parsed output|translations array|Protected placeholder/i.test(
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

	translationCache.cacheTranslations(settings, missingItems, freshTranslations);

	return mergeTranslationsInItemOrder(
		items,
		cachedTranslations.concat(freshTranslations),
	);
}

async function requestTranslationsBatched(options) {
	const settings = options.settings;
	const chunks = options.chunks || [];
	const fetchImpl = options.fetchImpl || globalThis.fetch;
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
	const fetchImpl = options.fetchImpl || globalThis.fetch;
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

export {
	buildResponsesRequest,
	buildTranslationInput,
	chunkTranslationItems,
	clearTranslationCache,
	consumeProgressiveTranslations,
	createProgressiveMergeState,
	createRecursiveChunkPlan,
	DEFAULT_MAX_BATCH_CHARS,
	DEFAULT_MAX_CONCURRENCY,
	estimateTokenCount,
	extractOutputText,
	getIncompleteSegmentIds,
	maskProtectedFragments,
	mergeRecursiveTranslations,
	parseTranslationResponse,
	requestTranslations,
	requestTranslationsBatched,
	requestTranslationsBatchedProgressive,
	splitTextRecursively,
	stripCodeFences,
	unmaskProtectedFragments,
	validateProtectedFragments,
};
export default api;
