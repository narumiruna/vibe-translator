#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_ENV_PATH = path.join(ROOT_DIR, ".env");
const DEFAULT_ARTIFACTS_DIR = path.join(ROOT_DIR, "e2e-artifacts");
const FIXTURE_PATH = "/test/fixture-page.html";
const REQUEST_TIMEOUT_MS = 120000;

function loadDotEnv(filePath) {
	if (!fs.existsSync(filePath)) {
		return;
	}

	const content = fs.readFileSync(filePath, "utf8");

	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const separatorIndex = trimmed.indexOf("=");

		if (separatorIndex <= 0) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();

		if (!key || process.env[key] !== undefined) {
			continue;
		}

		let value = trimmed.slice(separatorIndex + 1).trim();

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

function getEnvValue(...keys) {
	for (const key of keys) {
		const value = process.env[key];

		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}

	return "";
}

function getBooleanEnvValue(key, fallback) {
	const value = process.env[key];

	if (value === undefined) {
		return fallback;
	}

	return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function getConfig() {
	loadDotEnv(process.env.PLAYWRIGHT_ENV_FILE || DEFAULT_ENV_PATH);

	const apiKey = getEnvValue("OPENAI_API_KEY");
	const model = getEnvValue("OPENAI_MODEL");

	assert.ok(
		apiKey,
		"Missing API key. Set OPENAI_API_KEY in the environment or .env.",
	);
	assert.ok(
		model,
		"Missing model. Set OPENAI_MODEL in the environment or .env.",
	);

	const baseUrl = getEnvValue("OPENAI_BASE_URL") || "https://api.openai.com/v1";
	const targetLanguage = getEnvValue("TARGET_LANGUAGE") || "台灣正體中文";
	const browserChannel =
		getEnvValue("PLAYWRIGHT_BROWSER_CHANNEL") || "chromium";
	const executablePath = getEnvValue("PLAYWRIGHT_CHROME_EXECUTABLE");

	return {
		apiKey,
		model,
		baseUrl,
		targetLanguage,
		browserChannel,
		executablePath,
		headless: getBooleanEnvValue("PLAYWRIGHT_HEADLESS", false),
		userDataDir: getEnvValue("PLAYWRIGHT_USER_DATA_DIR"),
		artifactsDir: path.resolve(
			ROOT_DIR,
			getEnvValue("PLAYWRIGHT_ARTIFACTS_DIR") || DEFAULT_ARTIFACTS_DIR,
		),
	};
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getContentType(filePath) {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

async function createStaticServer(rootDir) {
	const server = http.createServer(async (request, response) => {
		const requestPath = new URL(request.url || "/", "http://127.0.0.1")
			.pathname;
		const resolvedPath = path.resolve(rootDir, `.${requestPath}`);

		if (!resolvedPath.startsWith(rootDir)) {
			response.writeHead(403).end("Forbidden");
			return;
		}

		try {
			const stats = await fsp.stat(resolvedPath);

			if (!stats.isFile()) {
				response.writeHead(404).end("Not Found");
				return;
			}

			response.writeHead(200, {
				"Content-Type": getContentType(resolvedPath),
			});
			fs.createReadStream(resolvedPath).pipe(response);
		} catch (_error) {
			response.writeHead(404).end("Not Found");
		}
	});

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;

	return {
		origin: `http://127.0.0.1:${port}`,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			}),
	};
}

function getApiPermissionPattern(baseUrl) {
	const url = new URL(baseUrl);
	return `${url.origin}/*`;
}

async function ensureDir(dirPath) {
	await fsp.mkdir(dirPath, { recursive: true });
}

async function clearChromiumProfileLocks(userDataDir) {
	const lockNames = [
		"SingletonCookie",
		"SingletonLock",
		"SingletonSocket",
		"DevToolsActivePort",
	];

	for (const name of lockNames) {
		await fsp.rm(path.join(userDataDir, name), {
			force: true,
			recursive: true,
		});
	}
}

function createLaunchOptions(config, forceHeadless) {
	return {
		headless: forceHeadless ?? config.headless,
		channel: config.executablePath ? undefined : config.browserChannel,
		executablePath: config.executablePath || undefined,
		ignoreDefaultArgs: ["--disable-extensions"],
		args: [
			`--disable-extensions-except=${ROOT_DIR}`,
			`--load-extension=${ROOT_DIR}`,
		],
	};
}

async function readJsonFile(filePath) {
	const content = await fsp.readFile(filePath, "utf8");
	return JSON.parse(content);
}

async function waitFor(predicate, options = {}) {
	const timeoutMs = options.timeoutMs || 10000;
	const intervalMs = options.intervalMs || 250;
	const timeoutMessage =
		options.timeoutMessage || "Timed out waiting for condition.";
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const result = await predicate();

		if (result) {
			return result;
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(timeoutMessage);
}

async function getServiceWorker(context) {
	const existingWorker = context.serviceWorkers()[0];

	if (existingWorker) {
		return existingWorker;
	}

	return context.waitForEvent("serviceworker", { timeout: REQUEST_TIMEOUT_MS });
}

async function hasHostPermission(page, originPattern) {
	return page.evaluate(
		async (pattern) => chrome.permissions.contains({ origins: [pattern] }),
		originPattern,
	);
}

async function waitForText(locator, matcher, timeoutMs, label) {
	return waitFor(
		async () => {
			const text = ((await locator.textContent()) || "").trim();

			if (matcher.test(text)) {
				return text;
			}

			return "";
		},
		{
			timeoutMs,
			timeoutMessage: `${label} did not match ${matcher}`,
		},
	);
}

async function takeScreenshot(page, artifactsDir, fileName) {
	await page.screenshot({
		path: path.join(artifactsDir, fileName),
		fullPage: true,
	});
}

async function getExtensionIdFromPreferences(userDataDir) {
	const preferencesPath = path.join(userDataDir, "Default", "Preferences");

	return waitFor(
		async () => {
			if (!fs.existsSync(preferencesPath)) {
				return "";
			}

			const preferences = await readJsonFile(preferencesPath);
			const extensionEntries = Object.entries(
				preferences?.extensions?.settings || {},
			);

			for (const [extensionId, entry] of extensionEntries) {
				if (path.resolve(entry?.path || "") === ROOT_DIR) {
					return extensionId;
				}
			}

			return "";
		},
		{
			timeoutMs: REQUEST_TIMEOUT_MS,
			timeoutMessage:
				"Could not resolve the unpacked extension id from the Chromium profile.",
		},
	);
}

async function seedHostPermission(userDataDir, originPattern) {
	const preferencesPath = path.join(userDataDir, "Default", "Preferences");
	const preferences = await readJsonFile(preferencesPath);
	const extensionEntries = Object.values(
		preferences?.extensions?.settings || {},
	);
	const extensionEntry = extensionEntries.find(
		(entry) => path.resolve(entry?.path || "") === ROOT_DIR,
	);

	if (!extensionEntry) {
		throw new Error(
			"Could not find the unpacked extension entry in Chromium preferences.",
		);
	}

	for (const permissionBucket of [
		"active_permissions",
		"granted_permissions",
	]) {
		const existingHosts = Array.isArray(
			extensionEntry?.[permissionBucket]?.explicit_host,
		)
			? extensionEntry[permissionBucket].explicit_host
			: [];

		if (!existingHosts.includes(originPattern)) {
			extensionEntry[permissionBucket].explicit_host = [
				...existingHosts,
				originPattern,
			];
		}
	}

	await fsp.writeFile(preferencesPath, JSON.stringify(preferences));
}

async function launchExtensionContext(config, originPatterns) {
	const userDataDir = config.userDataDir
		? path.resolve(ROOT_DIR, config.userDataDir)
		: await fsp.mkdtemp(path.join(os.tmpdir(), "vibe-translator-e2e-"));
	const permissionPatterns = Array.from(
		new Set([
			getApiPermissionPattern(config.baseUrl),
			...(originPatterns || []),
		]),
	);

	await ensureDir(userDataDir);
	await ensureDir(config.artifactsDir);
	await clearChromiumProfileLocks(userDataDir);

	const bootstrapContext = await chromium.launchPersistentContext(
		userDataDir,
		createLaunchOptions(config, true),
	);
	await bootstrapContext.close();

	const extensionId = await getExtensionIdFromPreferences(userDataDir);
	for (const originPattern of permissionPatterns) {
		await seedHostPermission(userDataDir, originPattern);
	}
	await clearChromiumProfileLocks(userDataDir);

	const context = await chromium.launchPersistentContext(
		userDataDir,
		createLaunchOptions(config),
	);

	return {
		context,
		extensionId,
		userDataDir,
		isTemporaryUserDataDir: !config.userDataDir,
	};
}

async function runOptionsSmoke(context, extensionId, config) {
	const page = await context.newPage();
	const optionsUrl = `chrome-extension://${extensionId}/options.html`;
	const originPattern = getApiPermissionPattern(config.baseUrl);

	await page.goto(optionsUrl, { waitUntil: "domcontentloaded" });
	await page.locator("#api-key").fill(config.apiKey);
	await page.locator("#base-url").fill(config.baseUrl);
	await page.locator("#model").fill(config.model);
	await page.locator("#target-language").fill(config.targetLanguage);
	await page
		.locator("#selection-panel-position-mode")
		.selectOption("near-selection");

	assert.equal(
		await hasHostPermission(page, originPattern),
		true,
		`Expected seeded host permission for ${originPattern} before saving settings.`,
	);

	await page.locator("#save-button").click();
	await waitForText(
		page.locator("#form-status"),
		/Settings saved/i,
		15000,
		"Save banner",
	);

	const permissionStatus = await waitForText(
		page.locator("#permission-status"),
		/Granted for/i,
		15000,
		"Permission status",
	);
	assert.match(permissionStatus, /Granted for/i);

	await page.locator("#test-button").click();

	const testStatus = await waitForText(
		page.locator("#test-status"),
		/^Sample translation:/i,
		REQUEST_TIMEOUT_MS,
		"Connection test status",
	);
	assert.doesNotMatch(testStatus, /\(empty\)/i);

	await takeScreenshot(page, config.artifactsDir, "options-smoke.png");
	await page.close();
}

async function callBackground(context, operation, payload) {
	const worker = await getServiceWorker(context);

	return worker.evaluate(
		async ({ type, payload: innerPayload }) => {
			const tabs = await chrome.tabs.query({});
			const tabByUrl = innerPayload?.pageUrl
				? tabs.find((candidate) => candidate.url === innerPayload.pageUrl)
				: null;
			const tab =
				tabByUrl ||
				tabs.find(
					(candidate) => candidate.active && candidate.lastFocusedWindow,
				) ||
				tabs.find((candidate) => candidate.active) ||
				null;

			if (!tab?.id) {
				throw new Error("Could not resolve the active tab for smoke testing.");
			}

			if (type === "translatePage") {
				if (typeof translatePage !== "function") {
					throw new Error(
						"translatePage is not available in the extension service worker.",
					);
				}

				await translatePage({
					...tab,
					url: innerPayload?.pageUrl || tab.url,
				});
				return { tabId: tab.id };
			}

			if (type === "translateSelection") {
				if (typeof translateSelection !== "function") {
					throw new Error(
						"translateSelection is not available in the extension service worker.",
					);
				}

				await translateSelection(tab.id, innerPayload.selectionText, 0);
				return { tabId: tab.id };
			}

			throw new Error(`Unsupported background operation: ${type}`);
		},
		{ type: operation, payload },
	);
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
	let context;
	let extensionId = "";
	let userDataDir = "";
	let isTemporaryUserDataDir = false;

	try {
		({ context, extensionId, userDataDir, isTemporaryUserDataDir } =
			await launchExtensionContext(config, [fixtureOriginPattern]));
		console.log(`Using fixture server: ${server.origin}`);
		console.log(`Using Chrome profile: ${userDataDir}`);

		await runOptionsSmoke(context, extensionId, config);
		console.log("Options smoke passed.");

		await runPageTranslationSmoke(context, server.origin, config.artifactsDir);
		console.log("Page translation smoke passed.");

		await runSelectionTranslationSmoke(
			context,
			server.origin,
			config.targetLanguage,
			config.artifactsDir,
		);
		console.log("Selection translation smoke passed.");
	} finally {
		if (context) {
			await context.close();
		}
		await server.close();

		if (isTemporaryUserDataDir && userDataDir) {
			await fsp.rm(userDataDir, { force: true, recursive: true });
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
