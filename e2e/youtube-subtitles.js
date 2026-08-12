#!/usr/bin/env node

const assert = require("node:assert/strict");

const {
	REQUEST_TIMEOUT_MS,
	closeExtensionContext,
	createMockApiServer,
	getConfig,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
} = require("./lib/extension-test-helpers");

const YOUTUBE_VIDEO_URL = "https://www.youtube.com/watch?v=g7AxxkywiFI";
const INITIAL_CAPTION = `This result must not survive ${Date.now()}.`;
const CURRENT_CAPTION = `Pi gives you one small tool ${Date.now() + 1}.`;

async function installCaptionFixture(page) {
	await page.evaluate((text) => {
		document.querySelector("video")?.pause();
		let container = document.querySelector("#ytp-caption-window-container");

		if (!container) {
			container = document.createElement("div");
			container.id = "ytp-caption-window-container";
			(document.querySelector("#movie_player") || document.body).appendChild(
				container,
			);
		}

		container.style.cssText = [
			"position:absolute",
			"z-index:30",
			"left:50%",
			"bottom:12%",
			"transform:translateX(-50%)",
			"width:80%",
			"text-align:center",
			"pointer-events:none",
		].join(";");
		container.replaceChildren();

		const captionWindow = document.createElement("div");
		const captionsText = document.createElement("span");
		const visualLine = document.createElement("span");
		const segment = document.createElement("span");

		captionWindow.className = "caption-window ytp-caption-window-bottom";
		captionWindow.style.transform = "translateY(0px)";
		captionsText.className = "captions-text";
		captionsText.style.cssText =
			"display:block;color:white;font:500 24px/1.25 Arial,sans-serif;background:rgba(8,8,8,.78);width:max-content;max-width:100%;margin:0 auto;padding:.08em .34em";
		visualLine.className = "caption-visual-line";
		segment.className = "ytp-caption-segment";
		segment.textContent = text;
		visualLine.appendChild(segment);
		captionsText.appendChild(visualLine);
		captionWindow.appendChild(captionsText);
		container.appendChild(captionWindow);
	}, INITIAL_CAPTION);
}

async function suppressVisibleCaptions(page) {
	await page.evaluate(() => {
		document.querySelector("video")?.pause();
		window.__otSuppressCaptionsTimer = window.setInterval(() => {
			document
				.querySelector("#ytp-caption-window-container")
				?.replaceChildren();
		}, 25);
	});
}

async function stopSuppressingVisibleCaptions(page) {
	await page.evaluate(() => {
		window.clearInterval(window.__otSuppressCaptionsTimer);
		window.__otSuppressCaptionsTimer = null;
	});
}

async function installCaptionTrackMetadata(page) {
	await page.evaluate(() => {
		window.ytInitialPlayerResponse = {
			...(window.ytInitialPlayerResponse || {}),
			captions: {
				playerCaptionsTracklistRenderer: {
					captionTracks: [
						{
							kind: "asr",
							languageCode: "en",
							name: { simpleText: "English (auto-generated)" },
						},
					],
				},
			},
		};
	});
}

async function clearStoredSettings(context) {
	const worker = context.serviceWorkers()[0];

	await worker.evaluate(() =>
		Promise.all([
			new Promise((resolve) => chrome.storage.local.clear(resolve)),
			new Promise((resolve) => chrome.storage.sync.clear(resolve)),
		]),
	);
}

