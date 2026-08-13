import assert from "node:assert/strict";
import test from "node:test";

import {
	createPageTranslationQueue,
	shouldKeepPageTranslationSession,
} from "../src/shared/translation-session.js";

test("persistent dynamic profiles keep an empty translation session alive", () => {
	assert.equal(
		shouldKeepPageTranslationSession({
			items: [],
			keepAlive: true,
			totalSegments: 0,
		}),
		true,
	);
	assert.equal(
		shouldKeepPageTranslationSession({
			items: [],
			keepAlive: false,
			totalSegments: 0,
		}),
		false,
	);
	assert.equal(
		shouldKeepPageTranslationSession({ items: [], totalSegments: 2 }),
		true,
	);
});

function nextTick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test("page translation queue batches work with bounded concurrency", async () => {
	let active = 0;
	let maxActive = 0;
	const processedBatches = [];
	const resolvers = [];
	const queue = createPageTranslationQueue({
		concurrency: 2,
		batchSize: 2,
		processBatch({ items }) {
			active += 1;
			maxActive = Math.max(maxActive, active);
			processedBatches.push(items.map((item) => item.id));

			return new Promise((resolve) => {
				resolvers.push(() => {
					active -= 1;
					resolve();
				});
			});
		},
	});
	const session = queue.create(1, { targetLanguage: "台灣正體中文" });

	assert.deepEqual(
		queue.enqueue(1, session.sessionId, [
			{ id: "a" },
			{ id: "b" },
			{ id: "c" },
			{ id: "d" },
			{ id: "e" },
		]),
		{ queued: 5 },
	);
	await nextTick();

	assert.equal(maxActive, 2);
	assert.deepEqual(processedBatches, [
		["a", "b"],
		["c", "d"],
	]);

	resolvers.shift()();
	await nextTick();

	assert.deepEqual(processedBatches, [["a", "b"], ["c", "d"], ["e"]]);
	assert.equal(maxActive, 2);

	while (resolvers.length > 0) {
		resolvers.shift()();
		await nextTick();
	}

	assert.equal(queue.get(1, session.sessionId).inFlightCount, 0);
});

test("page translation queue deduplicates pending item ids", async () => {
	const processed = [];
	const queue = createPageTranslationQueue({
		batchSize: 10,
		processBatch({ items }) {
			processed.push(...items.map((item) => item.id));
		},
	});
	const session = queue.create(2, {});

	assert.deepEqual(
		queue.enqueue(2, session.sessionId, [
			{ id: "a" },
			{ id: "a" },
			{ id: "b" },
		]),
		{ queued: 2 },
	);
	await nextTick();

	assert.deepEqual(processed, ["a", "b"]);
});

test("page translation queue recovers after synchronous batch errors", async () => {
	const errors = [];
	const processed = [];
	const queue = createPageTranslationQueue({
		concurrency: 1,
		batchSize: 1,
		onError(error) {
			errors.push(error.message);
		},
		processBatch({ items }) {
			const id = items[0]?.id;

			if (id === "a") {
				throw new Error("sync failure");
			}

			processed.push(id);
		},
	});
	const session = queue.create(5, {});

	queue.enqueue(5, session.sessionId, [{ id: "a" }, { id: "b" }]);
	await nextTick();
	await nextTick();
	await nextTick();

	assert.deepEqual(errors, ["sync failure"]);
	assert.deepEqual(processed, ["b"]);
	assert.equal(queue.get(5, session.sessionId).inFlightCount, 0);
});

test("page translation queue ignores stale session ids", () => {
	const queue = createPageTranslationQueue();
	const session = queue.create(3, {});

	assert.equal(queue.get(3, "stale"), null);
	assert.deepEqual(queue.enqueue(3, "stale", [{ id: "a" }]), { queued: 0 });
	assert.equal(queue.get(3, session.sessionId), session);
});

test("page translation queue isolates duplicate source ids across frames", async () => {
	const processed = [];
	const queue = createPageTranslationQueue({
		processBatch({ frameId, items }) {
			processed.push({ frameId, ids: items.map((item) => item.id) });
		},
	});
	const topSession = queue.create(7, {}, 0);
	const frameSession = queue.create(7, {}, 12);

	assert.deepEqual(
		queue.enqueue(7, topSession.sessionId, [{ id: "ot-1" }], 0),
		{
			queued: 1,
		},
	);
	assert.deepEqual(
		queue.enqueue(7, frameSession.sessionId, [{ id: "ot-1" }], 12),
		{ queued: 1 },
	);
	await nextTick();

	assert.deepEqual(processed, [
		{ frameId: 0, ids: ["ot-1"] },
		{ frameId: 12, ids: ["ot-1"] },
	]);
	assert.equal(queue.get(7, topSession.sessionId, 0), topSession);
	assert.equal(queue.get(7, frameSession.sessionId, 12), frameSession);
	queue.markTranslated(7, topSession.sessionId, ["ot-1"], 0);
	queue.markTranslated(7, frameSession.sessionId, ["ot-1", "ot-2"], 12);
	assert.equal(queue.getTranslatedCount(7), 3);

	queue.remove(7, 12);
	assert.equal(queue.get(7, frameSession.sessionId, 12), null);
	assert.equal(queue.get(7, topSession.sessionId, 0), topSession);
	queue.remove(7);
	assert.equal(queue.get(7, topSession.sessionId, 0), null);
});

test("page translation queue records translated ids", () => {
	const queue = createPageTranslationQueue();
	const session = queue.create(4, {});

	assert.equal(queue.markTranslated(4, session.sessionId, ["a", "b"]), 2);
	assert.equal(queue.markTranslated(4, session.sessionId, ["a", "c"]), 1);
	assert.deepEqual([...session.translatedIds].sort(), ["a", "b", "c"]);
});

test("page translation queue does not enqueue completed timed cue ids again", () => {
	const queue = createPageTranslationQueue();
	const session = queue.create(8, {});

	queue.markTranslated(8, session.sessionId, ["youtube-cue-1000-0"]);

	assert.deepEqual(
		queue.enqueue(8, session.sessionId, [
			{ id: "youtube-cue-1000-0" },
			{ id: "youtube-cue-2000-1" },
		]),
		{ queued: 1 },
	);
});
