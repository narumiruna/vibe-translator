import assert from "node:assert/strict";
import { test } from "vitest";

import {
	ChromeCredentialStore,
	CREDENTIALS_KEY,
} from "../src/auth/credential-store.js";

class MemoryStorage {
	values = {};

	async get(key) {
		if (typeof key === "string") {
			return { [key]: this.values[key] };
		}
		return { ...this.values };
	}

	async set(items) {
		Object.assign(this.values, structuredClone(items));
	}

	async remove(key) {
		for (const item of Array.isArray(key) ? key : [key]) {
			delete this.values[item];
		}
	}
}

test("Chrome credential store serializes provider writes and hides secrets from list", async () => {
	const area = new MemoryStorage();
	const first = new ChromeCredentialStore(area, null);
	const second = new ChromeCredentialStore(area, null);
	let releaseFirst;
	let markEntered;
	const entered = new Promise((resolve) => {
		markEntered = resolve;
	});
	const gate = new Promise((resolve) => {
		releaseFirst = resolve;
	});

	const firstWrite = first.modify("first", async () => {
		markEntered();
		await gate;
		return { type: "api_key", key: "first-secret" };
	});
	await entered;
	const secondWrite = second.modify("second", async () => ({
		type: "oauth",
		access: "access-secret",
		refresh: "refresh-secret",
		expires: Date.now() + 1000,
	}));
	releaseFirst();
	await Promise.all([firstWrite, secondWrite]);

	assert.deepEqual(await first.list(), [
		{ providerId: "first", type: "api_key" },
		{ providerId: "second", type: "oauth" },
	]);
	assert.equal((await first.read("first")).key, "first-secret");
	await first.delete("first");
	await first.delete("second");
	assert.equal(area.values[CREDENTIALS_KEY], undefined);
});

test("Chrome credential store ignores malformed persisted values", async () => {
	const area = new MemoryStorage();
	area.values[CREDENTIALS_KEY] = {
		valid: { type: "api_key", key: "secret" },
		invalid: { type: "oauth", access: "missing-fields" },
	};
	const store = new ChromeCredentialStore(area, null);

	assert.deepEqual(await store.list(), [
		{ providerId: "valid", type: "api_key" },
	]);
	assert.equal(await store.read("invalid"), undefined);
});
