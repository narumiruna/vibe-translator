const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");
const { createMockApiServer } = require("./mock-api-server.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_ENV_PATH = path.join(ROOT_DIR, ".env");
const DEFAULT_ARTIFACTS_DIR = path.join(ROOT_DIR, "e2e-artifacts");
const REQUEST_TIMEOUT_MS = 120000;
const EXTENSION_FILES = [
	"manifest.json",
	"icons/icon-16.png",
	"icons/icon-32.png",
	"icons/icon-48.png",
	"icons/icon-128.png",
	"src/background.js",
	"src/translation-appearance.js",
	"src/content-viewport.js",
	"src/content-selection-panel.js",
	"src/content-site-profiles.js",
	"src/content-subtitles.js",
	"src/embedded-frames.js",
	"src/content-extraction.js",
	"src/content.js",
	"src/page-translation-session.js",
	"src/storage.js",
	"src/api-protected-fragments.js",
	"src/api-cache.js",
	"src/api-chunk-plan.js",
	"src/api-responses.js",
	"src/api.js",
	"src/translator-messages.js",
	"src/youtube-diagnostics.js",
	"src/youtube-player-control.js",
	"src/options.html",
	"src/options.css",
	"src/options-appearance.js",
	"src/options.js",
];

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

	const useMockApi = getBooleanEnvValue("PLAYWRIGHT_MOCK_API", false);
	const apiKey =
		getEnvValue("OPENAI_API_KEY") || (useMockApi ? "mock-api-key" : "");
	const model = getEnvValue("OPENAI_MODEL") || (useMockApi ? "mock-model" : "");

	assert.ok(
		apiKey,
		"Missing API key. Set OPENAI_API_KEY in the environment or .env, or set PLAYWRIGHT_MOCK_API=1.",
	);
	assert.ok(
		model,
		"Missing model. Set OPENAI_MODEL in the environment or .env, or set PLAYWRIGHT_MOCK_API=1.",
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
		useMockApi,
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

async function createE2eExtensionDir(userDataDir, permissionPatterns) {
	const extensionDir = path.join(userDataDir, "extension-under-test");

	await ensureDir(extensionDir);

	for (const relativePath of EXTENSION_FILES) {
		const sourcePath = path.join(ROOT_DIR, relativePath);
		const targetPath = path.join(extensionDir, relativePath);

		await ensureDir(path.dirname(targetPath));
		await fsp.copyFile(sourcePath, targetPath);
	}

	const manifestPath = path.join(extensionDir, "manifest.json");
	const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));

	manifest.host_permissions = Array.from(
		new Set([...(manifest.host_permissions || []), ...permissionPatterns]),
	);
	await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

	return extensionDir;
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

function createLaunchOptions(config, forceHeadless, extensionDir = ROOT_DIR) {
	return {
		headless: forceHeadless ?? config.headless,
		channel: config.executablePath ? undefined : config.browserChannel,
		executablePath: config.executablePath || undefined,
		ignoreDefaultArgs: ["--disable-extensions"],
		args: [
			`--disable-extensions-except=${extensionDir}`,
			`--load-extension=${extensionDir}`,
		],
	};
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

async function waitForText(locator, matcher, timeoutMs, label) {
	let lastText = "";

	try {
		return await waitFor(
			async () => {
				const text = ((await locator.textContent()) || "").trim();

				lastText = text;

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
	} catch (error) {
		error.message = `${error.message}. Last text: ${lastText || "(empty)"}`;
		throw error;
	}
}

async function takeScreenshot(page, artifactsDir, fileName, fullPage = true) {
	await page.screenshot({
		path: path.join(artifactsDir, fileName),
		fullPage,
	});
}

async function launchExtensionContext(config, originPatterns = []) {
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
	const extensionDir = await createE2eExtensionDir(
		userDataDir,
		permissionPatterns,
	);
	await clearChromiumProfileLocks(userDataDir);

	const discoveryContext = await chromium.launchPersistentContext(
		userDataDir,
		createLaunchOptions(config, undefined, extensionDir),
	);
	const discoveryWorker = await getServiceWorker(discoveryContext);
	const extensionId = new URL(discoveryWorker.url()).hostname;
	await discoveryContext.close();
	await clearChromiumProfileLocks(userDataDir);

	const context = await chromium.launchPersistentContext(
		userDataDir,
		createLaunchOptions(config, undefined, extensionDir),
	);

	return {
		context,
		extensionDir,
		extensionId,
		userDataDir,
		isTemporaryUserDataDir: !config.userDataDir,
	};
}

async function getMissingWindowGlobals(page, globalNames) {
	return page.evaluate((names) => {
		return names.filter((name) => typeof window[name] === "undefined");
	}, globalNames || []);
}

async function saveOptions(context, extensionId, config, options = {}) {
	const page = await context.newPage();
	const optionsUrl = `chrome-extension://${extensionId}/src/options.html`;

	await page.goto(optionsUrl, { waitUntil: "domcontentloaded" });
	if (options.requiredGlobals) {
		assert.deepEqual(
			await getMissingWindowGlobals(page, options.requiredGlobals),
			[],
			"Expected options page helper scripts to expose all required globals.",
		);
	}
	await page.locator("#api-key").fill(config.apiKey);
	await page.locator("#base-url").fill(config.baseUrl);
	await page.locator("#model").fill(config.model);
	await page.locator("#target-language").fill(config.targetLanguage);
	await page.locator('[data-tab="appearance"]').click();
	await page
		.locator("#selection-panel-position-mode")
		.selectOption(options.selectionPanelPositionMode || "near-selection");

	if (options.appearancePreset) {
		await page
			.locator("#translation-appearance-preset")
			.selectOption(options.appearancePreset);
	}
	for (const [selector, value] of Object.entries(
		options.appearanceValues || {},
	)) {
		const input = page.locator(selector);

		await input.evaluate((element, nextValue) => {
			if (element.type === "checkbox") {
				element.checked = Boolean(nextValue);
			} else {
				element.value = String(nextValue);
			}
			element.dispatchEvent(new Event("input", { bubbles: true }));
			element.dispatchEvent(new Event("change", { bubbles: true }));
		}, value);
	}

	await page.locator("#save-button").click();
	await waitForText(
		page.locator("#form-status"),
		/Settings saved/i,
		15000,
		"Save banner",
	);

	if (options.expectPermissionStatus !== false) {
		const permissionStatus = await waitForText(
			page.locator("#permission-status"),
			/Granted for/i,
			15000,
			"Permission status",
		);
		assert.match(permissionStatus, /Granted for/i);
	}

	if (options.runConnectionTest) {
		await page.locator("#test-button").click();

		const testStatus = await waitFor(
			async () => {
				const text = (
					(await page.locator("#test-status").textContent()) || ""
				).trim();

				return /^Sample translation:/i.test(text) || /failed/i.test(text)
					? text
					: "";
			},
			{
				timeoutMs: REQUEST_TIMEOUT_MS,
				timeoutMessage: "Connection test status did not settle.",
			},
		);
		const testDetails = (
			(await page.locator("#test-details").textContent()) || ""
		).trim();
		const formStatus = (
			(await page.locator("#form-status").textContent()) || ""
		).trim();

		assert.match(
			testStatus,
			/^Sample translation:/i,
			`Expected successful connection test. Details: ${testDetails} ${formStatus}`,
		);
		assert.doesNotMatch(testStatus, /\(empty\)/i);
	}

	if (options.screenshotName) {
		await takeScreenshot(page, config.artifactsDir, options.screenshotName);
	}

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

			if (type === "getMissingGlobals") {
				return (innerPayload?.globalNames || []).filter(
					(name) => typeof globalThis[name] === "undefined",
				);
			}

			if (type === "getMissingContentGlobals") {
				const [result] = await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					args: [innerPayload?.globalNames || []],
					func: (globalNames) =>
						globalNames.filter(
							(name) => typeof globalThis[name] === "undefined",
						),
				});

				return result?.result || [];
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

				let frameId = Number.isInteger(innerPayload?.frameId)
					? innerPayload.frameId
					: 0;

				if (innerPayload?.frameUrl) {
					const frameResults = await chrome.scripting.executeScript({
						target: { tabId: tab.id, allFrames: true },
						func: () => location.href,
					});
					const frameResult = frameResults.find(
						(result) => result.result === innerPayload.frameUrl,
					);

					if (!frameResult) {
						throw new Error(
							`Could not resolve frame id for ${innerPayload.frameUrl}`,
						);
					}

					frameId = frameResult.frameId;
				}

				await translateSelection(tab.id, innerPayload.selectionText, frameId);
				return { tabId: tab.id, frameId };
			}

			throw new Error(`Unsupported background operation: ${type}`);
		},
		{ type: operation, payload },
	);
}

async function closeExtensionContext(runState) {
	if (runState?.context) {
		await runState.context.close();
	}

	if (runState?.isTemporaryUserDataDir && runState?.userDataDir) {
		await fsp.rm(runState.userDataDir, { force: true, recursive: true });
	}
}

module.exports = {
	ROOT_DIR,
	REQUEST_TIMEOUT_MS,
	callBackground,
	closeExtensionContext,
	createMockApiServer,
	createStaticServer,
	getApiPermissionPattern,
	getConfig,
	launchExtensionContext,
	saveOptions,
	takeScreenshot,
	waitFor,
	getMissingWindowGlobals,
	waitForText,
};
