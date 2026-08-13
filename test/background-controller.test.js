import assert from "node:assert/strict";
import test from "node:test";

import { createBackgroundController } from "../src/background/controller.js";
import Messages from "../src/shared/messages.js";

function createController(options = {}) {
	const chrome = {
		runtime: {
			getManifest() {
				return { version: "0.1.3" };
			},
			id: "trusted-extension-id",
		},
	};
	const pageTranslationQueue =
		options.pageTranslationQueue ||
		Object.freeze({
			enqueue() {},
			get() {},
			getTranslatedCount() {
				return 0;
			},
			markTranslated() {},
			remove() {},
		});

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
		platform: {
			buildDebugPayload(settings) {
				return {
					debug: { enabled: Boolean(settings?.showTranslationDebugInfo) },
				};
			},
			buildTranslationAppearancePayload(settings) {
				return {
					translationAppearance: settings?.translationAppearance,
				};
			},
		},
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

test("background controller returns an active frame session for content reinjection", async () => {
	const session = {
		sessionId: "page-session",
		settings: {
			showTranslationDebugInfo: true,
			targetLanguage: "French",
			translationAppearance: { preset: "minimal" },
		},
	};
	const requestedSessions = [];
	const controller = createController({
		pageTranslationQueue: {
			enqueue() {},
			get(tabId, sessionId, frameId) {
				requestedSessions.push({ tabId, sessionId, frameId });
				return session;
			},
			getTranslatedCount() {
				return 0;
			},
			markTranslated() {},
			remove() {},
		},
	});

	assert.deepEqual(
		await controller.handleRuntimeMessage(
			Messages.getPageTranslationSession(),
			{
				id: "trusted-extension-id",
				tab: { id: 17 },
				frameId: 3,
			},
		),
		{
			ok: true,
			active: true,
			sessionId: "page-session",
			targetLanguage: "French",
			translationAppearance: session.settings.translationAppearance,
			debug: { enabled: true },
		},
	);
	assert.deepEqual(requestedSessions, [
		{ tabId: 17, sessionId: undefined, frameId: 3 },
	]);
});

test("background controller reports no reinjection session without a sender tab", async () => {
	const controller = createController();

	assert.deepEqual(
		await controller.handleRuntimeMessage(
			Messages.getPageTranslationSession(),
			{
				id: "trusted-extension-id",
			},
		),
		{ ok: true, active: false },
	);
});
