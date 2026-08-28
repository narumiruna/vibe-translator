import assert from "node:assert/strict";
import test from "node:test";

import TranslatorMessages from "../src/shared/messages.js";

test("message builders use shared message types", () => {
	assert.deepEqual(TranslatorMessages.ping(), {
		type: TranslatorMessages.MESSAGE_TYPES.PING,
	});
	assert.deepEqual(
		TranslatorMessages.automationOpenPdf({
			pageUrl: "https://example.com/a.pdf",
		}),
		{
			type: TranslatorMessages.MESSAGE_TYPES.AUTOMATION_OPEN_PDF,
			payload: { pageUrl: "https://example.com/a.pdf" },
		},
	);
	assert.deepEqual(TranslatorMessages.startYoutubeSubtitleTranslation(), {
		type: TranslatorMessages.MESSAGE_TYPES.START_YOUTUBE_SUBTITLE_TRANSLATION,
	});
	assert.deepEqual(
		TranslatorMessages.prefetchYoutubeSubtitles({
			currentTimeMs: 12000,
			playbackRate: 2,
			reason: "ratechange",
		}),
		{
			type: TranslatorMessages.MESSAGE_TYPES.PREFETCH_YOUTUBE_SUBTITLES,
			payload: {
				currentTimeMs: 12000,
				playbackRate: 2,
				reason: "ratechange",
			},
		},
	);
	assert.deepEqual(TranslatorMessages.openOptions(), {
		type: TranslatorMessages.MESSAGE_TYPES.OPEN_OPTIONS,
	});
	assert.deepEqual(TranslatorMessages.getPageTranslationSession(), {
		type: TranslatorMessages.MESSAGE_TYPES.GET_PAGE_TRANSLATION_SESSION,
	});
	assert.equal(
		TranslatorMessages.MESSAGE_TYPES.RENDER_YOUTUBE_DIAGNOSTIC_EVENT,
		"render-youtube-diagnostic-event",
	);
	assert.deepEqual(
		TranslatorMessages.renderYoutubeDiagnosticEvent({
			stage: "api-error",
			detail: "Request failed",
		}),
		{
			type: TranslatorMessages.MESSAGE_TYPES.RENDER_YOUTUBE_DIAGNOSTIC_EVENT,
			payload: { stage: "api-error", detail: "Request failed" },
		},
	);
	assert.deepEqual(TranslatorMessages.showToast({ message: "Saved" }), {
		type: TranslatorMessages.MESSAGE_TYPES.SHOW_TOAST,
		payload: { message: "Saved" },
	});
	assert.deepEqual(
		TranslatorMessages.queuePageTranslationItems({
			sessionId: "session",
			items: [{ id: "a" }],
		}),
		{
			type: TranslatorMessages.MESSAGE_TYPES.QUEUE_PAGE_TRANSLATION_ITEMS,
			payload: {
				sessionId: "session",
				items: [{ id: "a" }],
			},
		},
	);
	assert.deepEqual(TranslatorMessages.clearSelectionTranslation(), {
		type: TranslatorMessages.MESSAGE_TYPES.CLEAR_SELECTION_TRANSLATION,
	});
	assert.deepEqual(
		TranslatorMessages.renderSelectionError({
			requestId: "selection-1",
			error: "Unavailable",
		}),
		{
			type: TranslatorMessages.MESSAGE_TYPES.RENDER_SELECTION_ERROR,
			payload: {
				requestId: "selection-1",
				error: "Unavailable",
			},
		},
	);
	assert.deepEqual(
		TranslatorMessages.retrySelectionTranslation({ sourceText: "Hello" }),
		{
			type: TranslatorMessages.MESSAGE_TYPES.RETRY_SELECTION_TRANSLATION,
			payload: { sourceText: "Hello" },
		},
	);
});
