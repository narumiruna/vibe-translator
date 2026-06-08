#!/usr/bin/env node

const assert = require("node:assert/strict");

const {
	ROOT_DIR,
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	createMockApiServer,
	createStaticServer,
	getConfig,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
} = require("./lib/extension-test-helpers");

const FIXTURE_PATH = "/test/fixture-page.html";
const PARTIAL_FAILURE_FIXTURE_PATH = "/test/partial-failure-page.html";
const SELECTION_FAILURE_FIXTURE_PATH = "/test/selection-failure-page.html";
const REQUIRED_BACKGROUND_GLOBALS = [
	"TranslatorApi",
	"TranslatorApiCache",
	"TranslatorApiChunkPlan",
	"TranslatorApiResponses",
	"TranslatorMessages",
	"TranslatorPageTranslationQueue",
	"TranslatorProtectedFragments",
	"TranslatorStorage",
];
const REQUIRED_CONTENT_GLOBALS = [
	"TranslatorContentExtraction",
	"TranslatorContentViewport",
	"TranslatorMessages",
	"TranslatorSelectionPanel",
];
const REQUIRED_OPTIONS_GLOBALS = [
	"TranslatorApi",
	"TranslatorApiCache",
	"TranslatorApiChunkPlan",
	"TranslatorApiResponses",
	"TranslatorMessages",
	"TranslatorProtectedFragments",
	"TranslatorStorage",
];

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectContentGlobals(context, page) {
	const missingGlobals = await callBackground(
		context,
		"getMissingContentGlobals",
		{
			globalNames: REQUIRED_CONTENT_GLOBALS,
			pageUrl: page.url(),
		},
	);

	assert.deepEqual(
		missingGlobals,
		[],
		"Expected content helper scripts to expose all required globals in the injected world.",
	);
}

async function expectBackgroundGlobals(context) {
	const missingGlobals = await callBackground(context, "getMissingGlobals", {
		globalNames: REQUIRED_BACKGROUND_GLOBALS,
	});

	assert.deepEqual(
		missingGlobals,
		[],
		"Expected service worker helper scripts to expose all required globals.",
	);
}

async function expectVisibleText(page, matcher, label) {
	const body = page.locator("body");
	const text = await waitFor(
		async () => {
			const content = (await body.textContent()) || "";
			return matcher.test(content) ? content : "";
		},
		{
			timeoutMs: 10000,
			timeoutMessage: `${label} was not visible on the page.`,
		},
	);

	assert.match(text, matcher);
}

async function runPageTranslationSmoke(context, serverOrigin, artifactsDir) {
	const page = await context.newPage();

	await page.goto(`${serverOrigin}${FIXTURE_PATH}`, {
		waitUntil: "domcontentloaded",
	});
	await page.bringToFront();

	await callBackground(context, "translatePage", { pageUrl: page.url() });

	const firstNote = page
		.locator('[data-ot-role="note"][data-phase="ready"]')
		.first();
	await waitFor(async () => (await firstNote.count()) > 0, {
		timeoutMs: REQUEST_TIMEOUT_MS,
		timeoutMessage: "No completed page translation note appeared.",
	});
	await expectContentGlobals(context, page);

	const noteBodyText = await waitFor(
		async () => {
			const text = await firstNote
				.locator('[data-ot-role="note-body"]')
				.textContent();
			return text?.trim() ? text.trim() : "";
		},
		{
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage: "Completed translation note stayed empty.",
		},
	);

	assert.ok(
		noteBodyText.length > 0,
		"Expected a non-empty translated note body.",
	);
	await expectVisibleText(
		page,
		/This fixture page exists for manual testing\./,
		"Original source paragraph",
	);

	await page.locator("#translation-table").scrollIntoViewIfNeeded();
	await waitFor(
		async () =>
			(await page
				.locator('#translation-table [data-ot-role="note"][data-phase="ready"]')
				.count()) > 0,
		{
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage: "No completed table-cell translation note appeared.",
		},
	);
	const tableCellCounts = await page.locator("#translation-table").evaluate(
		(table) =>
			Array.from(table.querySelectorAll("tr")).map(
				(row) =>
					Array.from(row.children).filter((child) =>
						/^(td|th)$/i.test(child.tagName),
					).length,
			),
	);
	assert.deepEqual(
		tableCellCounts,
		[2, 2],
		"Expected table translation notes not to add sibling table cells.",
	);

	await takeScreenshot(page, artifactsDir, "page-translation-smoke.png");
	await page.close();
}

