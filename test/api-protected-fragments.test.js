import test from "node:test";
import assert from "node:assert/strict";

import {
	maskProtectedFragments,
	unmaskProtectedFragments,
	validateProtectedFragments,
} from "../src/translation/protected-fragments.js";

test("protected fragment masking preserves code paths urls and tech terms", () => {
	const masked = maskProtectedFragments(
		"Run `npm test` in src/app/ and open https://example.com for GitHub API docs.",
	);

	assert.equal(masked.maskedText.includes("`npm test`"), false);
	assert.ok(masked.tokens.length >= 4);
	assert.equal(
		unmaskProtectedFragments(masked.maskedText, masked.tokens),
		"Run `npm test` in src/app/ and open https://example.com for GitHub API docs.",
	);
});

test("protected fragment validation rejects missing placeholders", () => {
	assert.throws(
		() =>
			validateProtectedFragments(
				[
					{
						id: "a",
						protectedFragments: [{ placeholder: "__OT_TOKEN_1__" }],
					},
				],
				[{ id: "a", translation: "missing" }],
			),
		/Protected placeholder missing/,
	);
});
