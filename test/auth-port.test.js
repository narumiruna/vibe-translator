import assert from "node:assert/strict";
import { test } from "vitest";

import {
	AUTH_PORT_NAME,
	createAuthPortHandler,
	isTrustedAuthPort,
} from "../src/background/auth-port.js";

function createEvent() {
	const listeners = [];
	return {
		addListener(listener) {
			listeners.push(listener);
		},
		emit(value) {
			for (const listener of listeners) {
				listener(value);
			}
		},
	};
}

function createPort(
	url = "chrome-extension://extension-id/options/index.html",
) {
	const messages = [];
	const onDisconnect = createEvent();
	const onMessage = createEvent();
	let disconnected = false;
	return {
		disconnect() {
			disconnected = true;
		},
		get disconnected() {
			return disconnected;
		},
		messages,
		name: AUTH_PORT_NAME,
		onDisconnect,
		onMessage,
		postMessage(message) {
			messages.push(message);
		},
		sender: { url },
	};
}

async function settle() {
	await new Promise((resolve) => setImmediate(resolve));
}

test("authentication ports accept extension pages and reject content contexts", () => {
	assert.equal(
		isTrustedAuthPort(
			createPort("chrome-extension://extension-id/options/index.html"),
			"extension-id",
		),
		true,
	);
	assert.equal(
		isTrustedAuthPort(
			createPort("https://example.com/article"),
			"extension-id",
		),
		false,
	);

	const untrusted = createPort("https://example.com/article");
	createAuthPortHandler({ runtime: {}, runtimeId: "extension-id" })(untrusted);
	assert.equal(untrusted.disconnected, true);
});

test("authentication port forwards provider prompts and completion status", async () => {
	let promptValue;
	const runtime = {
		async getAuthStatus(providerId) {
			return { loggedIn: true, providerId, type: "api_key" };
		},
		async login(providerId, authType, interaction) {
			assert.equal(providerId, "anthropic");
			assert.equal(authType, "api_key");
			interaction.notify({ type: "progress", message: "Starting" });
			promptValue = await interaction.prompt({
				type: "secret",
				message: "Enter API key",
			});
		},
	};
	const port = createPort();
	createAuthPortHandler({ runtime, runtimeId: "extension-id" })(port);

	port.onMessage.emit({
		type: "login",
		requestId: "request-1",
		providerId: "anthropic",
		authType: "api_key",
	});
	const prompt = port.messages.find((message) => message.type === "prompt");
	assert.deepEqual(
		port.messages.find((message) => message.type === "event"),
		{
			type: "event",
			requestId: "request-1",
			event: { type: "progress", message: "Starting" },
		},
	);
	assert.equal(prompt.prompt.type, "secret");
	assert.equal("signal" in prompt.prompt, false);

	port.onMessage.emit({
		type: "prompt-result",
		promptId: prompt.promptId,
		value: "provider-secret",
	});
	await settle();

	assert.equal(promptValue, "provider-secret");
	assert.deepEqual(port.messages.at(-1), {
		type: "result",
		requestId: "request-1",
		ok: true,
		status: {
			loggedIn: true,
			providerId: "anthropic",
			type: "api_key",
		},
	});
	assert.doesNotMatch(JSON.stringify(port.messages), /provider-secret/u);
});

test("authentication port cancellation aborts an active prompt", async () => {
	const runtime = {
		async login(_providerId, _authType, interaction) {
			await interaction.prompt({ type: "secret", message: "Enter API key" });
		},
	};
	const port = createPort();
	createAuthPortHandler({ runtime, runtimeId: "extension-id" })(port);

	port.onMessage.emit({
		type: "login",
		requestId: "request-2",
		providerId: "openai",
		authType: "api_key",
	});
	port.onMessage.emit({ type: "cancel" });
	await settle();

	assert.deepEqual(port.messages.at(-1), {
		type: "result",
		requestId: "request-2",
		ok: false,
		error: "Authentication cancelled.",
	});
});
