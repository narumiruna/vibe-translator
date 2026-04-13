#!/usr/bin/env node

const assert = require("node:assert/strict");

const {
	ROOT_DIR,
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	createStaticServer,
	getConfig,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
} = require("./lib/extension-test-helpers");

const FIXTURE_PATH = "/test/fixture-page.html";

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function main() {
	const config = getConfig();
	const server = await createStaticServer(ROOT_DIR);
	const fixtureOriginPattern = `${server.origin}/*`;
	let runState;

	try {
		runState = await launchExtensionContext(config, [fixtureOriginPattern]);
		console.log(`Using fixture server: ${server.origin}`);
		console.log(`Using Chrome profile: ${runState.userDataDir}`);

		await saveOptions(runState.context, runState.extensionId, config, {
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
	} finally {
		await closeExtensionContext(runState);
		await server.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
