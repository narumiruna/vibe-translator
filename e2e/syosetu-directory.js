#!/usr/bin/env node

const assert = require("node:assert/strict");

const {
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	getConfig,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
} = require("./lib/extension-test-helpers");

const TARGET_URL = "https://ncode.syosetu.com/n6093en/";
const SCROLL_STEPS = [
	{ y: 0, screenshot: "syosetu-top.png" },
	{ y: 2200, screenshot: "syosetu-mid.png" },
	{ y: 5200, screenshot: "syosetu-lower.png" },
	{ y: 9800, screenshot: "syosetu-bottom.png" },
];

async function collectAnalysis(page) {
	return page.evaluate(() => {
		const SOURCE_ATTR = "data-ot-source-id";
		const NOTE_ATTR = "data-ot-note-id";
		const ROOT_ATTR = "data-ot-role";

		function hasReadyNoteAfter(element) {
			if (!element) {
				return false;
			}

			const id = element.getAttribute(SOURCE_ATTR);
			const next = element.nextElementSibling;

			return Boolean(
				id &&
					next &&
					next.getAttribute(ROOT_ATTR) === "note" &&
					next.getAttribute(NOTE_ATTR) === id &&
					next.getAttribute("data-phase") === "ready",
			);
		}

		function count(selector) {
			const elements = Array.from(document.querySelectorAll(selector));

			return {
				total: elements.length,
				withSource: elements.filter((element) =>
					element.hasAttribute(SOURCE_ATTR),
				).length,
				withReadyNote: elements.filter((element) => hasReadyNoteAfter(element))
					.length,
			};
		}

		return {
			totalReadyNotes: document.querySelectorAll(
				'[data-ot-role="note"][data-phase="ready"]',
			).length,
			totalPendingNotes: document.querySelectorAll(
				'[data-ot-role="note"][data-phase="pending"]',
			).length,
			summary: count("#novel_ex"),
			chapterTitles: count(".p-eplist__chapter-title"),
			episodeTitles: count(".p-eplist__subtitle"),
			episodeUpdates: count(".p-eplist__update"),
			pager: count(".c-pager__result-stats"),
			announce: count(".c-announce"),
			recommendLead: count(".p-recommend__lead"),
			recommendSummary: count(".p-recommend__summary"),
			rankingTag: count(".p-rankingtag"),
			menuItems: count("header.c-menu .c-menu__item"),
		};
	});
}

function assertAnalysis(analysis) {
	assert.equal(analysis.summary.total, 1, "Expected one summary block.");
	assert.equal(
		analysis.summary.withReadyNote,
		analysis.summary.total,
		"Expected the summary block to be translated.",
	);
	assert.equal(
		analysis.chapterTitles.withReadyNote,
		analysis.chapterTitles.total,
		"Expected all chapter titles to be translated.",
	);
	assert.equal(
		analysis.episodeTitles.withReadyNote,
		analysis.episodeTitles.total,
		"Expected all episode titles to be translated.",
	);
	assert.equal(
		analysis.episodeUpdates.withReadyNote,
		0,
		"Expected episode update metadata to stay untranslated.",
	);
	assert.equal(
		analysis.pager.withReadyNote,
		0,
		"Expected pager UI to stay untranslated.",
	);
	assert.equal(
		analysis.announce.withReadyNote,
		0,
		"Expected announce UI to stay untranslated.",
	);
	assert.equal(
		analysis.recommendLead.withReadyNote,
		0,
		"Expected recommendation lead to stay untranslated.",
	);
	assert.equal(
		analysis.recommendSummary.withReadyNote,
		0,
		"Expected recommendation summaries to stay untranslated.",
	);
	assert.equal(
		analysis.rankingTag.withReadyNote,
		0,
		"Expected ranking tag promo block to stay untranslated.",
	);
	assert.equal(
		analysis.menuItems.withReadyNote,
		0,
		"Expected header menu items to stay untranslated.",
	);
	assert.equal(
		analysis.totalPendingNotes,
		0,
		"Expected page translation to settle with no pending notes.",
	);
}

async function main() {
	const config = getConfig();
	const siteOriginPattern = `${new URL(TARGET_URL).origin}/*`;
	let runState;

	try {
		runState = await launchExtensionContext(config, [siteOriginPattern]);
		console.log(`Using Chrome profile: ${runState.userDataDir}`);

		await saveOptions(runState.context, runState.extensionId, config, {
			runConnectionTest: false,
		});

		const page = await runState.context.newPage();
		await page.goto(TARGET_URL, {
			waitUntil: "domcontentloaded",
			timeout: REQUEST_TIMEOUT_MS,
		});
		await page.bringToFront();
		await takeScreenshot(
			page,
			config.artifactsDir,
			"syosetu-before.png",
			false,
		);

		await callBackground(runState.context, "translatePage", {
			pageUrl: page.url(),
		});

		await waitFor(
			async () => {
				const readyCount = await page
					.locator('[data-ot-role="note"][data-phase="ready"]')
					.count();
				return readyCount > 0;
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage:
					"No ready translation notes appeared on the Syosetu page.",
			},
		);

		for (const step of SCROLL_STEPS) {
			await page.evaluate((scrollY) => window.scrollTo(0, scrollY), step.y);
			await page.waitForTimeout(4000);
			await takeScreenshot(page, config.artifactsDir, step.screenshot, false);
		}

		await waitFor(
			async () => {
				const analysis = await collectAnalysis(page);
				return analysis.totalPendingNotes === 0 ? analysis : null;
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				intervalMs: 1000,
				timeoutMessage:
					"Syosetu directory translation did not settle before timeout.",
			},
		);

		const analysis = await collectAnalysis(page);
		assertAnalysis(analysis);

		console.log(JSON.stringify(analysis, null, 2));
		await page.close();
	} finally {
		await closeExtensionContext(runState);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
