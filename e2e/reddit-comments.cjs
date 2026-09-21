#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
	ROOT_DIR,
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	createMockApiServer,
	getConfig,
	launchExtensionContext,
	saveOptions,
	waitFor,
} = require("./lib/extension-test-helpers.cjs");

const TARGET_URL =
	"https://www.reddit.com/r/RMWilliams/comments/1wi2fee/help_with_new_boots/";
const FIXTURE_PATH = path.join(ROOT_DIR, "test", "reddit-comment-page.html");
const PROSE_SELECTOR = "[data-reddit-prose]";
const UI_SELECTOR = "[data-reddit-ui]";
const PROSE_IDS = [
	"post-title",
	"post-body",
	"comments-title",
	"comment-one",
	"comment-one-reply",
	"comment-two-first",
	"comment-two-second",
	"comment-three",
];

async function hasReadyNote(source) {
	return source.evaluate((element) => {
		const sourceId = element.getAttribute("data-ot-source-id");

		return Boolean(
			sourceId &&
				document.querySelector(
					`[data-ot-note-id="${CSS.escape(sourceId)}"][data-phase="ready"]`,
				),
		);
	});
}

async function collectAnalysis(page) {
	return page.evaluate(
		({ proseSelector, uiSelector }) => {
			const prose = Array.from(document.querySelectorAll(proseSelector));
			const ui = Array.from(document.querySelectorAll(uiSelector));

			function getNotesForSource(source) {
				const sourceId = source.getAttribute("data-ot-source-id");

				return sourceId
					? Array.from(
							document.querySelectorAll(
								`[data-ot-note-id="${CSS.escape(sourceId)}"]`,
							),
						)
					: [];
			}

			return {
				url: location.href,
				mainCount: document.querySelectorAll("main").length,
				roleArticleCount: document.querySelectorAll('[role="article"]').length,
				proseCount: prose.length,
				sourceCount: prose.filter((element) =>
					element.hasAttribute("data-ot-source-id"),
				).length,
				readyCount: prose.filter((element) =>
					getNotesForSource(element).some(
						(note) => note.getAttribute("data-phase") === "ready",
					),
				).length,
				missingReadyIds: prose
					.filter(
						(element) =>
							!getNotesForSource(element).some(
								(note) => note.getAttribute("data-phase") === "ready",
							),
					)
					.map((element) => element.id),
				duplicateNoteIds: prose
					.filter((element) => getNotesForSource(element).length !== 1)
					.map((element) => element.id),
				uiSourceIds: ui
					.flatMap((element) => [
						...(element.hasAttribute("data-ot-source-id") ? [element] : []),
						...element.querySelectorAll("[data-ot-source-id]"),
					])
					.map((element) => element.id || element.tagName.toLowerCase()),
				pendingCount: document.querySelectorAll(
					'[data-ot-role="note"][data-phase="pending"]',
				).length,
				totalNoteCount: document.querySelectorAll('[data-ot-role="note"]')
					.length,
			};
		},
		{ proseSelector: PROSE_SELECTOR, uiSelector: UI_SELECTOR },
	);
}

async function main() {
	const config = getConfig();

	assert.equal(
		config.useMockApi,
		true,
		"Reddit E2E must run with PLAYWRIGHT_MOCK_API=1.",
	);
	const fixture = await fs.readFile(FIXTURE_PATH, "utf8");
	const mockApiServer = await createMockApiServer();
	let runState;

	config.apiKey = "mock-api-key";
	config.baseUrl = mockApiServer.baseUrl;
	config.model = "mock-model";
	config.userDataDir = "";

	try {
		runState = await launchExtensionContext(config, [
			`${new URL(TARGET_URL).origin}/*`,
		]);
		assert.equal(
			runState.isTemporaryUserDataDir,
			true,
			"Reddit E2E must use a temporary browser profile.",
		);
		await saveOptions(runState.context, runState.extensionId, config, {
			runConnectionTest: false,
		});

		const page = await runState.context.newPage();
		const pageErrors = [];
		const translatorLogs = [];
		let routedDocumentRequests = 0;

		page.on("pageerror", (error) => pageErrors.push(error.message));
		page.on("console", (message) => {
			const text = message.text();

			if (text.includes("[OpenAI Translator]")) {
				translatorLogs.push(text);
			}
		});
		await page.route(TARGET_URL, async (route) => {
			const request = route.request();

			if (
				request.isNavigationRequest() &&
				request.frame() === page.mainFrame()
			) {
				routedDocumentRequests += 1;
				await route.fulfill({
					body: fixture,
					contentType: "text/html; charset=utf-8",
					status: 200,
				});
				return;
			}

			await route.continue();
		});
		await page.setViewportSize({ width: 1024, height: 720 });
		await page.goto(TARGET_URL, {
			waitUntil: "domcontentloaded",
			timeout: REQUEST_TIMEOUT_MS,
		});

		assert.equal(page.url(), TARGET_URL);
		assert.equal(routedDocumentRequests, 1);
		assert.equal(await page.locator(PROSE_SELECTOR).count(), PROSE_IDS.length);
		assert.equal(await page.locator('[role="article"]').count(), 4);

		await callBackground(runState.context, "translatePage", {
			pageUrl: page.url(),
		});
		await waitFor(() => hasReadyNote(page.locator("#post-title")), {
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage: "The Reddit post title did not translate.",
		});
		const deepComment = page.locator("#comment-three");

		assert.equal(
			await hasReadyNote(deepComment),
			false,
			"Deep Reddit comments should stay outside the initial translation window.",
		);
		assert.equal(await deepComment.getAttribute("data-ot-queued"), "false");

		for (const id of PROSE_IDS) {
			const source = page.locator(`#${id}`);

			await source.scrollIntoViewIfNeeded();
			await waitFor(() => hasReadyNote(source), {
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: `Reddit prose block #${id} did not translate.`,
			});
		}

		for (const id of [...PROSE_IDS].reverse()) {
			await page.locator(`#${id}`).scrollIntoViewIfNeeded();
		}
		await page.waitForTimeout(500);

		const analysis = await waitFor(
			async () => {
				const current = await collectAnalysis(page);

				return current.readyCount === PROSE_IDS.length &&
					current.pendingCount === 0
					? current
					: null;
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Reddit full-page translation did not settle.",
			},
		);

		assert.equal(analysis.mainCount, 1);
		assert.equal(analysis.sourceCount, PROSE_IDS.length);
		assert.equal(analysis.readyCount, PROSE_IDS.length);
		assert.deepEqual(analysis.missingReadyIds, []);
		assert.deepEqual(analysis.duplicateNoteIds, []);
		assert.deepEqual(analysis.uiSourceIds, []);
		assert.equal(analysis.pendingCount, 0);
		assert.equal(analysis.totalNoteCount, PROSE_IDS.length);
		assert.deepEqual(pageErrors, []);
		assert.ok(
			translatorLogs.some((message) => message.includes("Using main root")),
			"Expected the Reddit site profile to keep extraction rooted at main.",
		);
		const responseItemIds = mockApiServer.getResponseItemIds();

		assert.equal(
			responseItemIds.length,
			PROSE_IDS.length,
			"Expected one mock API item for each Reddit prose block.",
		);
		assert.equal(
			new Set(responseItemIds).size,
			PROSE_IDS.length,
			"Expected every Reddit mock API item to be unique.",
		);

		console.log(JSON.stringify(analysis, null, 2));
		await page.close();
	} finally {
		await closeExtensionContext(runState);
		await mockApiServer.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
