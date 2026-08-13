import assert from "node:assert/strict";
import test from "node:test";

import { createYoutubeCaptionPrefetch } from "../src/background/youtube-caption-prefetch.js";

function createFixture() {
	const enqueued = [];
	const diagnostics = [];
	const payload = {
		events: [
			{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Zero" }] },
			{ tStartMs: 30000, dDurationMs: 1000, segs: [{ utf8: "Thirty" }] },
			{ tStartMs: 59999, dDurationMs: 1000, segs: [{ utf8: "Sixty" }] },
			{ tStartMs: 60000, dDurationMs: 1000, segs: [{ utf8: "Boundary" }] },
			{ tStartMs: 90000, dDurationMs: 1000, segs: [{ utf8: "Ninety" }] },
		],
	};
	const prefetch = createYoutubeCaptionPrefetch({
		async enqueue(context) {
			enqueued.push(context);
			return { queued: context.items.length };
		},
		async fetch() {
			return {
				ok: true,
				async json() {
					return payload;
				},
			};
		},
		onDiagnostic(stage, detail) {
			diagnostics.push({ stage, detail });
		},
	});

	return { diagnostics, enqueued, prefetch };
}

test("initialization fetches JSON3 and queues the current 60-second window", async () => {
	const { diagnostics, enqueued, prefetch } = createFixture();

	assert.deepEqual(
		await prefetch.initialize({
			baseUrl: "https://www.youtube.com/api/timedtext?v=abc",
			currentTimeMs: 0,
			frameId: 0,
			sessionId: "session-1",
			tabId: 7,
		}),
		{ available: true, cueCount: 5, queued: 3 },
	);
	assert.match(enqueued[0].items[0].id, /^youtube-cue-0-0$/u);
	assert.deepEqual(
		enqueued[0].items.map((item) => item.text),
		["Zero", "Thirty", "Sixty"],
	);
	assert.equal(diagnostics.at(-1).stage, "prefetch-ready");
});

test("progress refills an overlapping window without duplicate cue IDs", async () => {
	const { enqueued, prefetch } = createFixture();

	await prefetch.initialize({
		baseUrl: "https://www.youtube.com/api/timedtext?v=abc",
		currentTimeMs: 0,
		frameId: 0,
		sessionId: "session-1",
		tabId: 7,
	});
	assert.deepEqual(
		await prefetch.update({
			currentTimeMs: 30001,
			sessionId: "session-1",
			tabId: 7,
		}),
		{ available: true, queued: 2 },
	);
	assert.deepEqual(
		enqueued[1].items.map((item) => item.text),
		["Boundary", "Ninety"],
	);
	assert.deepEqual(
		await prefetch.update({
			currentTimeMs: 31000,
			sessionId: "session-1",
			tabId: 7,
		}),
		{ available: true, queued: 0 },
	);
});

test("unavailable or malformed timed captions preserve fallback behavior", async () => {
	const diagnostics = [];
	const prefetch = createYoutubeCaptionPrefetch({
		async fetch() {
			throw new Error("timed text unavailable");
		},
		onDiagnostic(stage, detail) {
			diagnostics.push({ stage, detail });
		},
	});

	assert.deepEqual(
		await prefetch.initialize({
			baseUrl: "https://www.youtube.com/api/timedtext?v=abc",
			currentTimeMs: 0,
			sessionId: "session-1",
			tabId: 7,
		}),
		{ available: false, cueCount: 0, queued: 0 },
	);
	assert.equal(diagnostics.at(-1).stage, "prefetch-fallback");
	assert.deepEqual(
		await prefetch.initialize({
			baseUrl: "https://attacker.example/timedtext",
			currentTimeMs: 0,
			sessionId: "session-2",
			tabId: 7,
		}),
		{ available: false, cueCount: 0, queued: 0 },
	);
});
