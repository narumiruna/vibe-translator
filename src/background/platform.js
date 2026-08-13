const BADGE_COLOR = "#1f7a4f";
const MENU_TRANSLATE_PAGE = "translate-page";
const MENU_TRANSLATE_SELECTION = "translate-selection";

export function createBackgroundPlatform(options = {}) {
	const {
		chrome,
		Appearance,
		EmbeddedFrames,
		Messages,
		Settings,
		SiteProfiles,
	} = options;
	let contextMenusSetupPromise = null;
	function isSupportedPage(url) {
		return /^https?:\/\//i.test(String(url || ""));
	}

	function isDomainDisabled(url, settings) {
		try {
			const hostname = new URL(url).hostname.toLowerCase();
			const rules = String(settings.disabledDomains || "")
				.split("\n")
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean);

			return rules.some(
				(rule) => hostname === rule || hostname.endsWith(`.${rule}`),
			);
		} catch (_error) {
			return false;
		}
	}

	function setBadge(tabId, text) {
		if (!tabId) {
			return;
		}

		chrome.action
			.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId })
			.catch(() => {});
		chrome.action.setBadgeText({ text, tabId }).catch(() => {});
	}

	function getContentScriptFiles() {
		const contentScripts = chrome.runtime.getManifest().content_scripts || [];
		const entry = contentScripts.find((item) =>
			(item.matches || []).some((match) => match.includes("youtube.com")),
		);
		const files = entry?.js?.filter((file) => typeof file === "string" && file);

		if (!files?.length) {
			throw new Error("The generated content-script bundle is missing.");
		}

		return files;
	}

	function isTabMessageDisconnectError(error) {
		const message = String(error?.message || "");

		return (
			message.includes("Could not establish connection") ||
			message.includes("Receiving end does not exist") ||
			message.includes("No tab with id")
		);
	}

	function getFrameMessageOptions(frameId) {
		return Number.isInteger(frameId) && frameId >= 0 ? { frameId } : undefined;
	}

	function getScriptTarget(tabId, frameId) {
		const target = { tabId };

		if (Number.isInteger(frameId) && frameId >= 0) {
			target.frameIds = [frameId];
		}

		return target;
	}

	function buildTranslationAppearancePayload(settings) {
		return {
			translationAppearance: Appearance.normalizeTranslationAppearance(
				settings?.translationAppearance,
			),
		};
	}

	function buildSelectionPanelPayload(settings, selectionAnchor) {
		return {
			selectionPanelPositionMode: Settings.normalizeSelectionPanelPositionMode(
				settings?.selectionPanelPositionMode,
			),
			selectionAnchor: selectionAnchor || null,
		};
	}

	function buildDebugPayload(settings) {
		return {
			debug: {
				enabled: Boolean(settings?.showTranslationDebugInfo),
			},
		};
	}

	async function ensureContentScript(tabId, frameId) {
		try {
			const response = await chrome.tabs.sendMessage(
				tabId,
				Messages.ping(),
				getFrameMessageOptions(frameId),
			);

			if (response?.ok) {
				return;
			}
		} catch (_error) {
			// Fall through and inject the generated bundle.
		}

		await chrome.scripting.executeScript({
			target: getScriptTarget(tabId, frameId),
			files: getContentScriptFiles(),
		});
	}

	async function sendToast(tabId, message, level) {
		try {
			await ensureContentScript(tabId);
			await chrome.tabs.sendMessage(
				tabId,
				Messages.showToast({ level: level || "info", message }),
			);
		} catch (_error) {
			// Unsupported and torn-down tabs cannot display extension UI.
		}
	}

	async function renderPageTranslationUpdates(
		tabId,
		targetLanguage,
		translations,
		settings,
		frameId,
	) {
		if (!translations?.length) return;
		await chrome.tabs.sendMessage(
			tabId,
			Messages.renderPageTranslationUpdates({
				targetLanguage,
				translations,
				...buildTranslationAppearancePayload(settings),
			}),
			getFrameMessageOptions(frameId),
		);
	}

	async function sendYoutubeDiagnosticEvent(tabId, frameId, stage, detail) {
		await chrome.tabs
			.sendMessage(
				tabId,
				Messages.renderYoutubeDiagnosticEvent({ stage, detail }),
				getFrameMessageOptions(frameId),
			)
			.catch(() => {});
	}

	async function clearPagePlaceholders(tabId, ids, frameId) {
		if (!ids?.length) return;
		await chrome.tabs
			.sendMessage(
				tabId,
				Messages.clearPagePlaceholders({ ids }),
				getFrameMessageOptions(frameId),
			)
			.catch(() => {});
	}

	async function fetchModelsDiagnostics(settings) {
		const startedAt = Date.now();
		try {
			const response = await fetch(`${settings.baseUrl}/models`, {
				headers: { Authorization: `Bearer ${settings.apiKey}` },
			});
			const latencyMs = Date.now() - startedAt;
			let payload = {};
			try {
				payload = JSON.parse(await response.text());
			} catch (_error) {}
			if (!response.ok) {
				return {
					ok: false,
					latencyMs,
					error:
						payload?.error?.message ||
						`Model listing failed with status ${response.status}.`,
				};
			}
			return {
				ok: true,
				latencyMs,
				count: Array.isArray(payload?.data) ? payload.data.length : 0,
			};
		} catch (error) {
			return {
				ok: false,
				latencyMs: Date.now() - startedAt,
				error: error.message,
			};
		}
	}

	function discoverEmbeddedPageFrames(tabId, pageUrl) {
		return EmbeddedFrames.discoverEmbeddedFrames({
			pageUrl,
			permissions: chrome.permissions,
			scripting: chrome.scripting,
			siteProfiles: SiteProfiles,
			tabId,
		});
	}

	async function ensureApiPermission(settings) {
		const permissions = {
			origins: [Settings.getApiPermissionPattern(settings.baseUrl)],
		};
		return (
			(await chrome.permissions.contains(permissions)) ||
			chrome.permissions.request(permissions)
		);
	}

	function getRuntimeLastError() {
		const error = chrome.runtime.lastError;

		if (!error) {
			return null;
		}

		return new Error(error.message || String(error));
	}

	function removeAllContextMenus() {
		return new Promise((resolve, reject) => {
			chrome.contextMenus.removeAll(() => {
				const error = getRuntimeLastError();

				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	function createContextMenu(properties) {
		return new Promise((resolve, reject) => {
			chrome.contextMenus.create(properties, () => {
				const error = getRuntimeLastError();

				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	function updateContextMenu(properties) {
		const { id, ...updateProperties } = properties;

		return new Promise((resolve, reject) => {
			chrome.contextMenus.update(id, updateProperties, () => {
				const error = getRuntimeLastError();

				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	async function createOrUpdateContextMenu(properties) {
		try {
			await createContextMenu(properties);
		} catch (error) {
			if (!String(error.message || "").includes("duplicate id")) {
				throw error;
			}

			await updateContextMenu(properties);
		}
	}

	async function doSetupContextMenus() {
		await removeAllContextMenus();
		await createOrUpdateContextMenu({
			id: MENU_TRANSLATE_PAGE,
			title: "Translate entire page",
			contexts: ["page"],
		});
		await createOrUpdateContextMenu({
			id: MENU_TRANSLATE_SELECTION,
			title: "Translate selected text",
			contexts: ["selection"],
		});
	}

	function setupContextMenus() {
		if (!contextMenusSetupPromise) {
			contextMenusSetupPromise = doSetupContextMenus().finally(() => {
				contextMenusSetupPromise = null;
			});
		}

		return contextMenusSetupPromise;
	}

	return {
		buildDebugPayload,
		buildSelectionPanelPayload,
		buildTranslationAppearancePayload,
		clearPagePlaceholders,
		discoverEmbeddedPageFrames,
		ensureApiPermission,
		ensureContentScript,
		fetchModelsDiagnostics,
		getContentScriptFiles,
		getFrameMessageOptions,
		isDomainDisabled,
		isSupportedPage,
		isTabMessageDisconnectError,
		renderPageTranslationUpdates,
		sendToast,
		sendYoutubeDiagnosticEvent,
		setBadge,
		setupContextMenus,
	};
}
