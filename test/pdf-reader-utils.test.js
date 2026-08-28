import assert from "node:assert/strict";
import test from "node:test";

import {
	decodeLaunchToken,
	hashText,
	sanitizeDocumentId,
} from "../src/pdf/reader-utils.js";

test("PDF reader launch tokens fail closed on malformed encoding", () => {
	assert.equal(decodeLaunchToken("#launch-token"), "launch-token");
	assert.equal(decodeLaunchToken("#%E0%A4%A"), "");
	assert.equal(decodeLaunchToken(""), "");
});

test("PDF reader document ids and source hashes are stable and bounded", () => {
	assert.equal(hashText("source"), hashText("source"));
	assert.notEqual(hashText("source"), hashText("changed"));
	assert.equal(sanitizeDocumentId("abc:def"), "dabcdef");
	assert.equal(
		sanitizeDocumentId("", () => "12345678-1234-1234-1234-123456789abc"),
		"d12345678123412341234",
	);
});
