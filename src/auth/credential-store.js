import { withExclusiveStorageWrite } from "./storage-lock.js";

const CREDENTIALS_KEY = "vibeTranslatorCredentialsV1";
const CREDENTIALS_WRITE_LOCK = "vibe-translator-credentials-write";

function throwIfAborted(options) {
	if (options?.signal?.aborted) {
		throw new DOMException("Credential operation cancelled", "AbortError");
	}
}

function isCredential(value) {
	if (!value || typeof value !== "object" || !("type" in value)) {
		return false;
	}

	if (value.type === "api_key") {
		return (
			(value.key === undefined || typeof value.key === "string") &&
			(value.env === undefined ||
				(typeof value.env === "object" && value.env !== null))
		);
	}

	return (
		value.type === "oauth" &&
		typeof value.access === "string" &&
		typeof value.refresh === "string" &&
		typeof value.expires === "number" &&
		Number.isFinite(value.expires)
	);
}

class ChromeCredentialStore {
	constructor(area = globalThis.chrome?.storage?.local, locks) {
		this.area = area;
		this.locks =
			locks === undefined
				? typeof navigator === "undefined"
					? undefined
					: navigator.locks
				: locks;
	}

	async readAll() {
		if (!this.area) {
			return {};
		}

		const stored = await this.area.get(CREDENTIALS_KEY);
		const raw = stored[CREDENTIALS_KEY];

		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			return {};
		}

		return Object.fromEntries(
			Object.entries(raw).filter(([, credential]) => isCredential(credential)),
		);
	}

	enqueue(operation) {
		return withExclusiveStorageWrite(
			CREDENTIALS_WRITE_LOCK,
			operation,
			this.locks,
		);
	}

	async read(providerId, options) {
		throwIfAborted(options);
		const credential = (await this.readAll())[providerId];
		throwIfAborted(options);
		return credential;
	}

	async list(options) {
		throwIfAborted(options);
		const all = await this.readAll();
		throwIfAborted(options);
		return Object.entries(all).map(([providerId, credential]) => ({
			providerId,
			type: credential.type,
		}));
	}

	modify(providerId, update, options) {
		return this.enqueue(async () => {
			throwIfAborted(options);
			const all = await this.readAll();
			const current = all[providerId];
			const next = await update(current);
			throwIfAborted(options);

			if (next === undefined) {
				return current;
			}
			if (!isCredential(next)) {
				throw new Error("Refusing to persist a malformed credential.");
			}

			await this.area.set({
				[CREDENTIALS_KEY]: { ...all, [providerId]: next },
			});
			return next;
		});
	}

	delete(providerId, options) {
		return this.enqueue(async () => {
			throwIfAborted(options);
			const all = await this.readAll();
			const credential = all[providerId];

			if (
				!credential ||
				(options?.expectedType && credential.type !== options.expectedType)
			) {
				return;
			}

			delete all[providerId];
			if (Object.keys(all).length === 0) {
				await this.area.remove(CREDENTIALS_KEY);
			} else {
				await this.area.set({ [CREDENTIALS_KEY]: all });
			}
		});
	}
}

export { ChromeCredentialStore, CREDENTIALS_KEY, isCredential };
