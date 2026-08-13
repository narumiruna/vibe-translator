import assert from "node:assert/strict";
import test from "node:test";

import { createYoutubeRuntime } from "../src/content/youtube/runtime.js";
import SubtitleApi from "../src/content/youtube/subtitles.js";
import TimedCaptionApi from "../src/content/youtube/timed-captions.js";
import Messages from "../src/shared/messages.js";

test("YouTube runtime refills prefetch after ten seconds and immediately on seek", () => {
	const listeners = new Map();
	const sent = [];
	const video = {
		currentTime: 5,
		addEventListener(type, listener) {
			listeners.set(type, listener);
		},
		removeEventListener(type) {
			listeners.delete(type);
		},
	};
	const pageState = {
		pageTranslation: {},
		youtubeControl: {
			lastPrefetchTimeMs: 0,
			prefetchVideo: null,
		},
		youtubeDiagnostics: { panel: null },
		youtubeSubtitleTranslations: new Map(),
	};
	const runtime = createYoutubeRuntime({
		chrome: {
			runtime: {
				sendMessage(message) {
					sent.push(message);
					return Promise.resolve({ ok: true });
				},
			},
		},
		document: {
			querySelector(selector) {
				return selector.includes("video") ? video : null;
			},
		},
		Messages,
		pageState,
		SubtitleApi,
		TimedCaptionApi,
		window: {},
	});

	assert.equal(runtime.bindYoutubePrefetchTracking(), true);
	video.currentTime = 14;
	listeners.get("timeupdate")();
	assert.equal(sent.length, 0);
	video.currentTime = 15;
	listeners.get("timeupdate")();
	assert.deepEqual(
		sent.at(-1),
		Messages.prefetchYoutubeSubtitles({ currentTimeMs: 15000 }),
	);
	video.currentTime = 42;
	listeners.get("seeking")();
	assert.deepEqual(
		sent.at(-1),
		Messages.prefetchYoutubeSubtitles({ currentTimeMs: 42000 }),
	);
});
