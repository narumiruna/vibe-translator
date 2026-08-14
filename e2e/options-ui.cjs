#!/usr/bin/env node

const assert = require("node:assert/strict");

const AxeBuilder = require("@axe-core/playwright").default;

const {
	closeExtensionContext,
	createMockApiServer,
	getConfig,
	getOptionsUrl,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
} = require("./lib/extension-test-helpers.cjs");

async function expectNoSeriousAccessibilityFindings(page) {
	const results = await new AxeBuilder({ page }).analyze();
	const findings = results.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact),
	);

	assert.deepEqual(
		findings.map(({ id, impact, nodes }) => ({
			id,
			impact,
			targets: nodes.map((node) => node.target),
		})),
		[],
		"Expected no serious or critical accessibility findings.",
	);
}

async function expectResponsiveLayout(page, width, height) {
	await page.setViewportSize({ height, width });
	await page.waitForTimeout(100);
	const bounds = await page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}));

	assert.ok(
		bounds.scrollWidth <= bounds.clientWidth,
		`Options overflowed horizontally at ${width}px: ${JSON.stringify(bounds)}`,
	);
	await page.locator("#save-button").scrollIntoViewIfNeeded();
	assert.equal(await page.locator("#save-button").isVisible(), true);
}

async function waitForStatus(page, matcher, message) {
	return waitFor(
		async () => {
			const text = (await page.locator("#test-status").textContent()) || "";
			return matcher.test(text) ? text : "";
		},
		{ timeoutMessage: message },
	);
}

async function waitForTestReady(page) {
	await waitFor(async () => page.locator("#test-button").isEnabled(), {
		timeoutMessage: "Connection-test action did not become available.",
	});
}

