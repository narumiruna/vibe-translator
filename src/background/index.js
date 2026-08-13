import Api from "../translation/api.js";
import Appearance from "../shared/appearance.js";
import EmbeddedFrames from "../shared/embedded-frames.js";
import { createLogger } from "../shared/logger.js";
import Messages from "../shared/messages.js";
import Settings from "../shared/settings.js";
import TranslationSession from "../shared/translation-session.js";
import SiteProfiles from "../content/extraction/site-profiles.js";
import { createBackgroundController } from "./controller.js";
import { createBackgroundPlatform } from "./platform.js";

const logger = createLogger("background");
const platform = createBackgroundPlatform({
	chrome,
	Appearance,
	EmbeddedFrames,
	Messages,
	Settings,
	SiteProfiles,
});
const controller = createBackgroundController({
	chrome,
	Api,
	Messages,
	Settings,
	SiteProfiles,
	TranslationSession,
	logger,
	platform,
});

function handleFailure(tab, error) {
	if (!tab?.id) {
		return Promise.resolve();
	}

	logger.error("translation-failed", {
		error: error?.message || String(error),
		tabId: tab.id,
	});
	controller.pageTranslationQueue.remove(tab.id);
	return chrome.tabs
		.sendMessage(tab.id, Messages.clearPendingTranslations())
		.catch(() => {})
		.then(() => platform.sendToast(tab.id, error.message, "error"))
		.then(() => platform.setBadge(tab.id, "!"));
}

chrome.runtime.onInstalled.addListener(() => {
	controller.setupContextMenus().catch((error) => {
		logger.error("context-menu-setup-failed", { error: error.message });
	});
});

chrome.runtime.onStartup.addListener(() => {
	controller.setupContextMenus().catch((error) => {
		logger.error("context-menu-setup-failed", { error: error.message });
	});
});

chrome.action.onClicked.addListener(async (tab) => {
	logger.info("action-clicked", { tabId: tab?.id });
	try {
		await controller.translatePage(tab);
	} catch (error) {
		await handleFailure(tab, error);
	}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	logger.info("context-menu-clicked", {
		frameId: info.frameId,
		menuItemId: info.menuItemId,
		tabId: tab?.id,
	});
	try {
		if (info.menuItemId === "translate-page") {
			await controller.translatePage(tab);
		} else if (info.menuItemId === "translate-selection" && tab?.id) {
			await controller.translateSelection(
				tab.id,
				info.selectionText,
				info.frameId,
			);
		}
	} catch (error) {
		await handleFailure(tab, error);
	}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === "loading") {
		controller.pageTranslationQueue.remove(tabId);
		platform.setBadge(tabId, "");
		logger.debug("tab-loading", { tabId });
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	controller.pageTranslationQueue.remove(tabId);
	logger.debug("tab-removed", { tabId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	controller
		.handleRuntimeMessage(message, sender)
		.then((result) => sendResponse(result))
		.catch((error) => {
			logger.error("message-failed", {
				error: error.message,
				frameId: sender.frameId,
				tabId: sender.tab?.id,
				type: message?.type,
			});
			sendResponse({ ok: false, error: error.message });
		});

	return true;
});
