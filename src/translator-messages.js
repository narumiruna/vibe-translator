((root) => {
	const MESSAGE_TYPES = Object.freeze({
		CLEAR_PAGE_PLACEHOLDERS: "clear-page-placeholders",
		CLEAR_PENDING_TRANSLATIONS: "clear-pending-translations",
		CLEAR_SELECTION_TRANSLATION: "clear-selection-translation",
		EXTRACT_PAGE_CONTENT: "extract-page-content",
		GET_SELECTION_ANCHOR: "get-selection-anchor",
		OPEN_OPTIONS: "open-options",
		PING: "ping",
		QUEUE_PAGE_TRANSLATION_ITEMS: "queue-page-translation-items",
		RENDER_PAGE_PLACEHOLDERS: "render-page-placeholders",
		RENDER_PAGE_TRANSLATION_UPDATES: "render-page-translation-updates",
		RENDER_PAGE_TRANSLATIONS: "render-page-translations",
		RENDER_SELECTION_ERROR: "render-selection-error",
		RENDER_SELECTION_PLACEHOLDER: "render-selection-placeholder",
		RENDER_SELECTION_TRANSLATION: "render-selection-translation",
		RETRY_SELECTION_TRANSLATION: "retry-selection-translation",
		SHOW_TOAST: "show-toast",
		START_PAGE_TRANSLATION_SESSION: "start-page-translation-session",
		START_YOUTUBE_SUBTITLE_TRANSLATION: "start-youtube-subtitle-translation",
		TEST_CONNECTION: "test-connection",
	});

	function createMessage(type, payload) {
		const message = { type };

		if (payload !== undefined) {
			message.payload = payload;
		}

		return message;
	}

	const api = {
		MESSAGE_TYPES,
		clearPagePlaceholders(payload) {
			return createMessage(MESSAGE_TYPES.CLEAR_PAGE_PLACEHOLDERS, payload);
		},
		clearPendingTranslations() {
			return createMessage(MESSAGE_TYPES.CLEAR_PENDING_TRANSLATIONS);
		},
		clearSelectionTranslation() {
			return createMessage(MESSAGE_TYPES.CLEAR_SELECTION_TRANSLATION);
		},
		createMessage,
		openOptions() {
			return createMessage(MESSAGE_TYPES.OPEN_OPTIONS);
		},
		ping() {
			return createMessage(MESSAGE_TYPES.PING);
		},
		queuePageTranslationItems(payload) {
			return createMessage(MESSAGE_TYPES.QUEUE_PAGE_TRANSLATION_ITEMS, payload);
		},
		renderPagePlaceholders(payload) {
			return createMessage(MESSAGE_TYPES.RENDER_PAGE_PLACEHOLDERS, payload);
		},
		renderPageTranslationUpdates(payload) {
			return createMessage(
				MESSAGE_TYPES.RENDER_PAGE_TRANSLATION_UPDATES,
				payload,
			);
		},
		renderSelectionError(payload) {
			return createMessage(MESSAGE_TYPES.RENDER_SELECTION_ERROR, payload);
		},
		renderSelectionPlaceholder(payload) {
			return createMessage(MESSAGE_TYPES.RENDER_SELECTION_PLACEHOLDER, payload);
		},
		renderSelectionTranslation(payload) {
			return createMessage(MESSAGE_TYPES.RENDER_SELECTION_TRANSLATION, payload);
		},
		retrySelectionTranslation(payload) {
			return createMessage(MESSAGE_TYPES.RETRY_SELECTION_TRANSLATION, payload);
		},
		showToast(payload) {
			return createMessage(MESSAGE_TYPES.SHOW_TOAST, payload);
		},
		startPageTranslationSession(payload) {
			return createMessage(
				MESSAGE_TYPES.START_PAGE_TRANSLATION_SESSION,
				payload,
			);
		},
		startYoutubeSubtitleTranslation() {
			return createMessage(MESSAGE_TYPES.START_YOUTUBE_SUBTITLE_TRANSLATION);
		},
	};

	root.TranslatorMessages = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