async function main() {
	const config = getConfig();
	const mockApiServer = await createMockApiServer();
	let runState;

	config.baseUrl = mockApiServer.baseUrl;

	try {
		runState = await launchExtensionContext(config);
		await saveOptions(runState.context, runState.extensionId, config, {
			requiredGlobals: true,
			runConnectionTest: false,
		});

		const page = await runState.context.newPage();
		const pageErrors = [];
		const consoleErrors = [];

		page.on("pageerror", (error) => pageErrors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") {
				consoleErrors.push(message.text());
			}
		});
		await page.goto(
			await getOptionsUrl(runState.context, runState.extensionId),
			{ waitUntil: "domcontentloaded" },
		);
		await waitFor(
			async () =>
				(await page.locator("#api-key").inputValue()) === config.apiKey,
			{ timeoutMessage: "Options settings did not load." },
		);
		assert.equal(await page.locator(".radix-themes").count(), 1);
		assert.match(
			(await page.locator("#permission-status").textContent()) || "",
			/Granted for/u,
		);

		const tabList = page.getByRole("tablist", { name: "Settings sections" });
		const setupTab = page.getByRole("tab", { name: "Setup" });
		const appearanceTab = page.getByRole("tab", { name: "Appearance" });
		const promptsTab = page.getByRole("tab", { name: "Prompts" });
		const advancedTab = page.getByRole("tab", { name: "Advanced" });

		assert.equal(await tabList.count(), 1);
		assert.equal(await page.getByRole("tab").count(), 4);
		const tabAccessibilityTree = await tabList.ariaSnapshot();
		const setupAccessibilityTree = await page
			.locator('[data-panel="setup"]')
			.ariaSnapshot();
		assert.match(tabAccessibilityTree, /tab "Setup" \[selected\]/u);
		assert.match(setupAccessibilityTree, /Original and translation/u);
		assert.match(setupAccessibilityTree, /API Key/u);
		assert.match(setupAccessibilityTree, /Connection Test/u);
		await setupTab.focus();
		await page.keyboard.press("ArrowRight");
		await waitFor(
			async () =>
				(await appearanceTab.getAttribute("aria-selected")) === "true",
			{ timeoutMessage: "Arrow-key tab activation did not settle." },
		);
		assert.equal(
			await page.getByRole("heading", { name: "Appearance" }).isVisible(),
			true,
		);

		await setupTab.click();
		const bilingualRadio = page.getByRole("radio", {
			name: /Original and translation/u,
		});
		const translationOnlyRadio = page.getByRole("radio", {
			name: /Translation only/u,
		});
		await bilingualRadio.focus();
		await page.keyboard.press("Space");
		assert.equal(await bilingualRadio.isChecked(), true);
		await page.keyboard.press("ArrowDown");
		assert.equal(await translationOnlyRadio.isChecked(), true);

		await promptsTab.click();
		const systemPrompt = page.locator("#system-prompt-template");
		const originalPrompt = await systemPrompt.inputValue();
		await systemPrompt.fill(`${originalPrompt}\nKeep this draft.`);
		await setupTab.click();
		await promptsTab.click();
		assert.match(await systemPrompt.inputValue(), /Keep this draft\./u);
		assert.match(
			await page.locator("#system-prompt-preview").inputValue(),
			/Keep this draft\./u,
		);
		await page
			.locator("#user-prompt-template")
			.fill("Return JSON translations in the selected language.");
		assert.match(
			(await page.locator("#prompt-lint-status").textContent()) || "",
			/sourcePayload/u,
		);
		await page.locator("#reset-user-prompt-button").click();
		assert.match(
			await page.locator("#user-prompt-template").inputValue(),
			/\{\{sourcePayload\}\}/u,
		);
		await page.locator("#reset-system-prompt-button").click();
		assert.doesNotMatch(await systemPrompt.inputValue(), /Keep this draft\./u);
		await systemPrompt.fill(
			`${await systemPrompt.inputValue()}\nKeep this draft.`,
		);

		await advancedTab.click();
		await page.locator("#show-translation-debug-info").check();
		await page
			.locator("#disabled-domains")
			.fill(" EXAMPLE.COM, chat.openai.com ");

		await appearanceTab.click();
		await page
			.locator("#selection-panel-position-mode")
			.selectOption("bottom-right");
		await page.getByRole("button", { name: "Typography" }).click();
		assert.equal(await page.locator("#inline-font-size").isVisible(), true);
		assert.equal(
			await page
				.locator('[data-appearance-theme="light"]')
				.getAttribute("aria-checked"),
			"true",
		);

		await promptsTab.click();
		await page
			.locator("#user-prompt-template")
			.fill("Translate without the required source placeholder.");
		await setupTab.click();
		await bilingualRadio.check();
		await page.locator("#base-url").fill("https://example.com/not-v1");
		await page.locator("#save-button").click();
		await waitFor(
			async () =>
				/Base URL must include \/v1/u.test(
					(await page.locator("#form-status").textContent()) || "",
				),
			{
				timeoutMessage: "Invalid Base URL did not produce a validation error.",
			},
		);
		assert.equal(
			await page.locator("#base-url").getAttribute("aria-invalid"),
			"true",
		);
		assert.match(
			(await page.locator("#base-url").getAttribute("aria-describedby")) || "",
			/form-status/u,
		);
		await promptsTab.click();
		assert.equal(
			await page.locator("#user-prompt-template").getAttribute("aria-invalid"),
			"true",
		);
		await setupTab.click();
		await page.locator("#base-url").fill(config.baseUrl);
		assert.equal(
			await page.locator("#base-url").getAttribute("aria-invalid"),
			null,
		);
		await promptsTab.click();
		assert.equal(
			await page.locator("#user-prompt-template").getAttribute("aria-invalid"),
			"true",
		);
		await page.locator("#reset-user-prompt-button").click();
		assert.equal(
			await page.locator("#user-prompt-template").getAttribute("aria-invalid"),
			null,
		);
		await setupTab.click();
		await page.locator("#base-url").blur();
		await waitFor(
			async () =>
				/Granted for/u.test(
					(await page.locator("#permission-status").textContent()) || "",
				),
			{ timeoutMessage: "Permission status did not recover." },
		);

		await page.locator("#save-button").click();
		await waitFor(
			async () =>
				/Settings saved/u.test(
					(await page.locator("#form-status").textContent()) || "",
				),
			{ timeoutMessage: "Settings did not save." },
		);
		assert.match(
			(await page.locator("#save-state").textContent()) || "",
			/No unsaved changes/u,
		);

		await page.reload({ waitUntil: "domcontentloaded" });
		await waitFor(
			async () =>
				(await page.locator("#api-key").inputValue()) === config.apiKey,
			{ timeoutMessage: "Saved settings did not reload." },
		);
		assert.equal(await bilingualRadio.isChecked(), true);
		assert.equal(
			await page.locator("#selection-panel-position-mode").inputValue(),
			"bottom-right",
		);
		assert.equal(
			await page.locator("#show-translation-debug-info").isChecked(),
			true,
		);
		assert.equal(
			await page.locator("#disabled-domains").inputValue(),
			"example.com\nchat.openai.com",
		);
		assert.match(await systemPrompt.inputValue(), /Keep this draft\./u);

		for (const tab of [setupTab, appearanceTab, promptsTab, advancedTab]) {
			await tab.click();
			await expectNoSeriousAccessibilityFindings(page);
		}

		await appearanceTab.click();
		await page.getByRole("button", { name: "Typography" }).click();
		await expectResponsiveLayout(page, 320, 720);
		await expectResponsiveLayout(page, 390, 844);
		await expectResponsiveLayout(page, 720, 900);
		await expectResponsiveLayout(page, 1280, 900);
		await takeScreenshot(page, config.artifactsDir, "radix-options-light.png");

		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await expectResponsiveLayout(page, 390, 844);
		await takeScreenshot(
			page,
			config.artifactsDir,
			"radix-options-dark-mobile.png",
		);
		await page.emulateMedia({
			forcedColors: "active",
			reducedMotion: "reduce",
		});
		assert.equal(await page.locator("#save-button").isVisible(), true);
		await page.emulateMedia({ colorScheme: "light", forcedColors: "none" });

		await page.setViewportSize({ height: 900, width: 1280 });
		await page.evaluate(() => {
			document.documentElement.style.zoom = "2";
		});
		const zoomBounds = await page.evaluate(() => ({
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
		}));
		assert.ok(zoomBounds.scrollWidth <= zoomBounds.clientWidth);
		await page.evaluate(() => {
			document.documentElement.style.zoom = "";
		});

		await setupTab.click();
		mockApiServer.failNextResponses();
		await page.locator("#test-button").click();
		await waitForStatus(
			page,
			/Connection test failed\./u,
			"Connection failure did not render.",
		);
		assert.match(
			(await page.locator("#form-status").textContent()) || "",
			/Mock translation failure\./u,
		);
		await waitForTestReady(page);
		await page.locator("#test-button").click();
		await waitForStatus(
			page,
			/^Sample translation:/u,
			"Connection retry did not recover.",
		);
		await waitForTestReady(page);

		mockApiServer.setResponseDelayMs(250);
		await page.locator("#model").fill(`${config.model}-pending-edit`);
		await page.locator("#test-button").click();
		await waitForStatus(
			page,
			/Testing connection/u,
			"Delayed connection test did not start.",
		);
		await page.locator("#target-language").fill("日本語");
		await promptsTab.click();
		await setupTab.click();
		await waitForStatus(
			page,
			/^Sample translation:/u,
			"Delayed connection test did not settle.",
		);
		assert.equal(await page.locator("#target-language").inputValue(), "日本語");
		assert.match(
			(await page.locator("#test-details").textContent()) || "",
			/earlier values/u,
		);
		mockApiServer.setResponseDelayMs(0);
		await waitForTestReady(page);

		await page.locator("#model").fill(`${config.model}-duplicate-guard`);
		const requestCountBefore = mockApiServer.getResponseRequestCount();
		await page.locator("#test-button").evaluate((button) => {
			button.click();
			button.click();
		});
		await waitFor(
			async () => mockApiServer.getResponseRequestCount() > requestCountBefore,
			{ timeoutMessage: "Duplicate-guard connection request was not sent." },
		);
		await waitForTestReady(page);
		assert.equal(
			mockApiServer.getResponseRequestCount() - requestCountBefore,
			1,
			"One user operation must send one connection-test request.",
		);

		const performanceMetrics = await page.evaluate(() => {
			const navigation = performance.getEntriesByType("navigation")[0];
			const firstContentfulPaint = performance
				.getEntriesByType("paint")
				.find((entry) => entry.name === "first-contentful-paint");
			return {
				domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0,
				firstContentfulPaintMs: firstContentfulPaint?.startTime || 0,
				remoteResources: performance
					.getEntriesByType("resource")
					.map((entry) => entry.name)
					.filter((url) => !url.startsWith("chrome-extension://")),
			};
		});
		assert.ok(performanceMetrics.domContentLoadedMs <= 500);
		assert.ok(performanceMetrics.firstContentfulPaintMs <= 500);
		assert.deepEqual(performanceMetrics.remoteResources, []);
		assert.deepEqual(pageErrors, []);
		assert.deepEqual(consoleErrors, []);
		assert.doesNotMatch(
			JSON.stringify({ consoleErrors, pageErrors }),
			new RegExp(config.apiKey, "u"),
		);
		await page.close();
		console.log(
			`Radix options UI E2E passed (${JSON.stringify(performanceMetrics)}).`,
		);
	} finally {
		await closeExtensionContext(runState);
		await mockApiServer.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
