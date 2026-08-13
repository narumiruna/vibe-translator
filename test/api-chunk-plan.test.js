import assert from "node:assert/strict";
import test from "node:test";

import {
	chunkTranslationItems,
	consumeProgressiveTranslations,
	createProgressiveMergeState,
	createRecursiveChunkPlan,
	mergeRecursiveTranslations,
	splitTextRecursively,
} from "../src/translation/chunk-plan.js";

test("chunk plan chunks items by character limit", () => {
	const chunks = chunkTranslationItems(
		[
			{ id: "a", text: "1234" },
			{ id: "b", text: "1234" },
			{ id: "c", text: "1234" },
		],
		8,
	);

	assert.deepEqual(
		chunks.map((chunk) => chunk.map((item) => item.id)),
		[["a", "b"], ["c"]],
	);
});

test("chunk plan splits oversized text and merges translations", () => {
	const parts = splitTextRecursively(
		"alpha beta gamma delta epsilon zeta eta theta",
		12,
	);

	assert.ok(parts.length > 1);
	assert.ok(parts.every((part) => part.text.length <= 12));

	const plan = createRecursiveChunkPlan(
		[
			{
				id: "long",
				kind: "paragraph",
				text: "First sentence. Second sentence. Third sentence.",
			},
		],
		20,
	);
	const merged = mergeRecursiveTranslations(
		plan,
		plan.expandedItems.map((item) => ({
			id: item.id,
			translation: `[${item.text}]`,
		})),
	);

	assert.equal(merged.length, 1);
	assert.equal(merged[0].id, "long");
	assert.equal(
		merged[0].sourceText,
		"First sentence. Second sentence. Third sentence.",
	);
	assert.match(merged[0].translation, /^\[First sentence\./);
	assert.match(merged[0].translation, /Third sentence\.\]$/);
});

test("chunk plan progressive merge waits until all parts are available", () => {
	const plan = createRecursiveChunkPlan(
		[
			{
				id: "long",
				kind: "paragraph",
				text: "First sentence. Second sentence. Third sentence.",
			},
		],
		20,
	);
	const state = createProgressiveMergeState(plan);
	const [firstPart, ...remainingParts] = plan.expandedItems;

	assert.deepEqual(
		consumeProgressiveTranslations(plan, state, [
			{ id: firstPart.id, translation: firstPart.text },
		]),
		[],
	);

	const completed = consumeProgressiveTranslations(
		plan,
		state,
		remainingParts.map((item) => ({ id: item.id, translation: item.text })),
	);

	assert.equal(completed.length, 1);
	assert.equal(completed[0].id, "long");
	assert.equal(
		completed[0].sourceText,
		"First sentence. Second sentence. Third sentence.",
	);
});