async function main() {
	const config = getConfig();
	const mockApiServer = await createMockApiServer({ responseDelayMs: 500 });
	let runState;

	config.baseUrl = mockApiServer.baseUrl;
	config.useMockApi = true;
	config.headless = true;

	try {
		runState = await launchExtensionContext(config);
		await saveOptions(runState.context, runState.extensionId, config, {
			runConnectionTest: false,
		});

		const page = await runState.context.newPage();
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto(YOUTUBE_VIDEO_URL, {
			timeout: REQUEST_TIMEOUT_MS,
			waitUntil: "domcontentloaded",
		});
		await page.bringToFront();
		await installCaptionTrackMetadata(page);

		const player = page.locator("#movie_player");
		const control = player.locator("[data-ot-youtube-control]");
		await waitFor(async () => (await control.count()) === 1, {
			timeoutMessage: "The Vibe Translator player control did not appear.",
		});
		const controlBounds = await control.boundingBox();
		const playerBounds = await player.boundingBox();
		assert.ok(
			controlBounds && playerBounds,
			"Expected visible control bounds.",
		);
		assert.ok(controlBounds.x >= playerBounds.x);
		assert.ok(
			controlBounds.x + controlBounds.width <=
				playerBounds.x + playerBounds.width,
		);
		assert.ok(controlBounds.y >= playerBounds.y);
		assert.ok(
			controlBounds.y + controlBounds.height <=
				playerBounds.y + playerBounds.height,
		);
		assert.equal(await control.getAttribute("aria-pressed"), "false");
		assert.match(
			(await control.getAttribute("aria-label")) || "",
			/Translate subtitles with Vibe Translator/,
		);
		assert.equal(
			await control.evaluate((element) => getComputedStyle(element).color),
			"rgb(255, 255, 255)",
			"The player-control state styles must exist before translation starts.",
		);
		await control.click();
		const diagnosticsPanel = player.locator(
			'[data-ot-role="youtube-diagnostics"]',
		);
		await waitFor(async () => (await diagnosticsPanel.count()) === 1, {
			timeoutMessage:
				"The player diagnostic panel did not appear after a real click.",
		});
		assert.match(
			(await diagnosticsPanel.textContent()) || "",
			/Player button click received/,
		);
		assert.doesNotMatch(
			(await diagnosticsPanel.textContent()) || "",
			new RegExp(config.apiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
		);
		await waitFor(
			async () => (await control.getAttribute("data-state")) !== "idle",
			{
				timeoutMessage:
					"A YouTube-replaced player control did not accept a real click.",
			},
		);
		await installCaptionFixture(page);

		const source = page.locator(
			"#ytp-caption-window-container .ytp-caption-segment",
		);
		await waitFor(
			async () => Boolean(await source.getAttribute("data-ot-source-id")),
			{
				timeoutMessage: "The initial YouTube caption was not queued.",
			},
		);
		await page.evaluate((text) => {
			const source = document.querySelector(
				"#ytp-caption-window-container .ytp-caption-segment",
			);
			const replacement = source?.cloneNode(true);

			if (source && replacement) {
				replacement.removeAttribute("data-ot-source-id");
				replacement.removeAttribute("data-ot-queued");
				replacement.removeAttribute("data-translated");
				replacement.removeAttribute("data-ot-translated");
				replacement.removeAttribute("data-ot-subtitle-replaced");
				replacement.textContent = text;
				source.replaceWith(replacement);
			}
		}, CURRENT_CAPTION);
		await waitFor(
			async () => !(await source.getAttribute("data-ot-source-id")),
			{
				timeoutMessage: "The changed cue did not invalidate its old request.",
			},
		);
		await page.evaluate(() => {
			window.__otObservedSubtitleTranslations = [];
			new MutationObserver(() => {
				const text = Array.from(
					document.querySelectorAll(
						'#ytp-caption-window-container [data-ot-role="note-body"]',
					),
				)
					.map((element) => element.textContent || "")
					.join("\n");

				if (text) {
					window.__otObservedSubtitleTranslations.push(text);
				}
			}).observe(document.querySelector("#ytp-caption-window-container"), {
				childList: true,
				characterData: true,
				subtree: true,
			});
		});
		await waitFor(
			async () => (await control.getAttribute("data-state")) === "active",
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "The in-player control did not become active.",
			},
		);

		const readyNote = page.locator(
			'#ytp-caption-window-container [data-ot-role="note"][data-phase="ready"]',
		);
		await waitFor(
			async () =>
				((await readyNote.textContent()) || "").includes(
					CURRENT_CAPTION.slice(0, 30),
				),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "The changed YouTube caption was not translated.",
			},
		);

		const playerText =
			(await page.locator("#ytp-caption-window-container").textContent()) || "";
		assert.match(
			playerText,
			new RegExp(CURRENT_CAPTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
		);
		const staleTranslationPrefix = `[mock:${INITIAL_CAPTION.slice(0, 48)}`;
		const observedTranslations = (
			await page.evaluate(() => window.__otObservedSubtitleTranslations || [])
		).join("\n");
		assert.equal(
			playerText.includes(staleTranslationPrefix),
			false,
			`Stale player text: ${playerText}`,
		);
		assert.equal(
			observedTranslations.includes(staleTranslationPrefix),
			false,
			`A late result rendered briefly: ${observedTranslations}`,
		);
		assert.equal(
			await readyNote.getAttribute("data-ot-presentation"),
			"subtitle",
		);
		assert.equal(
			await source.evaluate((element) => getComputedStyle(element).display),
			"none",
			"The translated subtitle should replace the visible native caption.",
		);
		assert.notEqual(
			await readyNote.evaluate((element) => getComputedStyle(element).display),
			"none",
		);
		assert.equal(
			await readyNote
				.locator('[data-ot-role="note-label"]')
				.evaluate((element) => getComputedStyle(element).display),
			"none",
		);
		assert.equal(
			await readyNote.evaluate((element) => getComputedStyle(element).fontSize),
			"24px",
		);
		assert.equal(await control.getAttribute("aria-pressed"), "true");

		await clearStoredSettings(runState.context);
		await page.reload({ waitUntil: "domcontentloaded" });
		const reloadedControl = page.locator(
			"#movie_player [data-ot-youtube-control]",
		);
		await waitFor(async () => (await reloadedControl.count()) === 1, {
			timeoutMessage: "The player control did not return after reload.",
		});
		await reloadedControl.dispatchEvent("click");
		await waitFor(
			async () =>
				(await reloadedControl.getAttribute("data-state")) === "error",
			{
				timeoutMessage:
					"Missing settings did not produce a visible player-control error.",
			},
		);
		assert.match(
			(await reloadedControl.getAttribute("aria-label")) || "",
			/(Configure Vibe Translator|could not start)/,
		);
		assert.match(
			(await page
				.locator('[data-ot-role="youtube-diagnostics"]')
				.textContent()) || "",
			/(Configure Vibe Translator|could not start)/,
		);
		assert.equal(await reloadedControl.getAttribute("aria-pressed"), "false");

		await saveOptions(runState.context, runState.extensionId, config, {
			runConnectionTest: false,
		});
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForTimeout(750);
		const noCaptionControl = page.locator(
			"#movie_player [data-ot-youtube-control]",
		);
		await waitFor(async () => (await noCaptionControl.count()) === 1, {
			timeoutMessage: "The no-caption player control did not appear.",
		});
		await suppressVisibleCaptions(page);
		await noCaptionControl.click();
		await waitFor(
			async () =>
				/YouTube captions are not visible/.test(
					(await page
						.locator('[data-ot-role="youtube-diagnostics"]')
						.textContent()) || "",
				),
			{
				timeoutMs: 8000,
				timeoutMessage:
					"Missing native captions did not produce actionable feedback.",
			},
		);
		await stopSuppressingVisibleCaptions(page);

		await takeScreenshot(
			page,
			config.artifactsDir,
			"youtube-subtitle-translation.png",
			false,
		);
		await page.close();
		console.log("YouTube subtitle translation smoke passed.");
	} finally {
		await closeExtensionContext(runState);
		await mockApiServer.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
