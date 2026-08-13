#!/usr/bin/env node

const assert = require("node:assert/strict");

const {
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	createMockApiServer,
	getConfig,
	launchExtensionContext,
	saveOptions,
	waitFor,
} = require("./lib/extension-test-helpers.cjs");

const TARGET_URL = "https://antirez.com/news/169";
const DISQUS_FRAME_PREFIX = "https://disqus.com/embed/comments/";
const COMMENT_SELECTOR = '[data-role="message"] > div > p:not([data-ot-role])';
const READY_COMMENT_NOTE_SELECTOR = `${COMMENT_SELECTOR} + [data-ot-role="note"][data-phase="ready"]`;

async function main() {
	const config = getConfig();
	const mockApiServer = config.useMockApi ? await createMockApiServer() : null;
	let runState;

	if (mockApiServer) {
		config.baseUrl = mockApiServer.baseUrl;
	}

	try {
		runState = await launchExtensionContext(config, [
			"https://antirez.com/*",
			"https://disqus.com/*",
		]);
		await saveOptions(runState.context, runState.extensionId, config, {
			appearancePreset: "high-contrast",
			appearanceValues: {
				"#inline-font-size": 20,
				"#inline-accent-width": 8,
				"#inline-light-background": "#fff4e6",
			},
			runConnectionTest: false,
		});

		const page = await runState.context.newPage();

		await page.goto(TARGET_URL, {
			waitUntil: "domcontentloaded",
			timeout: REQUEST_TIMEOUT_MS,
		});
		await page.bringToFront();
		const disqusFrame = await waitFor(
			() =>
				page
					.frames()
					.find((frame) => frame.url().startsWith(DISQUS_FRAME_PREFIX)),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "The Antirez Disqus frame did not load.",
			},
		);

		await waitFor(
			async () => (await disqusFrame.locator(COMMENT_SELECTOR).count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "No Disqus comment paragraphs loaded.",
			},
		);
		await callBackground(runState.context, "translatePage", {
			pageUrl: page.url(),
		});

		const analysis = await waitFor(
			async () => {
				const sourceCount = await disqusFrame.locator(COMMENT_SELECTOR).count();
				const readyCount = await disqusFrame
					.locator(READY_COMMENT_NOTE_SELECTOR)
					.count();
				const pendingCount = await disqusFrame
					.locator('[data-ot-role="note"][data-phase="pending"]')
					.count();

				return sourceCount > 0 &&
					readyCount === sourceCount &&
					pendingCount === 0
					? { sourceCount, readyCount, pendingCount }
					: null;
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				intervalMs: 500,
				timeoutMessage: "Disqus comments did not finish translating.",
			},
		);
		const topReadyCount = await page
			.locator('[data-ot-role="note"][data-phase="ready"]')
			.count();

		assert.ok(
			topReadyCount > 0,
			"Expected the Antirez article to translate too.",
		);
		const [topAppearance, commentAppearance] = await Promise.all([
			page
				.locator('[data-ot-role="note"][data-phase="ready"]')
				.first()
				.evaluate((element) => {
					const style = getComputedStyle(element);

					return {
						backgroundColor: style.backgroundColor,
						borderLeftWidth: style.borderLeftWidth,
						fontSize: style.fontSize,
					};
				}),
			disqusFrame
				.locator('[data-ot-role="note"][data-phase="ready"]')
				.first()
				.evaluate((element) => {
					const style = getComputedStyle(element);

					return {
						backgroundColor: style.backgroundColor,
						borderLeftWidth: style.borderLeftWidth,
						fontSize: style.fontSize,
					};
				}),
		]);

		assert.deepEqual(topAppearance, {
			backgroundColor: "rgb(255, 244, 230)",
			borderLeftWidth: "8px",
			fontSize: "20px",
		});
		assert.deepEqual(commentAppearance, topAppearance);
		console.log(
			JSON.stringify(
				{ ...analysis, topReadyCount, customAppearance: commentAppearance },
				null,
				2,
			),
		);
		await page.close();
	} finally {
		await closeExtensionContext(runState);
		await mockApiServer?.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
