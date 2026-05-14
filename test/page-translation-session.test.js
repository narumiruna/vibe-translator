const test = require("node:test");
const assert = require("node:assert/strict");

const {
	createPageTranslationQueue,
} = require("../page-translation-session.js");

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

test("page translation queue ignores stale session ids", () => {
	const queue = createPageTranslationQueue();
	const session = queue.create(3, {});

	assert.equal(queue.get(3, "stale"), null);
	assert.deepEqual(queue.enqueue(3, "stale", [{ id: "a" }]), { queued: 0 });
	assert.equal(queue.get(3, session.sessionId), session);
});

test("page translation queue records translated ids", () => {
	const queue = createPageTranslationQueue();
	const session = queue.create(4, {});

	assert.equal(queue.markTranslated(4, session.sessionId, ["a", "b"]), 2);
	assert.equal(queue.markTranslated(4, session.sessionId, ["a", "c"]), 1);
	assert.deepEqual([...session.translatedIds].sort(), ["a", "b", "c"]);
});
