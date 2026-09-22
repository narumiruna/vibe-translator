import assert from "node:assert/strict";
import test from "node:test";
import { createOptionsApi } from "../src/options/options-api.js";
import * as Messages from "../src/shared/messages.js";
import * as Settings from "../src/shared/settings.js";

function createChromeFake(options = {}) {
	const calls = [];
	return {
		calls,
		chrome: {
			permissions: {
				async contains(permission) {
					calls.push(["contains", permission]);
					return Boolean(options.granted);
				},
				async request(permission) {
					calls.push(["request", permission]);
					return Boolean(options.requestGranted);
				},
			},
			runtime: {
				async sendMessage(message) {
					calls.push(["sendMessage", message]);
					if (message.type === Messages.MESSAGE_TYPES.GET_MODEL_ENDPOINTS) {
						return (
							options.endpointResponse || {
								ok: true,
								origins: ["https://api.example.com/*"],
							}
						);
					}
					return options.response || { ok: true };
				},
			},
		},
	};
}

test("options API reports valid, missing, and invalid origin permissions", async () => {
	const grantedFake = createChromeFake({ granted: true });
	const grantedApi = createOptionsApi({
		chrome: grantedFake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});

	assert.deepEqual(
		await grantedApi.getPermissionStatus({
			provider: "example",
			model: "model",
		}),
		{
			granted: true,
			message: "Granted for https://api.example.com/*",
			origins: ["https://api.example.com/*"],
			status: "granted",
		},
	);

	const missingFake = createChromeFake({ granted: false });
	const missingApi = createOptionsApi({
		chrome: missingFake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});
	assert.equal(
		(
			await missingApi.getPermissionStatus({
				provider: "example",
				model: "model",
			})
		).status,
		"missing",
	);
	const invalidFake = createChromeFake({
		endpointResponse: { ok: false, error: "Selected model is unavailable." },
	});
	const invalidApi = createOptionsApi({
		chrome: invalidFake.chrome,
		messagesApi: Messages,
	});
	assert.deepEqual(
		await invalidApi.getPermissionStatus({
			provider: "missing",
			model: "none",
		}),
		{
			granted: false,
			message: "Selected model is unavailable.",
			origins: [],
			status: "invalid",
		},
	);
});

test("options API requests permission only when it is missing", async () => {
	const existingFake = createChromeFake({ granted: true });
	const existingApi = createOptionsApi({
		chrome: existingFake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});

	assert.equal(
		await existingApi.requestPermission({
			provider: "example",
			model: "model",
		}),
		true,
	);
	assert.equal(
		existingFake.calls.filter(([name]) => name === "request").length,
		0,
	);

	const requestFake = createChromeFake({ requestGranted: false });
	const requestApi = createOptionsApi({
		chrome: requestFake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});
	assert.equal(
		await requestApi.requestPermission({
			provider: "example",
			model: "model",
		}),
		false,
	);
	assert.equal(
		requestFake.calls.filter(([name]) => name === "request").length,
		1,
	);
});

test("options API sends one typed connection-test message", async () => {
	const fake = createChromeFake({
		response: { ok: true, translation: "done" },
	});
	const api = createOptionsApi({
		chrome: fake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});
	const settings = { apiKey: "secret", baseUrl: "https://api.example.com/v1" };

	assert.deepEqual(await api.testConnection(settings), {
		ok: true,
		translation: "done",
	});
	const messages = fake.calls.filter(([name]) => name === "sendMessage");
	assert.equal(messages.length, 1);
	assert.deepEqual(
		messages[0][1],
		Messages.createMessage(Messages.MESSAGE_TYPES.TEST_CONNECTION, settings),
	);
});
