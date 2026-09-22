const AUTH_PORT_NAME = "vibe-translator-auth";

function isTrustedAuthPort(port, runtimeId) {
	const senderUrl = String(port?.sender?.url || "");
	if (!runtimeId || !senderUrl) {
		return false;
	}
	try {
		const url = new URL(senderUrl);
		return url.protocol === "chrome-extension:" && url.hostname === runtimeId;
	} catch (_error) {
		return false;
	}
}

function safeErrorMessage(error) {
	if (error?.name === "AbortError") {
		return "Authentication cancelled.";
	}
	return String(error?.message || error || "Authentication failed.").trim();
}

function createAuthPortHandler(options = {}) {
	const runtime = options.runtime;
	const runtimeId = options.runtimeId || globalThis.chrome?.runtime?.id;

	return function handleAuthPort(port) {
		if (port.name !== AUTH_PORT_NAME) {
			return;
		}
		if (!isTrustedAuthPort(port, runtimeId)) {
			port.disconnect();
			return;
		}

		let operation = null;
		let promptSequence = 0;
		const pendingPrompts = new Map();

		function post(message) {
			try {
				port.postMessage(message);
			} catch (_error) {
				// A disconnected Options page cannot receive completion state.
			}
		}

		function cancel(reason = "Authentication cancelled.") {
			operation?.controller.abort();
			for (const pending of pendingPrompts.values()) {
				pending.reject(new DOMException(reason, "AbortError"));
			}
			pendingPrompts.clear();
		}

		function prompt(requestId, promptDefinition, operationSignal) {
			const promptId = `${requestId}-prompt-${++promptSequence}`;
			const signals = [operationSignal, promptDefinition.signal].filter(
				Boolean,
			);

			return new Promise((resolve, reject) => {
				const abort = () => {
					cleanup();
					reject(new DOMException("Authentication cancelled.", "AbortError"));
				};
				const cleanup = () => {
					pendingPrompts.delete(promptId);
					for (const signal of signals) {
						signal.removeEventListener("abort", abort);
					}
				};

				pendingPrompts.set(promptId, {
					reject(error) {
						cleanup();
						reject(error);
					},
					resolve(value) {
						cleanup();
						resolve(value);
					},
				});
				for (const signal of signals) {
					signal.addEventListener("abort", abort, { once: true });
				}
				if (signals.some((signal) => signal.aborted)) {
					abort();
					return;
				}

				const { signal: _signal, ...serializablePrompt } = promptDefinition;
				post({
					type: "prompt",
					requestId,
					promptId,
					prompt: serializablePrompt,
				});
			});
		}

		async function run(request, task) {
			if (operation) {
				post({
					type: "result",
					requestId: request.requestId,
					ok: false,
					error: "Another authentication operation is already running.",
				});
				return;
			}

			const controller = new AbortController();
			operation = { controller, requestId: request.requestId };
			try {
				const result = await task(controller.signal);
				post({
					type: "result",
					requestId: request.requestId,
					ok: true,
					...result,
				});
			} catch (error) {
				post({
					type: "result",
					requestId: request.requestId,
					ok: false,
					error: safeErrorMessage(error),
				});
			} finally {
				operation = null;
			}
		}

		port.onMessage.addListener((message) => {
			if (!message || typeof message !== "object") {
				return;
			}

			if (message.type === "prompt-result") {
				const pending = pendingPrompts.get(message.promptId);
				if (!pending) {
					return;
				}
				if (message.cancelled) {
					pending.reject(
						new DOMException("Authentication cancelled.", "AbortError"),
					);
					pendingPrompts.delete(message.promptId);
					return;
				}
				pending.resolve(String(message.value || ""));
				return;
			}

			if (message.type === "cancel") {
				cancel();
				return;
			}

			if (!message.requestId) {
				return;
			}

			if (message.type === "login") {
				void run(message, async (signal) => {
					await runtime.login(message.providerId, message.authType, {
						signal,
						prompt: (definition) =>
							prompt(message.requestId, definition, signal),
						notify(event) {
							post({
								type: "event",
								requestId: message.requestId,
								event,
							});
						},
					});
					return {
						status: await runtime.getAuthStatus(message.providerId),
					};
				});
				return;
			}

			if (message.type === "refresh") {
				void run(message, async (signal) => {
					await runtime.refreshCredential(message.providerId, signal);
					return {
						status: await runtime.getAuthStatus(message.providerId),
					};
				});
				return;
			}

			if (message.type === "logout") {
				void run(message, async (signal) => {
					await runtime.logout(message.providerId, signal);
					return {
						status: await runtime.getAuthStatus(message.providerId),
					};
				});
			}
		});

		port.onDisconnect.addListener(() => cancel());
	};
}

export {
	AUTH_PORT_NAME,
	createAuthPortHandler,
	isTrustedAuthPort,
	safeErrorMessage,
};
