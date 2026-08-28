#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");

const AxeBuilder = require("@axe-core/playwright").default;

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
} = require("./lib/extension-test-helpers.cjs");

const PDF_PATH = "/test/fixtures/pdf/two-column.pdf";
const ENCRYPTED_PDF_PATH = path.join(
	ROOT_DIR,
	"test/fixtures/pdf/encrypted.pdf",
);
const MALFORMED_PDF_PATH = path.join(
	ROOT_DIR,
	"test/fixtures/pdf/malformed.pdf",
);

async function main() {
	const config = getConfig();
	assert.equal(
		config.useMockApi,
		true,
		"PDF E2E must use PLAYWRIGHT_MOCK_API=1.",
	);
	const server = await createStaticServer(ROOT_DIR);
	const mockApiServer = await createMockApiServer();
	config.baseUrl = mockApiServer.baseUrl;
	let runState;

	try {
		runState = await launchExtensionContext(config, [`${server.origin}/*`]);
		await saveOptions(runState.context, runState.extensionId, config, {
			requiredGlobals: true,
		});

		const sourcePage = await runState.context.newPage();
		const sourceUrl = `${server.origin}${PDF_PATH}`;
		await sourcePage.goto(sourceUrl, { waitUntil: "domcontentloaded" });
		mockApiServer.setFailOnTextIncludes("multi-column reading order");
		const opened = await callBackground(runState.context, "openPdf", {
			pageUrl: sourceUrl,
		});
		assert.equal(opened.ok, true);

		const reader = await waitFor(
			async () =>
				runState.context
					.pages()
					.find((page) => page.url().includes("/sidebar/index.html")),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "PDF reader tab did not open.",
			},
		);
		await reader.waitForLoadState("domcontentloaded");
		if (process.env.PLAYWRIGHT_DEBUG_CONSOLE === "1") {
			reader.on("requestfailed", (request) =>
				console.error(
					"[reader request failed]",
					request.url(),
					request.failure(),
				),
			);
			reader.on("response", (response) => {
				if (!response.ok()) {
					console.error("[reader response]", response.status(), response.url());
				}
			});
		}
		await waitFor(
			async () => {
				const pageCount = await reader.locator(".pdf-page").count();
				if (process.env.PLAYWRIGHT_DEBUG_CONSOLE === "1" && pageCount !== 3) {
					console.error(
						"[reader state]",
						await reader.locator("#document-status").textContent(),
						await reader.locator("#error").textContent(),
					);
				}
				return pageCount === 3;
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "PDF pages were not analyzed.",
			},
		);
		await waitFor(
			async () =>
				/Page 1 \/ 3/.test(
					(await reader.locator("#page-status").textContent()) || "",
				),
			{ timeoutMessage: "PDF page status did not settle." },
		);
		await waitFor(
			async () => (await reader.locator(".pdf-page canvas").count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "PDF canvas did not render.",
			},
		);
		assert.ok(await reader.locator(".text-layer span").count());
		await waitFor(
			async () =>
				(await reader
					.locator('.translation-block[data-state="ready"]')
					.count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "No progressive PDF translation appeared.",
			},
		);
		await waitFor(
			async () =>
				(await reader
					.locator('.translation-block[data-state="failed"]')
					.count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Expected PDF partial failure was not shown.",
			},
		);
		mockApiServer.setFailOnTextIncludes("");
		await reader.locator("#retry-failed").click();
		await waitFor(
			async () =>
				(await reader
					.locator('.translation-block[data-state="failed"]')
					.count()) === 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "PDF retry did not recover failed blocks.",
			},
		);

		await reader
			.locator('.translation-block[data-state="ready"]')
			.first()
			.click();
		await waitFor(
			async () => (await reader.locator(".source-highlight").count()) > 0,
			{ timeoutMessage: "Translated block did not highlight its source." },
		);
		await reader.locator("#copy-page").click();
		await waitFor(
			async () =>
				/Copied page/i.test(
					(await reader.locator("#document-status").textContent()) || "",
				),
			{ timeoutMessage: "Copy page did not complete." },
		);
		let confirmationText = "";
		reader.once("dialog", async (dialog) => {
			confirmationText = dialog.message();
			await dialog.accept();
		});
		await reader.locator("#translate-all").click();
		await waitFor(async () => confirmationText, {
			timeoutMessage: "Complete-document confirmation did not open.",
		});
		assert.match(confirmationText, /remaining blocks.*characters/i);
		await reader.locator("#pause-translation").click();
		assert.equal(
			await reader.locator("#pause-translation").textContent(),
			"Resume",
		);
		await reader.locator("#pause-translation").click();
		assert.equal(
			await reader.locator("#pause-translation").textContent(),
			"Pause",
		);

		await reader.locator("#next-page").click();
		await waitFor(
			async () =>
				/Page 2 \/ 3/.test(
					(await reader.locator("#page-status").textContent()) || "",
				),
			{ timeoutMessage: "PDF page navigation did not update." },
		);
		const translatedText = (
			(await reader
				.locator('.translation-block[data-state="ready"]')
				.first()
				.textContent()) || ""
		).trim();
		assert.ok(translatedText.length > 3);
		await reader
			.locator("#translation-search")
			.fill(translatedText.slice(0, 4));
		assert.ok(await reader.locator(".translation-block:not([hidden])").count());
		await reader.setViewportSize({ height: 760, width: 390 });
		assert.equal(
			await reader.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			true,
		);
		await reader.emulateMedia({ reducedMotion: "reduce" });
		await reader.reload({ waitUntil: "domcontentloaded" });
		await waitFor(
			async () =>
				(await reader.locator(".pdf-page").count()) === 3 &&
				(await reader
					.locator('.translation-block[data-state="ready"]')
					.count()) > 0,
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "PDF reader did not recover after reload.",
			},
		);
		const accessibility = await new AxeBuilder({ page: reader }).analyze();
		assert.deepEqual(
			accessibility.violations,
			[],
			`PDF reader accessibility violations: ${accessibility.violations
				.map((violation) => violation.id)
				.join(", ")}`,
		);

		await reader.locator("#local-file").setInputFiles(ENCRYPTED_PDF_PATH);
		await reader.locator("#password-dialog").waitFor({ state: "visible" });
		await reader.locator("#pdf-password").fill("wrong-password");
		await reader.locator("#submit-password").click();
		await reader.locator("#password-dialog").waitFor({ state: "visible" });
		assert.match(
			(await reader.locator("#password-dialog p").textContent()) || "",
			/incorrect/i,
		);
		await reader.locator("#pdf-password").fill("vibe-test");
		await reader.locator("#submit-password").click();
		await waitFor(
			async () =>
				/3 pages ready|blocks translated/i.test(
					(await reader.locator("#document-status").textContent()) || "",
				),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Encrypted local PDF did not open.",
			},
		);

		const readableTitle = await reader.locator("#document-title").textContent();
		await reader.locator("#local-file").setInputFiles(MALFORMED_PDF_PATH);
		await waitFor(
			async () =>
				/invalid pdf|invalid structure/i.test(
					(await reader.locator("#error").textContent()) || "",
				),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Malformed PDF did not report an error.",
			},
		);
		assert.equal(
			await reader.locator("#document-title").textContent(),
			readableTitle,
		);
		assert.ok(await reader.locator(".pdf-page canvas").count());

		await reader.locator("#local-file").setInputFiles(ENCRYPTED_PDF_PATH);
		await reader.locator("#password-dialog").waitFor({ state: "visible" });
		await reader.locator('#password-dialog button[value="cancel"]').click();
		await waitFor(
			async () =>
				/password/i.test((await reader.locator("#error").textContent()) || ""),
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Encrypted PDF cancellation did not settle.",
			},
		);
		assert.equal(
			await reader.locator("#document-title").textContent(),
			readableTitle,
		);

		await takeScreenshot(
			reader,
			config.artifactsDir,
			"pdf-translation-smoke.png",
			false,
		);
		await reader.locator("#cancel-translation").click();
		await waitFor(
			async () =>
				/cancelled/i.test(
					(await reader.locator("#document-status").textContent()) || "",
				),
			{ timeoutMessage: "PDF session did not cancel." },
		);
		await reader.close();
		await sourcePage.close();
	} finally {
		mockApiServer.setFailOnTextIncludes("");
		await closeExtensionContext(runState);
		await mockApiServer.close();
		await server.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
