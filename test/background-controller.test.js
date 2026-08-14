import assert from "node:assert/strict";
import test from "node:test";

import {
	buildPageTranslationRequestChunks,
	buildPageTranslationRequestConcurrency,
	createBackgroundController,
} from "../src/background/controller.js";
import { createBackgroundPlatform } from "../src/background/platform.js";
import Messages from "../src/shared/messages.js";
import Settings from "../src/shared/settings.js";
import Api from "../src/translation/api.js";

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
			buildYoutubeSubtitlePayload(settings) {
				return {
					youtubeSubtitleDisplayMode:
						Settings.normalizeYoutubeSubtitleDisplayMode(
							settings?.youtubeSubtitleDisplayMode,
						),
				};
			},
		},
	});
}

test("background controller groups short subtitle batches without changing page chunks", () => {
	const subtitles = Array.from({ length: 33 }, (_, index) => ({
		id: `caption-${index}`,
		kind: "subtitle",
		text: `Short caption ${index}`,
	}));
	let requestCount = 0;

	for (let index = 0; index < subtitles.length; index += 8) {
		const batch = subtitles.slice(index, index + 8);
		const plan = Api.createRecursiveChunkPlan(batch);
		const chunks = buildPageTranslationRequestChunks(Api, batch, plan);

		assert.equal(chunks.length, 1);
		assert.ok(chunks[0].length <= 8);
		assert.equal(buildPageTranslationRequestConcurrency(batch, chunks, 5), 1);
		requestCount += chunks.length;
	}
	assert.equal(requestCount, 5);

	const pageItems = [
		{ id: "paragraph-1", kind: "paragraph", text: "First" },
		{ id: "paragraph-2", kind: "paragraph", text: "Second" },
	];
	const pagePlan = Api.createRecursiveChunkPlan(pageItems);

	assert.equal(
		buildPageTranslationRequestChunks(Api, pageItems, pagePlan),
		pagePlan.chunks,
	);
	assert.equal(
		buildPageTranslationRequestConcurrency(pageItems, pagePlan.chunks, 5),
		2,
	);
});

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
			youtubeSubtitleDisplayMode: "bilingual",
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
			youtubeSubtitleDisplayMode: "bilingual",
			debug: { enabled: true },
		},
	);
	assert.deepEqual(requestedSessions, [
		{ tabId: 17, sessionId: undefined, frameId: 3 },
	]);
});

test("startup and render payloads carry the normalized YouTube subtitle display mode", async () => {
	const sentMessages = [];
	const settings = {
		apiKey: "sk-demo",
		baseUrl: "https://example.com/v1",
		model: "demo-model",
		targetLanguage: "French",
		userPromptTemplate: "{{sourcePayload}}",
		youtubeSubtitleDisplayMode: "bilingual",
	};
	let processBatch;
	const session = { sessionId: "page-session", settings };
	const chrome = {
		action: {
			setBadgeBackgroundColor: async () => {},
			setBadgeText: async () => {},
		},
		permissions: {
			contains: async () => true,
			request: async () => true,
		},
		runtime: {
			getManifest() {
				return {
					content_scripts: [
						{ js: ["content.js"], matches: ["*://*.youtube.com/*"] },
					],
					version: "0.1.3",
				};
			},
			id: "trusted-extension-id",
		},
		scripting: {
			executeScript: async () => [],
		},
		tabs: {
			async sendMessage(_tabId, message) {
				sentMessages.push(message);
				if (message.type === Messages.MESSAGE_TYPES.PING) {
					return { ok: true };
				}
				if (
					message.type === Messages.MESSAGE_TYPES.START_PAGE_TRANSLATION_SESSION
				) {
					return {
						items: [{ id: "caption-1", kind: "subtitle", text: "Hello" }],
						totalSegments: 1,
					};
				}
				return { ok: true };
			},
		},
	};
	const controllerSettings = {
		...Settings,
		async getSettings() {
			return settings;
		},
		hasCompleteSettings() {
			return true;
		},
	};
	const platform = createBackgroundPlatform({
		Appearance: {
			normalizeTranslationAppearance(value) {
				return value;
			},
		},
		EmbeddedFrames: {
			async discoverEmbeddedFrames() {
				return [];
			},
		},
		Messages,
		Settings: controllerSettings,
		SiteProfiles: {},
		chrome,
	});
	const queue = {
		create() {
			return session;
		},
		enqueue(_tabId, _sessionId, items) {
			return { queued: items.length };
		},
		get() {
			return session;
		},
		getTranslatedCount() {
			return 1;
		},
		markTranslated() {},
		remove() {},
	};
	const controller = createBackgroundController({
		Api: {
			consumeProgressiveTranslations(_chunkPlan, _mergeState, translations) {
				return translations;
			},
			createProgressiveMergeState() {
				return {};
			},
			createRecursiveChunkPlan(items) {
				return { chunks: [items] };
			},
			getIncompleteSegmentIds() {
				return [];
			},
			async requestTranslationsBatchedProgressive({ onChunkResolved }) {
				await onChunkResolved({
					translations: [
						{
							id: "caption-1",
							kind: "subtitle",
							sourceText: "Hello",
							translation: "Bonjour",
						},
					],
				});
				return { failures: [] };
			},
		},
		Messages,
		Settings: controllerSettings,
		SiteProfiles: {},
		TranslationSession: {
			createPageTranslationQueue(configuration) {
				processBatch = configuration.processBatch;
				return queue;
			},
			shouldKeepPageTranslationSession() {
				return true;
			},
		},
		chrome,
		logger: { debug() {}, error() {}, info() {} },
		platform,
	});

	await controller.translatePage({
		id: 17,
		url: "https://www.youtube.com/watch?v=demo",
	});
	await processBatch({
		frameId: 0,
		items: [{ id: "caption-1", kind: "subtitle", text: "Hello" }],
		sessionId: session.sessionId,
		tabId: 17,
	});

	const startupMessage = sentMessages.find(
		(message) =>
			message.type === Messages.MESSAGE_TYPES.START_PAGE_TRANSLATION_SESSION,
	);
	const renderMessage = sentMessages.find(
		(message) =>
			message.type === Messages.MESSAGE_TYPES.RENDER_PAGE_TRANSLATION_UPDATES,
	);
	assert.equal(startupMessage.payload.youtubeSubtitleDisplayMode, "bilingual");
	assert.equal(renderMessage.payload.youtubeSubtitleDisplayMode, "bilingual");
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
