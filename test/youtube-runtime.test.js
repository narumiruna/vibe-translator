import assert from "node:assert/strict";
import test from "node:test";

import YoutubeDiagnosticsApi from "../src/content/youtube/diagnostics.js";
import YoutubePlayerControlApi from "../src/content/youtube/player-control.js";
import { createYoutubeRuntime } from "../src/content/youtube/runtime.js";
import SubtitleApi from "../src/content/youtube/subtitles.js";
import TimedCaptionApi from "../src/content/youtube/timed-captions.js";
import Messages from "../src/shared/messages.js";

test("YouTube runtime coalesces progressive fallbacks and recovers caption timeouts", () => {
	const events = [];
	let scheduled = 0;
	let sourceId = "ot-a";
	let sourceText = "Build";
	const buttonAttributes = new Map([["data-state", "error"]]);
	const button = {
		disabled: false,
		setAttribute(name, value) {
			buttonAttributes.set(name, value);
		},
	};
	const source = {
		getAttribute(name) {
			return name === "data-ot-source-id" ? sourceId : null;
		},
		get textContent() {
			return sourceText;
		},
	};
	const video = { currentTime: 1.5, playbackRate: 1 };
	const document = {
		querySelector(selector) {
			return selector === "#movie_player video" ? video : null;
		},
		querySelectorAll(selector) {
			return selector === YoutubeDiagnosticsApi.CAPTION_SEGMENT_SELECTOR
				? [source]
				: [];
		},
	};
	const pageState = {
		pageTranslation: {},
		youtubeControl: {
			button,
			errorReason: "caption-timeout",
			state: "error",
		},
		youtubeDiagnostics: {
			captionTrace: YoutubeDiagnosticsApi.createCaptionTraceStore(),
			panel: null,
			status: "",
			store: {
				add(stage, detail) {
					events.push({ stage, detail });
				},
				getEvents() {
					return events;
				},
			},
		},
		youtubeSubtitleTranslations: new Map(),
	};
	const runtime = createYoutubeRuntime({
		chrome: { runtime: { getManifest: () => ({ version: "test" }) } },
		document,
		Messages,
		pageState,
		scheduleVisibleTranslation() {
			scheduled += 1;
		},
		SubtitleApi,
		TimedCaptionApi,
		window: { location: {} },
		YoutubeDiagnosticsApi,
		YoutubePlayerControlApi,
	});

	runtime.applyYoutubeControlState(button, "error");
	assert.equal(pageState.youtubeControl.errorReason, "caption-timeout");
	assert.deepEqual(
		runtime
			.matchYoutubeCaptionItems([
				{ id: "ot-a", kind: "subtitle", text: "Build" },
			])
			.missing.map((item) => item.id),
		["ot-a"],
	);
	assert.equal(buttonAttributes.get("data-state"), "active");
	assert.equal(pageState.youtubeControl.errorReason, "");

	sourceId = "ot-b";
	sourceText = "Build reliable";
	assert.deepEqual(
		runtime.matchYoutubeCaptionItems([
			{ id: "ot-b", kind: "subtitle", text: "Build reliable" },
		]).missing,
		[],
	);
	assert.deepEqual(runtime.settleYoutubeCaptionFallbacks([{ id: "ot-a" }]), {
		settledIds: new Set(["ot-a"]),
		supersededIds: new Set(["ot-a"]),
	});
	assert.equal(scheduled, 1);
	assert.deepEqual(
		runtime
			.matchYoutubeCaptionItems([
				{ id: "ot-b", kind: "subtitle", text: "Build reliable" },
			])
			.missing.map((item) => item.id),
		["ot-b"],
	);
	runtime.settleYoutubeCaptionFallbacks(["ot-b"]);
	sourceId = "ot-c";
	sourceText = "Build reliable tools";
	assert.deepEqual(
		runtime
			.matchYoutubeCaptionItems([
				{ id: "ot-c", kind: "subtitle", text: "Build reliable tools" },
			])
			.missing.map((item) => item.id),
		["ot-c"],
	);
	runtime.resetYoutubeCaptionFallbacks();
	sourceId = "ot-d";
	assert.deepEqual(
		runtime
			.matchYoutubeCaptionItems([
				{ id: "ot-d", kind: "subtitle", text: "Build reliable tools" },
			])
			.missing.map((item) => item.id),
		["ot-d"],
	);
	assert.ok(events.some((event) => event.stage === "fallback-coalesced"));
});

test("YouTube runtime does not recover non-timeout errors", () => {
	const button = { setAttribute() {} };
	const pageState = {
		pageTranslation: {},
		youtubeControl: { button, errorReason: "fatal", state: "error" },
		youtubeDiagnostics: { panel: null },
		youtubeSubtitleTranslations: new Map(),
	};
	const runtime = createYoutubeRuntime({
		chrome: { runtime: { getManifest: () => ({ version: "test" }) } },
		document: { querySelectorAll: () => [{ textContent: "Visible" }] },
		Messages,
		pageState,
		SubtitleApi,
		TimedCaptionApi,
		window: { location: {} },
		YoutubeDiagnosticsApi,
		YoutubePlayerControlApi,
	});

	assert.equal(runtime.recoverYoutubeCaptionTimeout(), false);
	assert.equal(pageState.youtubeControl.state, "error");
});

test("YouTube runtime reports rate-aware progress, seeks, and rate changes", () => {
	const listeners = new Map();
	const sent = [];
	const video = {
		currentTime: 5,
		playbackRate: 1.5,
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
		Messages.prefetchYoutubeSubtitles({
			currentTimeMs: 15000,
			playbackRate: 1.5,
			reason: "progress",
		}),
	);
	video.currentTime = 42;
	listeners.get("seeking")();
	assert.deepEqual(
		sent.at(-1),
		Messages.prefetchYoutubeSubtitles({
			currentTimeMs: 42000,
			playbackRate: 1.5,
			reason: "seek",
		}),
	);
	video.playbackRate = 2;
	listeners.get("ratechange")();
	assert.deepEqual(
		sent.at(-1),
		Messages.prefetchYoutubeSubtitles({
			currentTimeMs: 42000,
			playbackRate: 2,
			reason: "ratechange",
		}),
	);
	runtime.cleanupYoutubeRuntime();
	assert.deepEqual([...listeners.keys()], []);
});
