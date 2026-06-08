const test = require("node:test");
const assert = require("node:assert/strict");

const TranslatorMessages = require("../translator-messages.js");

test("message builders use shared message types", () => {
	assert.deepEqual(TranslatorMessages.ping(), {
		type: TranslatorMessages.MESSAGE_TYPES.PING,
	});
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
});
