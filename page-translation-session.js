((root) => {
	const DEFAULT_CONCURRENCY = 5;
	const DEFAULT_BATCH_SIZE = 8;

	function createSessionId() {
		return `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function normalizePositiveInteger(value, fallback) {
		const number = Math.floor(Number(value));

		return Number.isFinite(number) && number > 0 ? number : fallback;
	}

	function createPageTranslationQueue(options = {}) {
		const concurrency = normalizePositiveInteger(
			options.concurrency,
			DEFAULT_CONCURRENCY,
		);
		const batchSize = normalizePositiveInteger(
			options.batchSize,
			DEFAULT_BATCH_SIZE,
		);
		const processBatch =
			typeof options.processBatch === "function"
				? options.processBatch
				: async () => {};
		const onError =
			typeof options.onError === "function" ? options.onError : () => {};
		const sessions = new Map();

		function create(tabId, settings) {
			const session = {
				tabId,
				sessionId: createSessionId(),
				settings,
				pendingItems: [],
				pendingIds: new Set(),
				translatedIds: new Set(),
				inFlightCount: 0,
			};

			sessions.set(tabId, session);

			return session;
		}

		function get(tabId, sessionId) {
			const session = sessions.get(tabId);

			if (!session) {
				return null;
			}

			if (sessionId && session.sessionId !== sessionId) {
				return null;
			}

			return session;
		}

		function remove(tabId) {
			sessions.delete(tabId);
		}

		function markTranslated(tabId, sessionId, ids) {
			const session = get(tabId, sessionId);

			if (!session) {
				return 0;
			}

			let count = 0;

			for (const id of ids || []) {
				if (typeof id !== "string") {
					continue;
				}

				if (!session.translatedIds.has(id)) {
					count += 1;
				}

				session.translatedIds.add(id);
			}

			return count;
		}

		function continueProcessing(tabId, sessionId) {
			const session = get(tabId, sessionId);

			if (!session) {
				return;
			}

			while (
				session.pendingItems.length > 0 &&
				session.inFlightCount < concurrency
			) {
				const items = session.pendingItems.splice(0, batchSize);

				if (items.length === 0) {
					break;
				}

				session.inFlightCount += 1;

				Promise.resolve(
					processBatch({
						tabId,
						sessionId,
						items,
						session,
					}),
				)
					.catch((error) => {
						onError(error, {
							tabId,
							sessionId,
							items,
						});
					})
					.finally(() => {
						const currentSession = get(tabId, sessionId);

						if (!currentSession) {
							return;
						}

						for (const item of items) {
							currentSession.pendingIds.delete(item.id);
						}

						currentSession.inFlightCount = Math.max(
							0,
							currentSession.inFlightCount - 1,
						);

						continueProcessing(tabId, sessionId);
					});
			}
		}

		function enqueue(tabId, sessionId, items) {
			const session = get(tabId, sessionId);

			if (!session) {
				return { queued: 0 };
			}

			const queuedItems = [];

			for (const item of items || []) {
				if (
					!item ||
					typeof item.id !== "string" ||
					session.pendingIds.has(item.id)
				) {
					continue;
				}

				session.pendingIds.add(item.id);
				queuedItems.push(item);
			}

			if (queuedItems.length > 0) {
				session.pendingItems = queuedItems.concat(session.pendingItems);
				continueProcessing(tabId, session.sessionId);
			}

			return { queued: queuedItems.length };
		}

		return {
			create,
			enqueue,
			get,
			markTranslated,
			remove,
		};
	}

	const api = {
		createPageTranslationQueue,
	};

	root.TranslatorPageTranslationQueue = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