async function runSelectionTranslationSmoke(
	context,
	serverOrigin,
	targetLanguage,
	artifactsDir,
) {
	const page = await context.newPage();

	await page.goto(`${serverOrigin}${FIXTURE_PATH}`, {
		waitUntil: "domcontentloaded",
	});
	await page.bringToFront();
	await page.locator("p").nth(1).selectText();

	const selectionText = await page.evaluate(() =>
		typeof window.getSelection === "function"
			? String(window.getSelection()?.toString() || "")
			: "",
	);
	assert.ok(
		selectionText.trim(),
		"Expected selected text before triggering selection translation.",
	);

	await callBackground(context, "translateSelection", {
		pageUrl: page.url(),
		selectionText,
	});

	const panel = page.locator('[data-ot-role="selection-panel"]');
	const panelBody = panel.locator('[data-ot-role="selection-panel-body"]');

	await waitFor(async () => (await panel.count()) > 0, {
		timeoutMs: REQUEST_TIMEOUT_MS,
		timeoutMessage: "Selection translation panel did not appear.",
	});
	await expectContentGlobals(context, page);
	await waitFor(
		async () => {
			const state = await panelBody.getAttribute("data-state");
			return state === "ready";
		},
		{
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage: "Selection translation panel never became ready.",
		},
	);

	const panelTitle =
		(await panel
			.locator('[data-ot-role="selection-panel-title"]')
			.textContent()) || "";
	const panelText = ((await panelBody.textContent()) || "").trim();

	assert.match(panelTitle, new RegExp(escapeRegExp(targetLanguage)));
	assert.ok(
		panelText.length > 0,
		"Expected a non-empty translated selection panel body.",
	);

	await takeScreenshot(page, artifactsDir, "selection-translation-smoke.png");
	await page.close();
}

async function runIframeSelectionTranslationSmoke(
	context,
	serverOrigin,
	targetLanguage,
	artifactsDir,
) {
	const page = await context.newPage();
	const frameUrl = `${serverOrigin}/test/selection-frame.html`;

	await page.goto(`${serverOrigin}${FIXTURE_PATH}`, {
		waitUntil: "domcontentloaded",
	});
	await page.bringToFront();

	const frame = await waitFor(() => page.frame({ url: frameUrl }), {
		timeoutMs: REQUEST_TIMEOUT_MS,
		timeoutMessage: "Selection iframe did not load.",
	});

	await frame.locator("#frame-selection-text").selectText();
	const selectionText = await frame.evaluate(() =>
		typeof window.getSelection === "function"
			? String(window.getSelection()?.toString() || "")
			: "",
	);
	assert.ok(
		selectionText.trim(),
		"Expected selected iframe text before triggering selection translation.",
	);

	const result = await callBackground(context, "translateSelection", {
		frameUrl,
		pageUrl: page.url(),
		selectionText,
	});
	assert.notEqual(result.frameId, 0, "Expected a non-top frame id.");

	const framePanel = frame.locator('[data-ot-role="selection-panel"]');
	const framePanelBody = framePanel.locator(
		'[data-ot-role="selection-panel-body"]',
	);

	await waitFor(async () => (await framePanel.count()) > 0, {
		timeoutMs: REQUEST_TIMEOUT_MS,
		timeoutMessage: "Iframe selection translation panel did not appear.",
	});
	await waitFor(
		async () => {
			const state = await framePanelBody.getAttribute("data-state");
			return state === "ready";
		},
		{
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage: "Iframe selection panel never became ready.",
		},
	);

	const framePanelTitle =
		(await framePanel
			.locator('[data-ot-role="selection-panel-title"]')
			.textContent()) || "";
	const framePanelText = ((await framePanelBody.textContent()) || "").trim();

	assert.match(framePanelTitle, new RegExp(escapeRegExp(targetLanguage)));
	assert.ok(
		framePanelText.length > 0,
		"Expected a non-empty translated iframe selection panel body.",
	);
	assert.equal(
		await page.locator('[data-ot-role="selection-panel"]').count(),
		0,
		"Expected no selection panel in the top frame for iframe selections.",
	);

	await takeScreenshot(page, artifactsDir, "iframe-selection-translation-smoke.png");
	await page.close();
}

