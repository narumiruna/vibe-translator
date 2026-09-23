import assert from "node:assert/strict";
import test from "node:test";

import {
	createBrowserOAuth,
	getBrowserOAuthOrigins,
	getBrowserOAuthProviderIds,
	getProvidersForOAuthOrigins,
} from "../src/auth/browser-oauth.js";
import { createBrowserXaiOAuth } from "../src/auth/xai-oauth.js";

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
		status,
	});
}

test("browser OAuth registry covers every pi-ai account provider", () => {
	assert.deepEqual(getBrowserOAuthProviderIds().sort(), [
		"anthropic",
		"github-copilot",
		"kimi-coding",
		"openai-codex",
		"openrouter",
		"radius",
		"xai",
	]);
	for (const providerId of getBrowserOAuthProviderIds()) {
		const oauth = createBrowserOAuth(providerId);
		assert.equal(typeof oauth.login, "function");
		assert.equal(typeof oauth.refresh, "function");
		assert.equal(typeof oauth.toAuth, "function");
		assert.ok(getBrowserOAuthOrigins(providerId).length > 0);
	}
	assert.equal(createBrowserOAuth("openai"), undefined);
	assert.deepEqual(getBrowserOAuthOrigins("openai"), []);
});

test("removed OAuth origins identify only affected stored credentials", () => {
	assert.deepEqual(
		getProvidersForOAuthOrigins([
			"https://auth.x.ai/*",
			"https://openrouter.ai/*",
		]),
		["openrouter", "xai"],
	);
	assert.deepEqual(getProvidersForOAuthOrigins(["https://api.x.ai/*"]), []);
});

test("xAI browser OAuth completes a device flow and derives request auth", async () => {
	const requests = [];
	const responses = [
		jsonResponse({
			device_code: "device-code",
			expires_in: 900,
			interval: 1,
			user_code: "USER-CODE",
			verification_uri: "https://auth.x.ai/device",
		}),
		jsonResponse({
			access_token: "access-token",
			expires_in: 3600,
			refresh_token: "refresh-token",
		}),
	];
	const oauth = createBrowserXaiOAuth({
		async fetch(url, init) {
			requests.push({ body: String(init.body), url: String(url) });
			return responses.shift();
		},
		now: () => 1_000_000,
		sleep: async () => {},
	});
	const events = [];
	const credential = await oauth.login({
		notify: (event) => events.push(event),
		prompt: async () => "",
		signal: new AbortController().signal,
	});

	assert.equal(requests.length, 2);
	assert.match(requests[0].url, /oauth2\/device\/code$/u);
	assert.match(requests[1].body, /device_code=device-code/u);
	assert.deepEqual(events, [
		{
			type: "device_code",
			expiresInSeconds: 900,
			intervalSeconds: 1,
			userCode: "USER-CODE",
			verificationUri: "https://auth.x.ai/device",
		},
	]);
	assert.deepEqual(credential, {
		type: "oauth",
		access: "access-token",
		expires: 4_300_000,
		refresh: "refresh-token",
	});
	assert.deepEqual(await oauth.toAuth(credential), {
		apiKey: "access-token",
	});
});
