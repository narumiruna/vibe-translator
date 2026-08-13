const MESSAGE_TYPES = Object.freeze({
	AUTOMATION_TRANSLATE_PAGE: "automation-translate-page",
	AUTOMATION_TRANSLATE_SELECTION: "automation-translate-selection",
	GET_RUNTIME_HEALTH: "get-runtime-health",
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
	RENDER_YOUTUBE_DIAGNOSTIC_EVENT: "render-youtube-diagnostic-event",
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
	automationTranslatePage(payload) {
		return createMessage(MESSAGE_TYPES.AUTOMATION_TRANSLATE_PAGE, payload);
	},
	automationTranslateSelection(payload) {
		return createMessage(MESSAGE_TYPES.AUTOMATION_TRANSLATE_SELECTION, payload);
	},
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
	getRuntimeHealth() {
		return createMessage(MESSAGE_TYPES.GET_RUNTIME_HEALTH);
	},
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
	renderYoutubeDiagnosticEvent(payload) {
		return createMessage(
			MESSAGE_TYPES.RENDER_YOUTUBE_DIAGNOSTIC_EVENT,
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
		return createMessage(MESSAGE_TYPES.START_PAGE_TRANSLATION_SESSION, payload);
	},
	startYoutubeSubtitleTranslation() {
		return createMessage(MESSAGE_TYPES.START_YOUTUBE_SUBTITLE_TRANSLATION);
	},
};

export { MESSAGE_TYPES, createMessage };
export default api;
