import assert from "node:assert/strict";
import test from "node:test";

import {
	exchangeDeviceCode,
	extractAccountId,
	pollDeviceAuthorization,
	refreshCodexCredential,
	requestDeviceAuthorization,
} from "../src/auth/codex-oauth.js";

function jwt(accountId = "acct-123") {
	const payload = btoa(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: accountId },
		}),
	)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
	return `header.${payload}.signature`;
}

const device = {
	deviceAuthId: "device-1",
	userCode: "ABCD-EFGH",
	verificationUri: "https://auth.openai.com/codex/device",
	intervalSeconds: 1,
	expiresInSeconds: 900,
};

test("Codex device flow parses authorization and token responses", async () => {
	const access = jwt();
	const responses = [
		new Response(
			JSON.stringify({
				device_auth_id: "device-1",
				user_code: "ABCD-EFGH",
				interval: "1",
			}),
			{ status: 200 },
		),
		new Response(
			JSON.stringify({
				authorization_code: "code",
				code_verifier: "verifier",
			}),
			{ status: 200 },
		),
		new Response(
			JSON.stringify({
				access_token: access,
				refresh_token: "refresh",
				expires_in: 3600,
			}),
			{ status: 200 },
		),
	];
	const requests = [];
	let now = 1000;
	const dependencies = {
		async fetch(_url, options) {
			requests.push(options);
			return responses.shift();
		},
		now: () => now,
		async sleep(milliseconds) {
			now += milliseconds;
		},
	};
	const signal = new AbortController().signal;

	const authorization = await requestDeviceAuthorization(signal, dependencies);
	const code = await pollDeviceAuthorization(
		authorization,
		signal,
		dependencies,
	);
	const credential = await exchangeDeviceCode(code, signal, dependencies);

	assert.deepEqual(authorization, device);
	assert.equal(credential.accountId, "acct-123");
	assert.equal(credential.refresh, "refresh");
	assert.equal(credential.expires, now + 3_600_000);
	assert.match(requests[2].body.toString(), /code_verifier=verifier/u);
});

test("Codex polling handles pending, slowdown, denial, and local expiry", async () => {
	let now = 0;
	const sleeps = [];
	const responses = [
		new Response("", { status: 403 }),
		new Response(JSON.stringify({ error: "slow_down" }), { status: 429 }),
		new Response(
			JSON.stringify({
				authorization_code: "code",
				code_verifier: "verifier",
			}),
			{ status: 200 },
		),
	];
	const result = await pollDeviceAuthorization(
		device,
		new AbortController().signal,
		{
			async fetch() {
				return responses.shift();
			},
			now: () => now,
			async sleep(milliseconds) {
				sleeps.push(milliseconds);
				now += milliseconds;
			},
		},
	);
	assert.deepEqual(result, {
		authorizationCode: "code",
		codeVerifier: "verifier",
	});
	assert.deepEqual(sleeps, [1000, 1000, 6000]);

	await assert.rejects(
		pollDeviceAuthorization(device, new AbortController().signal, {
			async fetch() {
				return new Response(JSON.stringify({ error: "access_denied" }), {
					status: 400,
				});
			},
			now: () => 0,
			async sleep() {},
		}),
		/denied/u,
	);

	await assert.rejects(
		pollDeviceAuthorization(
			{ ...device, expiresInSeconds: 1 },
			new AbortController().signal,
			{
				async fetch() {
					throw new Error("should not fetch");
				},
				now: () => now,
				async sleep(milliseconds) {
					now += milliseconds;
				},
			},
		),
		/expired/u,
	);
});

test("Codex tokens require an account claim and preserve rotated refresh tokens", async () => {
	assert.equal(extractAccountId(jwt("account-x")), "account-x");
	assert.throws(() => extractAccountId("not-a-jwt"), /account ID/u);
	const credential = await refreshCodexCredential(
		{ type: "oauth", access: jwt(), refresh: "old", expires: 0 },
		new AbortController().signal,
		{
			async fetch() {
				return new Response(
					JSON.stringify({
						access_token: jwt("account-x"),
						refresh_token: "rotated",
						expires_in: 60,
					}),
					{ status: 200 },
				);
			},
			now: () => 500,
		},
	);

	assert.equal(credential.refresh, "rotated");
	assert.equal(credential.expires, 60_500);
});
