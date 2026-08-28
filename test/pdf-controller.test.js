import assert from "node:assert/strict";
import test from "node:test";

import {
	createPdfController,
	sanitizeError,
} from "../src/background/pdf-controller.js";
import Pdf from "../src/shared/pdf.js";
import Api from "../src/translation/api.js";

function createEvent() {
	const listeners = [];
	return {
		addListener(listener) {
			listeners.push(listener);
		},
		emit(...args) {
			for (const listener of listeners) listener(...args);
		},
	};
}

function createHarness(options = {}) {
	const storage = new Map();
	const createdTabs = [];
	const permissionRequests = [];
	const chrome = {
		permissions: {
			async contains() {
				return Boolean(options.permissionAlreadyGranted);
			},
			async request(permission) {
				permissionRequests.push(permission);
				return options.permissionDenied !== true;
			},
		},
		runtime: {
			getURL(path) {
				return `chrome-extension://trusted/${path}`;
			},
			id: "trusted",
		},
		storage: {
			session: {
				async get(key) {
					return storage.has(key) ? { [key]: storage.get(key) } : {};
				},
				async remove(key) {
					storage.delete(key);
				},
				async set(values) {
					for (const [key, value] of Object.entries(values))
						storage.set(key, value);
				},
			},
		},
		tabs: {
			async create(details) {
				createdTabs.push(details);
				return { id: 77, ...details };
			},
		},
	};
	const progressiveApi = {
		...Api,
		async requestTranslationsBatchedProgressive(request) {
			const successes = [];
			for (const chunk of request.chunks) {
				const translations = chunk.map((item) => ({
					id: item.id,
					translation: `translated:${item.id}`,
				}));
				successes.push(...translations);
				await request.onChunkResolved({ translations });
			}
			return { failures: [], successes };
		},
	};
	const platform = {
		async ensureApiPermission() {
			return options.apiPermissionDenied !== true;
		},
		isDomainDisabled() {
			return false;
		},
		async loadSettingsOrOpenOptions() {
			if (options.incompleteSettings)
				throw new Error("Settings are incomplete.");
			return {
				apiKey: "secret",
				baseUrl: "https://api.example/v1",
				model: "model",
				systemPromptTemplate: "system",
				targetLanguage: "台灣正體中文",
				userPromptTemplate: "{{sourcePayload}}",
			};
		},
	};
	const controller = createPdfController({
		Api: progressiveApi,
		Pdf,
		chrome,
		logger: { error() {}, info() {} },
		platform,
	});
	return { chrome, controller, createdTabs, permissionRequests, storage };
}

function createPort(overrides = {}) {
	const onDisconnect = createEvent();
	const onMessage = createEvent();
	const posted = [];
	return {
		disconnected: false,
		name: overrides.name || Pdf.PDF_PORT_NAME,
		onDisconnect,
		onMessage,
		posted,
		sender: {
			id: overrides.senderId || "trusted",
			tab: { id: overrides.tabId || 77 },
			url:
				overrides.senderUrl || "chrome-extension://trusted/sidebar/index.html",
		},
		disconnect() {
			this.disconnected = true;
			onDisconnect.emit();
		},
		postMessage(message) {
			posted.push(message);
		},
	};
}

async function waitFor(predicate) {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Condition did not settle.");
}

async function openAndStart(harness, port = createPort()) {
	const opened = await harness.controller.openPdfTranslator({
		id: 42,
		title: "Private paper",
		url: "https://papers.example/document.pdf?token=secret",
	});
	assert.equal(harness.controller.handleConnect(port), true);
	port.onMessage.emit({ type: "start", launchToken: opened.token });
	await waitFor(() =>
		port.posted.some((message) => message.type === "session-started"),
	);
	const started = port.posted.find(
		(message) => message.type === "session-started",
	);
	return { opened, port, started };
}

