import assert from "node:assert/strict";
import test from "node:test";
import { createOptionsApi } from "../src/options/options-api.js";
import Messages from "../src/shared/messages.js";
import Settings from "../src/shared/settings.js";

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
		await grantedApi.getPermissionStatus("https://api.example.com/v1"),
		{
			granted: true,
			message: "Granted for https://api.example.com/*",
			originPattern: "https://api.example.com/*",
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
		(await missingApi.getPermissionStatus("https://api.example.com/v1")).status,
		"missing",
	);
	assert.deepEqual(await missingApi.getPermissionStatus("not a URL"), {
		granted: false,
		message: "Base URL is invalid.",
		originPattern: "",
		status: "invalid",
	});
});

test("options API requests permission only when it is missing", async () => {
	const existingFake = createChromeFake({ granted: true });
	const existingApi = createOptionsApi({
		chrome: existingFake.chrome,
		messagesApi: Messages,
		settingsApi: Settings,
	});

	assert.equal(
		await existingApi.requestPermission("https://api.example.com/v1"),
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
		await requestApi.requestPermission("https://api.example.com/v1"),
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
