importScripts("storage.js", "api.js");

const MENU_TRANSLATE_PAGE = "translate-page";
const MENU_TRANSLATE_SELECTION = "translate-selection";
const BADGE_COLOR = "#1f7a4f";
const PAGE_TRANSLATION_CONCURRENCY = 5;
const pageTranslationSessions = new Map();

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

function isTabMessageDisconnectError(error) {
	const message = String(error?.message || "");

	return (
		message.includes("Could not establish connection") ||
		message.includes("Receiving end does not exist") ||
		message.includes("No tab with id")
	);
}

function buildTranslationAppearancePayload(settings) {
	const appearance = TranslatorStorage.normalizeTranslationAppearance(settings);

	return {
		translationAppearance: {
			underlineColor: appearance.translationUnderlineColor,
			underlineStyle: appearance.translationUnderlineStyle,
			underlineThickness: appearance.translationUnderlineThickness,
			underlineOffset: appearance.translationUnderlineOffset,
		},
	};
}

async function renderPageTranslationUpdates(
	tabId,
	targetLanguage,
	translations,
	settings,
) {
	if (!translations || translations.length === 0) {
		return;
	}

	await chrome.tabs.sendMessage(tabId, {
		type: "render-page-translation-updates",
		payload: {
			targetLanguage,
			translations,
			...buildTranslationAppearancePayload(settings),
		},
	});
}

async function clearPagePlaceholders(tabId, ids) {
	if (!ids || ids.length === 0) {
		return;
	}

	await chrome.tabs
		.sendMessage(tabId, {
			type: "clear-page-placeholders",
			payload: {
				ids,
			},
		})
		.catch(() => {});
}

async function setupContextMenus() {
	await chrome.contextMenus.removeAll();
	await chrome.contextMenus.create({
		id: MENU_TRANSLATE_PAGE,
		title: "Translate entire page",
		contexts: ["page"],
	});
	await chrome.contextMenus.create({
		id: MENU_TRANSLATE_SELECTION,
		title: "Translate selected text",
		contexts: ["selection"],
	});
}

async function ensureContentScript(tabId) {
	try {
		const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });

		if (response?.ok) {
			return;
		}
	} catch (_error) {
		// Fall through and inject.
	}

	await chrome.scripting.executeScript({
		target: { tabId },
		files: ["content-viewport.js", "content.js"],
	});
}

async function sendToast(tabId, message, level) {
	try {
		await ensureContentScript(tabId);
		await chrome.tabs.sendMessage(tabId, {
			type: "show-toast",
			payload: {
				level: level || "info",
				message,
			},
		});
	} catch (_error) {
		// Ignore toast failures on unsupported pages.
	}
}

async function ensureApiPermission(settings) {
	const originPattern = TranslatorStorage.getApiPermissionPattern(
		settings.baseUrl,
	);
	const permissions = { origins: [originPattern] };
	const hasPermission = await chrome.permissions.contains(permissions);

	if (hasPermission) {
		return true;
	}

	return chrome.permissions.request(permissions);
}

async function loadSettingsOrOpenOptions() {
	const settings = await TranslatorStorage.getSettings();

	if (TranslatorStorage.hasCompleteSettings(settings)) {
		return settings;
	}

	await chrome.runtime.openOptionsPage();
	throw new Error("Settings are incomplete. Configure the extension first.");
}

function createPageTranslationSession(tabId, settings) {
	return {
		tabId,
		sessionId: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		settings,
		pendingItems: [],
		pendingIds: new Set(),
		translatedIds: new Set(),
		inFlightCount: 0,
	};
}

function getPageTranslationSession(tabId, sessionId) {
	const session = pageTranslationSessions.get(tabId);

	if (!session) {
		return null;
	}

	if (sessionId && session.sessionId !== sessionId) {
		return null;
	}

	return session;
}

async function processQueuedPageTranslationItems(tabId, sessionId) {
	const session = getPageTranslationSession(tabId, sessionId);

	if (!session) {
		return;
	}

	while (
		session.pendingItems.length > 0 &&
		session.inFlightCount < PAGE_TRANSLATION_CONCURRENCY
	) {
		const item = session.pendingItems.shift();

		if (!item) {
			break;
		}

		session.inFlightCount += 1;
		processSinglePageTranslationItem(tabId, sessionId, item).catch((error) => {
			console.error("Failed to process page translation item:", error);
		});
	}
}