test("PDF controller opens a tokenized reader with exact-origin permission", async () => {
	const harness = createHarness();
	const opened = await harness.controller.openPdfTranslator({
		id: 42,
		title: "Paper",
		url: "https://papers.example/document.pdf?token=secret",
	});

	assert.deepEqual(harness.permissionRequests, [
		{ origins: ["https://papers.example/*"] },
	]);
	assert.equal(harness.createdTabs.length, 1);
	assert.match(harness.createdTabs[0].url, /sidebar\/index\.html#launch-/);
	assert.doesNotMatch(harness.createdTabs[0].url, /papers|secret/);
	assert.equal(opened.readerTabId, 77);
});

test("PDF controller opens extensionless sources only through explicit validation", async () => {
	const harness = createHarness();
	await assert.rejects(
		harness.controller.openPdfTranslator({
			id: 42,
			title: "download",
			url: "https://papers.example/download?id=1",
		}),
		/cannot be opened/,
	);
	await harness.controller.openPdfTranslator(
		{
			id: 42,
			title: "download",
			url: "https://papers.example/download?id=1",
		},
		{ allowUnknownType: true },
	);
	assert.deepEqual(harness.permissionRequests, [
		{ origins: ["https://papers.example/*"] },
	]);
});

test("PDF controller opens local PDF tabs without requesting file host access", async () => {
	const harness = createHarness();
	await harness.controller.openPdfTranslator({
		id: 42,
		title: "local.pdf",
		url: "file:///tmp/local.pdf",
	});

	assert.deepEqual(harness.permissionRequests, []);
	assert.equal(harness.createdTabs.length, 1);
});

test("PDF controller rejects untrusted reader ports", () => {
	const harness = createHarness();
	const port = createPort({ senderUrl: "https://example.com/" });

	assert.equal(harness.controller.handleConnect(port), false);
	assert.equal(port.disconnected, true);
});

test("PDF controller reports incomplete settings and API permission denial safely", async () => {
	for (const harness of [
		createHarness({ incompleteSettings: true }),
		createHarness({ apiPermissionDenied: true }),
	]) {
		const opened = await harness.controller.openPdfTranslator({
			id: 42,
			title: "Paper",
			url: "https://papers.example/document.pdf",
		});
		const port = createPort();
		harness.controller.handleConnect(port);
		port.onMessage.emit({ type: "start", launchToken: opened.token });
		await waitFor(() =>
			port.posted.some((message) => message.type === "error"),
		);
		const error = port.posted.find((message) => message.type === "error");
		assert.equal(error.sessionId, "");
		assert.equal(JSON.stringify(error).includes("apiKey"), false);
	}
});

test("PDF controller rejects stale and cross-tab launch tokens", async () => {
	const harness = createHarness();
	const opened = await harness.controller.openPdfTranslator({
		id: 42,
		title: "Paper",
		url: "https://papers.example/document.pdf",
	});
	const wrongTabPort = createPort({ tabId: 88 });
	harness.controller.handleConnect(wrongTabPort);
	wrongTabPort.onMessage.emit({ type: "start", launchToken: opened.token });
	await waitFor(() =>
		wrongTabPort.posted.some((message) => message.type === "error"),
	);
	assert.match(
		wrongTabPort.posted.find((message) => message.type === "error").error,
		/already in use/,
	);

	const stalePort = createPort();
	harness.controller.handleConnect(stalePort);
	stalePort.onMessage.emit({ type: "start", launchToken: "launch-missing" });
	await waitFor(() =>
		stalePort.posted.some((message) => message.type === "error"),
	);
	assert.match(
		stalePort.posted.find((message) => message.type === "error").error,
		/expired/,
	);
});

test("PDF controller starts one scoped session and emits progressive results", async () => {
	const harness = createHarness();
	const { port, started } = await openAndStart(harness);
	assert.equal(started.targetLanguage, "台灣正體中文");
	assert.equal(typeof started.settingsFingerprint, "string");
	assert.equal(started.apiKey, undefined);

	port.onMessage.emit({
		type: "queue",
		sessionId: started.sessionId,
		requestId: "request-1",
		items: [{ id: "doc:p1:b1", kind: "paragraph", text: "Sensitive source" }],
	});
	await waitFor(() =>
		port.posted.some((message) => message.type === "batch-complete"),
	);
	const update = port.posted.find(
		(message) => message.type === "translation-update",
	);
	assert.deepEqual(update.translations, [
		{ id: "doc:p1:b1", translation: "translated:doc:p1:b1" },
	]);
	assert.equal(JSON.stringify(port.posted).includes("Sensitive source"), false);
	assert.equal(JSON.stringify(port.posted).includes("secret"), true);
	assert.equal(JSON.stringify(port.posted).includes("apiKey"), false);
});

test("PDF controller rejects duplicate request ids and skips retries of completed blocks", async () => {
	const harness = createHarness();
	const { port, started } = await openAndStart(harness);
	const batch = {
		type: "queue",
		sessionId: started.sessionId,
		requestId: "request-1",
		items: [{ id: "doc:p1:b1", text: "First" }],
	};
	port.onMessage.emit(batch);
	await waitFor(() =>
		port.posted.some((message) => message.type === "batch-complete"),
	);
	const updateCount = port.posted.filter(
		(message) => message.type === "translation-update",
	).length;
	port.onMessage.emit(batch);
	await waitFor(() =>
		port.posted.some(
			(message) =>
				message.type === "error" && /already used/.test(message.error),
		),
	);
	port.onMessage.emit({
		...batch,
		type: "retry",
		requestId: "request-2",
	});
	await waitFor(() =>
		port.posted.some(
			(message) =>
				message.type === "batch-complete" && message.requestId === "request-2",
		),
	);
	assert.equal(
		port.posted.filter((message) => message.type === "translation-update")
			.length,
		updateCount,
	);
});

test("PDF controller rejects changed text under a reused block id", async () => {
	const harness = createHarness();
	const { port, started } = await openAndStart(harness);
	port.onMessage.emit({
		type: "queue",
		sessionId: started.sessionId,
		requestId: "request-1",
		items: [{ id: "doc:p1:b1", text: "First" }],
	});
	await waitFor(() =>
		port.posted.some((message) => message.type === "batch-complete"),
	);
	port.onMessage.emit({
		type: "retry",
		sessionId: started.sessionId,
		requestId: "request-2",
		items: [{ id: "doc:p1:b1", text: "Changed" }],
	});
	await waitFor(() =>
		port.posted.some(
			(message) => message.type === "error" && /changed/.test(message.error),
		),
	);
});

test("PDF controller reuses a tab-bound launch after a Port disconnect", async () => {
	const harness = createHarness();
	const { opened, port, started } = await openAndStart(harness);
	port.disconnect();
	const replacement = createPort();
	assert.equal(harness.controller.handleConnect(replacement), true);
	replacement.onMessage.emit({ type: "start", launchToken: opened.token });
	await waitFor(() =>
		replacement.posted.some((message) => message.type === "session-started"),
	);
	const replacementStarted = replacement.posted.find(
		(message) => message.type === "session-started",
	);
	assert.notEqual(replacementStarted.sessionId, started.sessionId);
});

test("PDF controller cancellation prevents later queue work", async () => {
	const harness = createHarness();
	const { port, started } = await openAndStart(harness);
	port.onMessage.emit({ type: "cancel", sessionId: started.sessionId });
	await waitFor(() =>
		port.posted.some((message) => message.type === "cancelled"),
	);
	port.onMessage.emit({
		type: "queue",
		sessionId: started.sessionId,
		requestId: "request-1",
		items: [{ id: "doc:p1:b1", text: "Late" }],
	});
	await waitFor(() => port.posted.some((message) => message.type === "error"));
	assert.equal(
		port.posted.some((message) => message.type === "translation-update"),
		false,
	);
});

test("PDF errors redact URLs and authorization material", () => {
	assert.equal(
		sanitizeError(
			new Error("Request https://example.com/paper?token=x Bearer abc failed"),
		),
		"Request [redacted URL] Bearer [redacted] failed",
	);
});
