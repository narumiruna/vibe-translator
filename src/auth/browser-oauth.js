import {
	ANTHROPIC_OAUTH_ORIGINS,
	createBrowserAnthropicOAuth,
} from "./anthropic-oauth.js";
import { AUTH_ORIGINS, createBrowserCodexOAuth } from "./codex-oauth.js";
import {
	createBrowserGitHubCopilotOAuth,
	GITHUB_COPILOT_OAUTH_ORIGINS,
} from "./github-copilot-oauth.js";
import { createBrowserKimiOAuth, KIMI_OAUTH_ORIGINS } from "./kimi-oauth.js";
import {
	createBrowserOpenRouterOAuth,
	OPENROUTER_OAUTH_ORIGINS,
} from "./openrouter-oauth.js";
import {
	createBrowserRadiusOAuth,
	RADIUS_OAUTH_ORIGINS,
} from "./radius-oauth.js";
import { createBrowserXaiOAuth, XAI_OAUTH_ORIGINS } from "./xai-oauth.js";

const BROWSER_OAUTH = Object.freeze({
	anthropic: {
		create: createBrowserAnthropicOAuth,
		origins: ANTHROPIC_OAUTH_ORIGINS,
	},
	"github-copilot": {
		create: createBrowserGitHubCopilotOAuth,
		origins: GITHUB_COPILOT_OAUTH_ORIGINS,
	},
	"kimi-coding": {
		create: createBrowserKimiOAuth,
		origins: KIMI_OAUTH_ORIGINS,
	},
	"openai-codex": {
		create: createBrowserCodexOAuth,
		origins: AUTH_ORIGINS,
	},
	openrouter: {
		create: createBrowserOpenRouterOAuth,
		origins: OPENROUTER_OAUTH_ORIGINS,
	},
	radius: {
		create: createBrowserRadiusOAuth,
		origins: RADIUS_OAUTH_ORIGINS,
	},
	xai: {
		create: createBrowserXaiOAuth,
		origins: XAI_OAUTH_ORIGINS,
	},
});

function createBrowserOAuth(providerId, options) {
	return BROWSER_OAUTH[providerId]?.create(options);
}

function getBrowserOAuthOrigins(providerId) {
	return [...(BROWSER_OAUTH[providerId]?.origins || [])];
}

function getProvidersForOAuthOrigins(origins) {
	const removed = new Set(origins || []);
	return Object.entries(BROWSER_OAUTH)
		.filter(([, value]) => value.origins.some((origin) => removed.has(origin)))
		.map(([providerId]) => providerId);
}

function getBrowserOAuthProviderIds() {
	return Object.keys(BROWSER_OAUTH);
}

export {
	createBrowserOAuth,
	getBrowserOAuthOrigins,
	getBrowserOAuthProviderIds,
	getProvidersForOAuthOrigins,
};
