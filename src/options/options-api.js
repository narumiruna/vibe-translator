import { AUTH_PORT_NAME } from "../background/auth-port.js";
import * as Messages from "../shared/messages.js";

function createAuthClient(chromeApi) {
	let port;
	let sequence = 0;
	const operations = new Map();

	function ensurePort() {
		if (port) {
			return port;
		}

		port = chromeApi.runtime.connect({ name: AUTH_PORT_NAME });
		port.onMessage.addListener((message) => {
			const operation = operations.get(message?.requestId);
			if (!operation) {
				return;
			}

			if (message.type === "event") {
				operation.onEvent?.(message.event);
				return;
			}

			if (message.type === "prompt") {
				Promise.resolve(operation.onPrompt?.(message.prompt))
					.then((value) => {
						port?.postMessage({
							type: "prompt-result",
							promptId: message.promptId,
							value: value ?? "",
						});
					})
					.catch(() => {
						port?.postMessage({
							type: "prompt-result",
							promptId: message.promptId,
							cancelled: true,
						});
					});
				return;
			}

			if (message.type === "result") {
				operations.delete(message.requestId);
				if (message.ok) {
					operation.resolve(message);
				} else {
					operation.reject(
						new Error(message.error || "Authentication failed."),
					);
				}
			}
		});
		port.onDisconnect.addListener(() => {
			const error = new Error("Authentication connection closed.");
			for (const operation of operations.values()) {
				operation.reject(error);
			}
			operations.clear();
			port = undefined;
		});
		return port;
	}

	function run(type, payload, callbacks = {}) {
		const requestId = `auth-${Date.now()}-${++sequence}`;
		const activePort = ensurePort();

		return new Promise((resolve, reject) => {
			operations.set(requestId, { ...callbacks, reject, resolve });
			activePort.postMessage({ type, requestId, ...payload });
		});
	}

	return {
		cancel() {
			port?.postMessage({ type: "cancel" });
		},
		login(providerId, authType, callbacks) {
			return run("login", { providerId, authType }, callbacks);
		},
		logout(providerId) {
			return run("logout", { providerId });
		},
		refresh(providerId) {
			return run("refresh", { providerId });
		},
	};
}

function createOptionsApi(options = {}) {
	const chromeApi = options.chrome || globalThis.chrome;
	const messagesApi = options.messagesApi || Messages;
	const auth = options.auth || createAuthClient(chromeApi);

	async function send(type, payload) {
		return chromeApi.runtime.sendMessage(
			messagesApi.createMessage(type, payload),
		);
	}

	async function getCatalog(settings) {
		const response = await send(
			messagesApi.MESSAGE_TYPES.GET_PROVIDER_CATALOG,
			settings,
		);
		if (!response?.ok || !Array.isArray(response.providers)) {
			throw new Error(response?.error || "Provider catalog is unavailable.");
		}
		return response.providers;
	}

	async function getAuthStatus(providerId) {
		const response = await send(
			messagesApi.MESSAGE_TYPES.GET_PROVIDER_AUTH_STATUS,
			{ providerId },
		);
		if (!response?.ok) {
			throw new Error(
				response?.error || "Authentication status is unavailable.",
			);
		}
		return response.status || { loggedIn: false };
	}

	async function getEndpointOrigins(settings) {
		const response = await send(
			messagesApi.MESSAGE_TYPES.GET_MODEL_ENDPOINTS,
			settings,
		);
		if (!response?.ok || !Array.isArray(response.origins)) {
			throw new Error(response?.error || "Provider endpoint is unavailable.");
		}
		return response.origins;
	}

	async function getPermissionStatus(settings) {
		try {
			const origins = await getEndpointOrigins(settings);
			const granted = await chromeApi.permissions.contains({ origins });
			const originLabel = origins.join(", ");

			return {
				granted,
				message: granted
					? `Granted for ${originLabel}`
					: `Not granted for ${originLabel}`,
				origins,
				status: granted ? "granted" : "missing",
			};
		} catch (error) {
			return {
				granted: false,
				message: error.message || "Provider endpoint is invalid.",
				origins: [],
				status: "invalid",
			};
		}
	}

	async function requestOrigins(origins) {
		const uniqueOrigins = [...new Set(origins || [])];
		if (uniqueOrigins.length === 0) {
			return true;
		}
		const permission = { origins: uniqueOrigins };
		if (await chromeApi.permissions.contains(permission)) {
			return true;
		}
		return chromeApi.permissions.request(permission);
	}

	async function requestPermission(settings) {
		return requestOrigins(await getEndpointOrigins(settings));
	}

	async function testConnection(settings) {
		return send(messagesApi.MESSAGE_TYPES.TEST_CONNECTION, settings);
	}

	async function openUrl(value) {
		const url = new URL(String(value || ""));
		if (!["http:", "https:"].includes(url.protocol)) {
			throw new Error("Authentication links must use HTTP or HTTPS.");
		}
		await chromeApi.tabs.create({ url: url.href });
	}

	return {
		auth,
		getAuthStatus,
		getCatalog,
		getEndpointOrigins,
		getPermissionStatus,
		openUrl,
		requestOrigins,
		requestPermission,
		testConnection,
	};
}

export { createAuthClient, createOptionsApi };