async function runPagePartialFailureSmoke(
	context,
	serverOrigin,
	mockApiServer,
	artifactsDir,
) {
	const page = await context.newPage();

	mockApiServer.setFailOnTextIncludes("Force mock failure chunk");
	try {
		await page.goto(`${serverOrigin}${PARTIAL_FAILURE_FIXTURE_PATH}`, {
			waitUntil: "domcontentloaded",
		});
		await page.bringToFront();

		await callBackground(context, "translatePage", { pageUrl: page.url() });

		await waitFor(
			async () =>
				(await page
					.locator('[data-ot-role="note"][data-phase="ready"]')
					.count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage:
					"No successful translation appeared during partial failure smoke.",
			},
		);
		await expectVisibleText(
			page,
			/Failed to translate 1 page item\. Successful translations were kept\./,
			"Partial failure toast",
		);
		assert.equal(
			await page.locator('[data-ot-role="note"][data-phase="pending"]').count(),
			0,
			"Expected failed page chunks to clear pending placeholders.",
		);
		await takeScreenshot(page, artifactsDir, "partial-failure-smoke.png");
	} finally {
		mockApiServer.setFailOnTextIncludes("");
		await page.close();
	}
}

async function runSelectionFailureSmoke(context, serverOrigin, mockApiServer) {
	const page = await context.newPage();

	mockApiServer.setFailOnTextIncludes("Unique selected text should trigger");
	try {
		await page.goto(`${serverOrigin}${SELECTION_FAILURE_FIXTURE_PATH}`, {
			waitUntil: "domcontentloaded",
		});
		await page.bringToFront();
		await page.locator("#selection-failure-text").selectText();

		const selectionText = await page.evaluate(() =>
			typeof window.getSelection === "function"
				? String(window.getSelection()?.toString() || "")
				: "",
		);
		assert.ok(selectionText.trim(), "Expected selected text for failure smoke.");

		await assert.rejects(
			() =>
				callBackground(context, "translateSelection", {
					pageUrl: page.url(),
					selectionText,
				}),
			/Mock translation failure/,
		);
		assert.equal(
			await page.locator('[data-ot-role="selection-panel"]').count(),
			0,
			"Expected failed selection translation to clear the pending panel.",
		);
	} finally {
		mockApiServer.setFailOnTextIncludes("");
		await page.close();
	}
}

async function main() {
	const config = getConfig();
	const server = await createStaticServer(ROOT_DIR);
	const mockApiServer = config.useMockApi ? await createMockApiServer() : null;
	const fixtureOriginPattern = `${server.origin}/*`;
	let runState;

	if (mockApiServer) {
		config.baseUrl = mockApiServer.baseUrl;
	}

	try {
		runState = await launchExtensionContext(config, [fixtureOriginPattern]);
		console.log(`Using fixture server: ${server.origin}`);
		if (mockApiServer) {
			console.log(`Using mock API server: ${mockApiServer.baseUrl}`);
		}
		console.log(`Using Chrome profile: ${runState.userDataDir}`);

		await expectBackgroundGlobals(runState.context);
		await saveOptions(runState.context, runState.extensionId, config, {
			requiredGlobals: REQUIRED_OPTIONS_GLOBALS,
			runConnectionTest: true,
			screenshotName: "options-smoke.png",
		});
		console.log("Options smoke passed.");

		await runPageTranslationSmoke(
			runState.context,
			server.origin,
			config.artifactsDir,
		);
		console.log("Page translation smoke passed.");

		await runSelectionTranslationSmoke(
			runState.context,
			server.origin,
			config.targetLanguage,
			config.artifactsDir,
		);
		console.log("Selection translation smoke passed.");

		await runIframeSelectionTranslationSmoke(
			runState.context,
			server.origin,
			config.targetLanguage,
			config.artifactsDir,
		);
		console.log("Iframe selection translation smoke passed.");

		if (mockApiServer) {
			await runPagePartialFailureSmoke(
				runState.context,
				server.origin,
				mockApiServer,
				config.artifactsDir,
			);
			console.log("Partial failure smoke passed.");

			await runSelectionFailureSmoke(
				runState.context,
				server.origin,
				mockApiServer,
			);
			console.log("Selection failure smoke passed.");
		}
	} finally {
		await closeExtensionContext(runState);
		await mockApiServer?.close();
		await server.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
