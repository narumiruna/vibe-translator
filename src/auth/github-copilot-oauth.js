import {
	asRecord,
	oauthErrorCode,
	pollDeviceAuthorization,
	positiveNumber,
	readJsonResponse,
	requiredString,
	trustedHttpUrl,
} from "./oauth-utils.js";

const GITHUB_COPILOT_OAUTH_ORIGINS = Object.freeze([
	"https://github.com/*",
	"https://api.github.com/*",
	"https://*.githubcopilot.com/*",
]);
const CLIENT_ID = atob("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const DEFAULT_API_URL = "https://api.individual.githubcopilot.com";
const COPILOT_API_VERSION = "2026-06-01";
const COPILOT_HEADERS = Object.freeze({
	"Copilot-Integration-Id": "vscode-chat",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"User-Agent": "GitHubCopilotChat/0.35.0",
});

function getGitHubCopilotBaseUrl(token) {
	const proxyHost = String(token || "").match(/(?:^|;)proxy-ep=([^;]+)/u)?.[1];
	if (!proxyHost || !/^[a-z0-9.-]+$/iu.test(proxyHost)) {
		return DEFAULT_API_URL;
	}
	return `https://${proxyHost.replace(/^proxy\./u, "api.")}`;
}

function availableModelIds(body) {
	const data = asRecord(
		body,
		"GitHub Copilot returned an invalid model list.",
	).data;
	if (!Array.isArray(data)) {
		throw new Error("GitHub Copilot returned an invalid model list.");
	}
	const models = data.flatMap((value) => {
		if (!value || typeof value !== "object" || typeof value.id !== "string") {
			return [];
		}
		if (value.capabilities?.supports?.tool_calls === false) {
			return [];
		}
		return [
			{
				id: value.id,
				pickerEnabled: value.model_picker_enabled === true,
				policyState: value.policy?.state,
			},
		];
	});
	const pickerModels = models
		.filter((model) => model.pickerEnabled && model.policyState !== "disabled")
		.map((model) => model.id);
	return pickerModels.length > 0
		? pickerModels
		: models
				.filter((model) => model.policyState === "enabled")
				.map((model) => model.id);
}

async function requestJson(fetchImpl, url, init, providerName) {
	const response = await fetchImpl(url, init);
	const body = await readJsonResponse(response, providerName);
	if (!response.ok) {
		throw new Error(`${providerName} request failed (${response.status}).`);
	}
	return body;
}

async function requestDevice(fetchImpl, signal) {
	const body = await requestJson(
		fetchImpl,
		DEVICE_CODE_URL,
		{
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ client_id: CLIENT_ID, scope: "read:user" }),
			signal,
		},
		"GitHub",
	);
	return {
		deviceCode: requiredString(body, "device_code", "GitHub"),
		expiresInSeconds: positiveNumber(body, "expires_in", "GitHub"),
		intervalSeconds:
			typeof body.interval === "number" ? body.interval : undefined,
		userCode: requiredString(body, "user_code", "GitHub"),
		verificationUri: trustedHttpUrl(
			requiredString(body, "verification_uri", "GitHub"),
			"GitHub",
			true,
		),
	};
}

async function requestGitHubAccessToken(
	fetchImpl,
	device,
	signal,
	pollOptions,
) {
	return pollDeviceAuthorization({
		...pollOptions,
		expiresInSeconds: device.expiresInSeconds,
		intervalSeconds: device.intervalSeconds,
		signal,
		async poll() {
			const response = await fetchImpl(ACCESS_TOKEN_URL, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					client_id: CLIENT_ID,
					device_code: device.deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				}),
				signal,
			});
			const body = await readJsonResponse(response, "GitHub");
			if (response.ok && typeof body.access_token === "string") {
				return { status: "complete", value: body.access_token };
			}
			const code = oauthErrorCode(body);
			if (code === "authorization_pending") {
				return { status: "pending" };
			}
			if (code === "slow_down") {
				return {
					status: "slow_down",
					intervalSeconds:
						typeof body.interval === "number" ? body.interval : undefined,
				};
			}
			if (code === "access_denied") {
				return { status: "failed", message: "GitHub login was denied." };
			}
			if (code === "expired_token") {
				return { status: "failed", message: "GitHub login expired." };
			}
			return {
				status: "failed",
				message: `GitHub device login failed (${response.status}).`,
			};
		},
	});
}

async function requestCopilotCredential(fetchImpl, githubToken, signal) {
	const body = await requestJson(
		fetchImpl,
		COPILOT_TOKEN_URL,
		{
			headers: {
				...COPILOT_HEADERS,
				Accept: "application/json",
				Authorization: `Bearer ${githubToken}`,
			},
			signal,
		},
		"GitHub Copilot",
	);
	return {
		type: "oauth",
		access: requiredString(body, "token", "GitHub Copilot"),
		expires:
			positiveNumber(body, "expires_at", "GitHub Copilot") * 1000 -
			5 * 60 * 1000,
		refresh: githubToken,
	};
}

async function requestAvailableModels(fetchImpl, credential, signal) {
	const response = await fetchImpl(
		`${getGitHubCopilotBaseUrl(credential.access)}/models`,
		{
			headers: {
				...COPILOT_HEADERS,
				Accept: "application/json",
				Authorization: `Bearer ${credential.access}`,
				"X-GitHub-Api-Version": COPILOT_API_VERSION,
			},
			signal,
		},
	);
	const body = await readJsonResponse(response, "GitHub Copilot");
	if (!response.ok) {
		throw new Error(
			`GitHub Copilot model request failed (${response.status}).`,
		);
	}
	return availableModelIds(body);
}

function createBrowserGitHubCopilotOAuth(options = {}) {
	const fetchImpl =
		options.fetch || ((input, init) => globalThis.fetch(input, init));
	const pollOptions = {
		...(options.now ? { now: options.now } : {}),
		...(options.sleep ? { sleep: options.sleep } : {}),
	};

	async function refresh(refreshToken, signal) {
		const credential = await requestCopilotCredential(
			fetchImpl,
			refreshToken,
			signal,
		);
		return {
			...credential,
			availableModelIds: await requestAvailableModels(
				fetchImpl,
				credential,
				signal,
			),
		};
	}

	return {
		name: "GitHub Copilot",
		isSubscription: true,
		async login(interaction) {
			const device = await requestDevice(fetchImpl, interaction.signal);
			interaction.notify({
				type: "device_code",
				expiresInSeconds: device.expiresInSeconds,
				intervalSeconds: device.intervalSeconds,
				userCode: device.userCode,
				verificationUri: device.verificationUri,
			});
			const githubToken = await requestGitHubAccessToken(
				fetchImpl,
				device,
				interaction.signal,
				pollOptions,
			);
			interaction.notify({
				type: "progress",
				message: "Loading GitHub Copilot models…",
			});
			return refresh(githubToken, interaction.signal);
		},
		refresh(credential, signal) {
			return refresh(credential.refresh, signal);
		},
		async toAuth(credential) {
			return {
				apiKey: credential.access,
				baseUrl: getGitHubCopilotBaseUrl(credential.access),
			};
		},
	};
}

export {
	createBrowserGitHubCopilotOAuth,
	GITHUB_COPILOT_OAUTH_ORIGINS,
	getGitHubCopilotBaseUrl,
};
