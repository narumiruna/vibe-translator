import assert from "node:assert/strict";
import test from "node:test";

import { createBackgroundController } from "../src/background/controller.js";
import Messages from "../src/shared/messages.js";

function createController() {
	const chrome = {
		runtime: {
			getManifest() {
				return { version: "0.1.3" };
			},
			id: "trusted-extension-id",
		},
	};
	const pageTranslationQueue = {
		enqueue() {},
		get() {},
		getTranslatedCount() {
			return 0;
		},
		markTranslated() {},
		remove() {},
	};

	return createBackgroundController({
		chrome,
		Api: {},
		Messages,
		Settings: {},
		SiteProfiles: {},
		logger: {
			debug() {},
			error() {},
			info() {},
		},
		TranslationSession: {
			createPageTranslationQueue() {
				return pageTranslationQueue;
			},
		},
		platform: {},
	});
}

test("background controller rejects messages without the extension sender id", async () => {
	const controller = createController();

	assert.deepEqual(
		await controller.handleRuntimeMessage(Messages.getRuntimeHealth(), {}),
		{ ok: false, error: "Untrusted message sender." },
	);
	assert.deepEqual(
		await controller.handleRuntimeMessage(Messages.getRuntimeHealth(), {
			id: "other-extension-id",
		}),
		{ ok: false, error: "Untrusted message sender." },
	);
});

test("background controller accepts health checks from this extension", async () => {
	const controller = createController();

	assert.deepEqual(
		await controller.handleRuntimeMessage(Messages.getRuntimeHealth(), {
			id: "trusted-extension-id",
		}),
		{ ok: true, component: "background", version: "0.1.3" },
	);
});