async function processSinglePageTranslationItem(tabId, sessionId, item) {
	const session = getPageTranslationSession(tabId, sessionId);

	if (!session || !item || typeof item.id !== "string") {
		return;
	}

	const itemId = item.id;

	try {
		await chrome.tabs.sendMessage(tabId, {
			type: "render-page-placeholders",
			payload: {
				ids: [itemId],
				targetLanguage: session.settings.targetLanguage,
				...buildTranslationAppearancePayload(session.settings),
			},
		});

		const chunkPlan = TranslatorApi.createRecursiveChunkPlan([item]);
		const mergeState = TranslatorApi.createProgressiveMergeState(chunkPlan);
		await TranslatorApi.requestTranslationsBatchedProgressive({
			settings: session.settings,
			chunks: chunkPlan.chunks,
			concurrency: Math.min(
				PAGE_TRANSLATION_CONCURRENCY,
				chunkPlan.chunks.length || 1,
			),
			onChunkResolved: async ({ translations }) => {
				const currentSession = getPageTranslationSession(tabId, sessionId);

				if (!currentSession) {
					return;
				}

				const completedTranslations =
					TranslatorApi.consumeProgressiveTranslations(
						chunkPlan,
						mergeState,
						translations,
					);

				if (completedTranslations.length > 0) {
					for (const translation of completedTranslations) {
						currentSession.translatedIds.add(translation.id);
					}

					await renderPageTranslationUpdates(
						tabId,
						currentSession.settings.targetLanguage,
						completedTranslations,
						currentSession.settings,
					);
					setBadge(tabId, String(currentSession.translatedIds.size));
				}
			},
		});

		const incompleteSegmentIds = TranslatorApi.getIncompleteSegmentIds(
			chunkPlan,
			mergeState,
		);

		if (incompleteSegmentIds.length > 0) {
			await clearPagePlaceholders(tabId, incompleteSegmentIds);
		}
	} catch (error) {
		if (isTabMessageDisconnectError(error)) {
			pageTranslationSessions.delete(tabId);
			setBadge(tabId, "");
			return;
		}

		throw error;
	} finally {
		const currentSession = getPageTranslationSession(tabId, sessionId);

		if (currentSession) {
			currentSession.pendingIds.delete(itemId);
			currentSession.inFlightCount = Math.max(
				0,
				currentSession.inFlightCount - 1,
			);

			if (currentSession.pendingItems.length > 0) {
				processQueuedPageTranslationItems(
					tabId,
					currentSession.sessionId,
				).catch((error) => {
					console.error("Failed to continue page translation queue:", error);
				});
			}
		}
	}
}

async function queuePageTranslationItems(tabId, sessionId, items) {
	const session = getPageTranslationSession(tabId, sessionId);

	if (!session) {
		return { queued: 0 };
	}

	const queuedItems = [];

	for (const item of items || []) {
		if (
			!item ||
			typeof item.id !== "string" ||
			session.pendingIds.has(item.id)
		) {
			continue;
		}

		session.pendingIds.add(item.id);
		queuedItems.push(item);
	}

	if (queuedItems.length > 0) {
		session.pendingItems = queuedItems.concat(session.pendingItems);
		processQueuedPageTranslationItems(tabId, session.sessionId).catch(
			(error) => {
				console.error("Failed to queue page translation items:", error);
			},
		);
	}

	return { queued: queuedItems.length };
}

async function translatePage(tab) {
	if (!tab?.id || !isSupportedPage(tab.url)) {
		throw new Error("This page cannot be translated.");
	}

	const settings = await loadSettingsOrOpenOptions();

	if (isDomainDisabled(tab.url, settings)) {
		throw new Error("Translation is disabled for this domain.");
	}

	const hasPermission = await ensureApiPermission(settings);

	if (!hasPermission) {
		throw new Error(
			"Permission to access the configured API origin was denied.",
		);
	}

	await ensureContentScript(tab.id);
	const session = createPageTranslationSession(tab.id, settings);

	pageTranslationSessions.set(tab.id, session);

	const extraction = await chrome.tabs.sendMessage(tab.id, {
		type: "start-page-translation-session",
		payload: {
			sessionId: session.sessionId,
			targetLanguage: settings.targetLanguage,
			...buildTranslationAppearancePayload(settings),
		},
	});

	if (!extraction || !Array.isArray(extraction.items)) {
		pageTranslationSessions.delete(tab.id);
		await sendToast(
			tab.id,
			"No translatable text was found on this page.",
			"info",
		);
		setBadge(tab.id, "");
		return;
	}

	if (extraction.items.length === 0) {
		if (extraction.totalSegments > 0) {
			await sendToast(
				tab.id,
				"Visible content is already translated. More content will translate as you scroll.",
				"info",
			);
			setBadge(
				tab.id,
				session.translatedIds.size > 0
					? String(session.translatedIds.size)
					: "",
			);
			return;
		}

		pageTranslationSessions.delete(tab.id);
		await sendToast(
			tab.id,
			"No translatable text was found on this page.",
			"info",
		);
		setBadge(tab.id, "");
		return;
	}

	await queuePageTranslationItems(tab.id, session.sessionId, extraction.items);
	await sendToast(tab.id, "Started translating visible content.", "success");
}

