const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_ENV_PATH = path.join(ROOT_DIR, ".env");
const DEFAULT_ARTIFACTS_DIR = path.join(ROOT_DIR, "e2e-artifacts");
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

function readRequestBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];

		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

function extractJsonObject(text) {
	const source = String(text || "");
	const starts = [];

	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === "{") {
			starts.push(index);
		}
	}

	for (const start of starts.reverse()) {
		for (let end = source.length; end > start; end -= 1) {
			try {
				const parsed = JSON.parse(source.slice(start, end));

				if (parsed?.targetLanguage || parsed?.items || parsed?.text) {
					return parsed;
				}
			} catch (_error) {
				// Keep trimming until any prompt suffix is removed.
			}
		}
	}

	return null;
}

function buildMockTranslations(requestPayload) {
	const input = Array.isArray(requestPayload?.input)
		? requestPayload.input
		: [];
	const userMessage = input.find((item) => item?.role === "user");
	const sourcePayload = extractJsonObject(userMessage?.content);
	const sourceItems = Array.isArray(sourcePayload?.items)
		? sourcePayload.items
		: sourcePayload?.id
			? [sourcePayload]
			: [{ id: "sample", text: "Hello world." }];

	return sourceItems.map((item) => ({
		id: String(item.id),
		translatedText: `[mock:${String(item.text || "").slice(0, 48)}]`,
	}));
}

async function createMockApiServer() {
	const server = http.createServer(async (request, response) => {
		const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

		if (request.method === "GET" && requestUrl.pathname === "/v1/models") {
			response.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
			});
			response.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/v1/responses") {
			let requestPayload = {};

			try {
				requestPayload = JSON.parse(await readRequestBody(request));
			} catch (_error) {
				requestPayload = {};
			}

			const translations = buildMockTranslations(requestPayload);

			response.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
			});
			response.end(
				JSON.stringify({
					output_parsed: { translations },
					output_text: JSON.stringify({ translations }),
				}),
			);
			return;
		}

		response.writeHead(404, {
			"Content-Type": "application/json; charset=utf-8",
		});
		response.end(JSON.stringify({ error: { message: "Not Found" } }));
	});

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;

	return {
		origin: `http://127.0.0.1:${port}`,
		baseUrl: `http://127.0.0.1:${port}/v1`,
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

async function getMissingWindowGlobals(page, globalNames) {
	return page.evaluate((names) => {
		return names.filter((name) => typeof window[name] === "undefined");
	}, globalNames || []);
}

async function saveOptions(context, extensionId, config, options = {}) {
	const page = await context.newPage();
	const optionsUrl = `chrome-extension://${extensionId}/options.html`;
	const originPattern = getApiPermissionPattern(config.baseUrl);

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

				await translateSelection(tab.id, innerPayload.selectionText, 0);
				return { tabId: tab.id };
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
