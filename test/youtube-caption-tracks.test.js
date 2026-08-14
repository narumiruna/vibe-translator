import assert from "node:assert/strict";
import test from "node:test";

import { resolveYoutubeCaptionTracks } from "../src/background/youtube-caption-tracks.js";

function track(languageCode, options = {}) {
	return {
		baseUrl: options.baseUrl || "",
		kind: options.kind || "",
		languageCode,
	};
}

test("caption track resolver prefers the selected current player-response track", () => {
	assert.deepEqual(
		resolveYoutubeCaptionTracks({
			currentVideoId: "current",
			initialResponse: {
				tracks: [track("fr", { baseUrl: "https://www.youtube.com/initial" })],
				videoId: "current",
			},
			playerOption: {
				tracks: [track("de", { baseUrl: "https://www.youtube.com/option" })],
			},
			playerResponse: {
				tracks: [
					track("es", { baseUrl: "https://www.youtube.com/es" }),
					track("en", {
						baseUrl: "https://www.youtube.com/en",
						kind: "asr",
					}),
				],
				videoId: "current",
			},
			selectedTrack: track("en", { kind: "asr" }),
		}),
		{
			hasTrack: true,
			trackBaseUrl: "https://www.youtube.com/en",
			trackCount: 2,
			trackSource: "player-response",
			timedTrackAvailable: true,
		},
	);
});

test("caption track resolver ignores stale and malformed response sources", () => {
	assert.deepEqual(
		resolveYoutubeCaptionTracks({
			currentVideoId: "current",
			initialResponse: {
				tracks: [track("en", { baseUrl: "https://www.youtube.com/stale" })],
				videoId: "old",
			},
			playerOption: { tracks: null },
			playerResponse: { tracks: [{ languageCode: "en" }], videoId: "current" },
			selectedTrack: track("en"),
		}),
		{
			hasTrack: true,
			trackBaseUrl: "",
			trackCount: 1,
			trackSource: "player-response",
			timedTrackAvailable: false,
		},
	);
});

test("caption track resolver falls back across direct and option sources", () => {
	assert.deepEqual(
		resolveYoutubeCaptionTracks({
			currentVideoId: "current",
			initialResponse: {
				tracks: [track("ja", { baseUrl: "https://www.youtube.com/initial" })],
				videoId: "current",
			},
			playerOption: {
				tracks: [track("en", { baseUrl: "https://www.youtube.com/option" })],
			},
			playerResponse: { tracks: [], videoId: "current" },
			selectedTrack: track("en"),
		}),
		{
			hasTrack: true,
			trackBaseUrl: "https://www.youtube.com/option",
			trackCount: 1,
			trackSource: "player-option",
			timedTrackAvailable: true,
		},
	);
	assert.deepEqual(resolveYoutubeCaptionTracks(), {
		hasTrack: false,
		trackBaseUrl: "",
		trackCount: 0,
		trackSource: "none",
		timedTrackAvailable: false,
	});
});