async function translateSelection(tabId, selectionText) {
	if (!tabId) {
		throw new Error("Missing tab id.");
	}

	const text = String(selectionText || "").trim();

	if (!text) {
		throw new Error("No selected text to translate.");
	}

	const settings = await loadSettingsOrOpenOptions();
	const tab = await chrome.tabs.get(tabId);

	if (tab && isDomainDisabled(tab.url, settings)) {
		throw new Error("Translation is disabled for this domain.");
	}

	const hasPermission = await ensureApiPermission(settings);

	if (!hasPermission) {
		throw new Error(
			"Permission to access the configured API origin was denied.",
		);
	}

	await ensureContentScript(tabId);
	await chrome.tabs.sendMessage(tabId, {
		type: "render-selection-placeholder",
		payload: {
			targetLanguage: settings.targetLanguage,
			...buildTranslationAppearancePayload(settings),
		},
	});

	const chunkPlan = TranslatorApi.createRecursiveChunkPlan([
		{ id: "selection", kind: "selection", text },
	]);
	const partialTranslations = await TranslatorApi.requestTranslationsBatched({
		settings,
		chunks: chunkPlan.chunks,
		concurrency: 1,
	});
	const translations = TranslatorApi.mergeRecursiveTranslations(
		chunkPlan,
		partialTranslations,
	);
	const translation = translations[0]?.translation;

	if (!translation) {
		throw new Error("The API did not return a translation.");
	}

	await chrome.tabs.sendMessage(tabId, {
		type: "render-selection-translation",
		payload: {
			sourceText: text,
			targetLanguage: settings.targetLanguage,
			...buildTranslationAppearancePayload(settings),
			translation,
			protectedFragments: translations[0]?.protectedFragments || [],
		},
	});
	await sendToast(tabId, "Selected text translated.", "success");
	setBadge(tabId, "TR");
}

async function handleRuntimeMessage(message, sender) {
	if (!message || typeof message !== "object") {
		return { ok: false };
	}

	if (message.type === "test-connection") {
		const validation = TranslatorStorage.validateSettings(message.payload);

		if (!validation.isValid) {
			throw new Error(validation.errors.join(" "));
		}

		const translations = await TranslatorApi.requestTranslations({
			settings: validation.settings,
			items: [{ id: "sample", kind: "paragraph", text: "Hello world." }],
		});

		return {
			ok: true,
			translation: translations[0] ? translations[0].translation : "",
		};
	}

	if (message.type === "queue-page-translation-items") {
		const tabId = sender?.tab?.id;

		if (!tabId) {
			return { ok: false, queued: 0 };
		}

		const result = await queuePageTranslationItems(
			tabId,
			message.payload?.sessionId,
			message.payload?.items,
		);

		return {
			ok: true,
			...result,
		};
	}

	return { ok: false };
}

chrome.runtime.onInstalled.addListener(() => {
	setupContextMenus().catch((error) => {
		console.error("Failed to set up context menus:", error);
	});
});

chrome.runtime.onStartup.addListener(() => {
	setupContextMenus().catch((error) => {
		console.error("Failed to set up context menus:", error);
	});
});

chrome.action.onClicked.addListener(async (tab) => {
	try {
		await translatePage(tab);
	} catch (error) {
		if (tab?.id) {
			pageTranslationSessions.delete(tab.id);
			await chrome.tabs
				.sendMessage(tab.id, {
					type: "clear-pending-translations",
				})
				.catch(() => {});
			await sendToast(tab.id, error.message, "error");
			setBadge(tab.id, "!");
		}
	}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	try {
		if (info.menuItemId === MENU_TRANSLATE_PAGE) {
			await translatePage(tab);
			return;
		}

		if (info.menuItemId === MENU_TRANSLATE_SELECTION && tab && tab.id) {
			await translateSelection(tab.id, info.selectionText);
		}
	} catch (error) {
		if (tab?.id) {
			pageTranslationSessions.delete(tab.id);
			await chrome.tabs
				.sendMessage(tab.id, {
					type: "clear-pending-translations",
				})
				.catch(() => {});
			await sendToast(tab.id, error.message, "error");
			setBadge(tab.id, "!");
		}
	}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === "loading") {
		pageTranslationSessions.delete(tabId);
		setBadge(tabId, "");
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	pageTranslationSessions.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleRuntimeMessage(message, sender)
		.then((result) => sendResponse(result))
		.catch((error) => sendResponse({ ok: false, error: error.message }));

	return true;
});
