importScripts(
	"translation-appearance.js",
	"storage.js",
	"content-site-profiles.js",
	"embedded-frames.js",
	"api-protected-fragments.js",
	"api-cache.js",
	"api-chunk-plan.js",
	"api-responses.js",
	"api.js",
	"translator-messages.js",
	"page-translation-session.js",
);

const MENU_TRANSLATE_PAGE = "translate-page";
const MENU_TRANSLATE_SELECTION = "translate-selection";
const BADGE_COLOR = "#1f7a4f";
const PAGE_TRANSLATION_CONCURRENCY = 5;
const PAGE_TRANSLATION_BATCH_SIZE = 8;

let contextMenusSetupPromise = null;
let selectionRequestSequence = 0;

function createSelectionRequestId() {
	selectionRequestSequence += 1;
	return `selection-${Date.now()}-${selectionRequestSequence}`;
}

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
		translationAppearance: TranslatorAppearance.normalizeTranslationAppearance(
			settings?.translationAppearance,
		),
	};
}

function buildSelectionPanelPayload(settings, selectionAnchor) {
	return {
		selectionPanelPositionMode:
			TranslatorStorage.normalizeSelectionPanelPositionMode(
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

async function fetchModelsDiagnostics(settings) {
	const startedAt = Date.now();

	try {
		const response = await fetch(`${settings.baseUrl}/models`, {
			headers: {
				Authorization: `Bearer ${settings.apiKey}`,
			},
		});
		const latencyMs = Date.now() - startedAt;
		const rawText =
			typeof response.text === "function" ? await response.text() : "";
		let payload = {};

		try {
			payload = rawText ? JSON.parse(rawText) : {};
		} catch (_error) {
			payload = {};
		}

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

async function renderPageTranslationUpdates(
	tabId,
	targetLanguage,
	translations,
	settings,
	frameId,
) {
	if (!translations || translations.length === 0) {
		return;
	}

	await chrome.tabs.sendMessage(
		tabId,
		TranslatorMessages.renderPageTranslationUpdates({
			targetLanguage,
			translations,
			...buildTranslationAppearancePayload(settings),
		}),
		getFrameMessageOptions(frameId),
	);
}

async function clearPagePlaceholders(tabId, ids, frameId) {
	if (!ids || ids.length === 0) {
		return;
	}

	await chrome.tabs
		.sendMessage(
			tabId,
			TranslatorMessages.clearPagePlaceholders({
				ids,
			}),
			getFrameMessageOptions(frameId),
		)
		.catch(() => {});
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

async function ensureContentScript(tabId, frameId) {
	try {
		const response = await chrome.tabs.sendMessage(
			tabId,
			TranslatorMessages.ping(),
			getFrameMessageOptions(frameId),
		);

		if (response?.ok) {
			return;
		}
	} catch (_error) {
		// Fall through and inject.
	}

	await chrome.scripting.executeScript({
		target: getScriptTarget(tabId, frameId),
		files: [
			"src/translation-appearance.js",
			"src/content-viewport.js",
			"src/content-selection-panel.js",
			"src/content-site-profiles.js",
			"src/content-subtitles.js",
			"src/content-extraction.js",
			"src/translator-messages.js",
			"src/youtube-player-control.js",
			"src/content.js",
		],
	});
}

async function sendToast(tabId, message, level) {
	try {
		await ensureContentScript(tabId);
		await chrome.tabs.sendMessage(
			tabId,
			TranslatorMessages.showToast({
				level: level || "info",
				message,
			}),
		);
	} catch (_error) {
		// Ignore toast failures on unsupported pages.
	}
}

function discoverEmbeddedPageFrames(tabId, pageUrl) {
	return TranslatorEmbeddedFrames.discoverEmbeddedFrames({
		pageUrl,
		permissions: chrome.permissions,
		scripting: chrome.scripting,
		siteProfiles: TranslatorContentSiteProfiles,
		tabId,
	});
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

async function getSelectionAnchor(tabId, frameId, selectionText) {
	try {
		const target = { tabId };

		if (Number.isInteger(frameId) && frameId >= 0) {
			target.frameIds = [frameId];
		}

		const [result] = await chrome.scripting.executeScript({
			target,
			args: [selectionText],
			func: (selectedText) => {
				const SEARCH_SNIPPET_MAX_LENGTH = 120;
				const SEARCH_SNIPPET_MIN_LENGTH = 12;
				const SEARCH_ELEMENT_SELECTOR = [
					"p",
					"li",
					"blockquote",
					"figcaption",
					"td",
					"th",
					"h1",
					"h2",
					"h3",
					"h4",
					"h5",
					"h6",
					"div",
					"span",
				].join(", ");
				const SKIP_SELECTOR = [
					"script",
					"style",
					"noscript",
					"textarea",
					"input",
					"select",
					"option",
					"svg",
					"canvas",
				].join(", ");

				const selection =
					typeof window.getSelection === "function"
						? window.getSelection()
						: null;

				const toRect = (rect) => {
					if (!rect) {
						return null;
					}

					return {
						top: rect.top,
						right: rect.right,
						bottom: rect.bottom,
						left: rect.left,
						width: rect.width,
						height: rect.height,
					};
				};

				const getRangeRect = (range) => {
					if (!range) {
						return null;
					}

					const rangeRect = toRect(range.getBoundingClientRect());

					if (rangeRect && (rangeRect.width > 0 || rangeRect.height > 0)) {
						return rangeRect;
					}

					const clientRects = Array.from(range.getClientRects())
						.map((rect) => toRect(rect))
						.filter((rect) => rect && (rect.width > 0 || rect.height > 0));

					if (clientRects.length === 0) {
						return null;
					}

					const top = Math.min(...clientRects.map((rect) => rect.top));
					const right = Math.max(...clientRects.map((rect) => rect.right));
					const bottom = Math.max(...clientRects.map((rect) => rect.bottom));
					const left = Math.min(...clientRects.map((rect) => rect.left));

					return {
						top,
						right,
						bottom,
						left,
						width: Math.max(0, right - left),
						height: Math.max(0, bottom - top),
					};
				};

				const normalizeWithMap = (text) => {
					const raw = String(text || "");
					let normalized = "";
					const indexMap = [];
					let previousWasWhitespace = false;

					for (let index = 0; index < raw.length; index += 1) {
						const character = raw[index];
						const isWhitespace = /\s/.test(character);

						if (isWhitespace) {
							if (previousWasWhitespace) {
								continue;
							}

							normalized += " ";
							indexMap.push(index);
							previousWasWhitespace = true;
							continue;
						}

						normalized += character;
						indexMap.push(index);
						previousWasWhitespace = false;
					}

					return {
						normalized: normalized.trim(),
						indexMap,
						raw,
					};
				};

				const buildSearchSnippets = (text) => {
					const normalized = String(text || "")
						.replace(/\s+/g, " ")
						.trim();

					if (!normalized) {
						return [];
					}

					return [
						normalized.slice(0, SEARCH_SNIPPET_MAX_LENGTH),
						normalized.slice(0, 80),
						normalized.slice(0, 48),
						normalized.slice(0, 24),
					].filter(
						(snippet, index, array) =>
							snippet.length >= SEARCH_SNIPPET_MIN_LENGTH &&
							array.indexOf(snippet) === index,
					);
				};

				const isVisibleElement = (element) => {
					if (!(element instanceof Element)) {
						return false;
					}

					if (element.closest(SKIP_SELECTOR)) {
						return false;
					}

					const style = window.getComputedStyle(element);

					return style.display !== "none" && style.visibility !== "hidden";
				};

				if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
					const snippets = buildSearchSnippets(selectedText);

					if (snippets.length === 0 || !document.body) {
						return null;
					}

					const walker = document.createTreeWalker(
						document.body,
						NodeFilter.SHOW_TEXT,
						{
							acceptNode(node) {
								if (!(node instanceof Text)) {
									return NodeFilter.FILTER_REJECT;
								}

								const parent = node.parentElement;

								if (!parent || !isVisibleElement(parent)) {
									return NodeFilter.FILTER_REJECT;
								}

								return String(node.textContent || "").trim()
									? NodeFilter.FILTER_ACCEPT
									: NodeFilter.FILTER_REJECT;
							},
						},
					);
					let currentNode = walker.nextNode();

					while (currentNode) {
						const normalizedNode = normalizeWithMap(currentNode.textContent);

						for (const snippet of snippets) {
							const normalizedIndex =
								normalizedNode.normalized.indexOf(snippet);

							if (normalizedIndex < 0) {
								continue;
							}

							const rawStart = normalizedNode.indexMap[normalizedIndex];
							const rawEndIndex = Math.min(
								normalizedIndex + snippet.length - 1,
								normalizedNode.indexMap.length - 1,
							);
							const rawEnd = normalizedNode.indexMap[rawEndIndex] + 1;

							if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) {
								continue;
							}

							const range = document.createRange();
							range.setStart(currentNode, rawStart);
							range.setEnd(currentNode, rawEnd);
							const fallbackRect = getRangeRect(range);

							if (fallbackRect) {
								return fallbackRect;
							}
						}

						currentNode = walker.nextNode();
					}

					for (const element of document.querySelectorAll(
						SEARCH_ELEMENT_SELECTOR,
					)) {
						if (!isVisibleElement(element)) {
							continue;
						}

						const normalizedText = String(element.textContent || "")
							.replace(/\s+/g, " ")
							.trim();

						if (!normalizedText) {
							continue;
						}

						for (const snippet of snippets) {
							if (!normalizedText.includes(snippet)) {
								continue;
							}

							const fallbackRect = toRect(element.getBoundingClientRect());

							if (
								fallbackRect &&
								(fallbackRect.width > 0 || fallbackRect.height > 0)
							) {
								return fallbackRect;
							}
						}
					}

					return null;
				}

				return getRangeRect(selection.getRangeAt(0).cloneRange());
			},
		});

		return result?.result || null;
	} catch (error) {
		if (isTabMessageDisconnectError(error)) {
			return null;
		}

		throw error;
	}
}

async function loadSettingsOrOpenOptions() {
	const settings = await TranslatorStorage.getSettings();

	if (TranslatorStorage.hasCompleteSettings(settings)) {
		return settings;
	}

	await chrome.runtime.openOptionsPage();
	throw new Error("Settings are incomplete. Configure the extension first.");
}

const pageTranslationQueue =
	TranslatorPageTranslationQueue.createPageTranslationQueue({
		concurrency: PAGE_TRANSLATION_CONCURRENCY,
		batchSize: PAGE_TRANSLATION_BATCH_SIZE,
		processBatch: ({ tabId, frameId, sessionId, items }) =>
			processPageTranslationItemBatch(tabId, frameId, sessionId, items),
		onError(error) {
			console.error("Failed to process page translation item:", error);
		},
	});

function getPageTranslationSession(tabId, sessionId, frameId) {
	return pageTranslationQueue.get(tabId, sessionId, frameId);
}

async function processPageTranslationItemBatch(
	tabId,
	frameId,
	sessionId,
	items,
) {
	const session = getPageTranslationSession(tabId, sessionId, frameId);

	const batchItems = (items || []).filter(
		(item) => item && typeof item.id === "string",
	);

	if (!session || batchItems.length === 0) {
		return;
	}

	try {
		const placeholderIds = batchItems
			.filter((item) => item.kind !== "subtitle")
			.map((item) => item.id);

		if (placeholderIds.length > 0) {
			await chrome.tabs.sendMessage(
				tabId,
				TranslatorMessages.renderPagePlaceholders({
					ids: placeholderIds,
					targetLanguage: session.settings.targetLanguage,
					...buildTranslationAppearancePayload(session.settings),
				}),
				getFrameMessageOptions(frameId),
			);
		}

		const chunkPlan = TranslatorApi.createRecursiveChunkPlan(batchItems);
		const mergeState = TranslatorApi.createProgressiveMergeState(chunkPlan);
		const progressiveResult =
			await TranslatorApi.requestTranslationsBatchedProgressive({
				settings: session.settings,
				chunks: chunkPlan.chunks,
				concurrency: Math.min(
					PAGE_TRANSLATION_CONCURRENCY,
					chunkPlan.chunks.length || 1,
				),
				onChunkResolved: async ({ translations }) => {
					const currentSession = getPageTranslationSession(
						tabId,
						sessionId,
						frameId,
					);

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
						pageTranslationQueue.markTranslated(
							tabId,
							sessionId,
							completedTranslations.map((translation) => translation.id),
							frameId,
						);

						await renderPageTranslationUpdates(
							tabId,
							currentSession.settings.targetLanguage,
							completedTranslations,
							currentSession.settings,
							frameId,
						);
						setBadge(
							tabId,
							String(pageTranslationQueue.getTranslatedCount(tabId)),
						);
					}
				},
			});

		const incompleteSegmentIds = TranslatorApi.getIncompleteSegmentIds(
			chunkPlan,
			mergeState,
		);

		if (incompleteSegmentIds.length > 0) {
			await clearPagePlaceholders(tabId, incompleteSegmentIds, frameId);
		}

		if (progressiveResult.failures.length > 0) {
			const failedCount =
				incompleteSegmentIds.length || progressiveResult.failures.length;

			setBadge(tabId, "!");
			await sendToast(
				tabId,
				`Failed to translate ${failedCount} page item${failedCount === 1 ? "" : "s"}. Successful translations were kept.`,
				"error",
			);
		}
	} catch (error) {
		if (isTabMessageDisconnectError(error)) {
			pageTranslationQueue.remove(tabId, frameId);
			const translatedCount = pageTranslationQueue.getTranslatedCount(tabId);

			setBadge(tabId, translatedCount > 0 ? String(translatedCount) : "");
			return;
		}

		throw error;
	}
}

async function queuePageTranslationItems(tabId, sessionId, items, frameId) {
	return pageTranslationQueue.enqueue(tabId, sessionId, items, frameId);
}

async function startPageTranslationFrame(tabId, frameId, settings) {
	await ensureContentScript(tabId, frameId);
	const session = pageTranslationQueue.create(tabId, settings, frameId);
	const extraction = await chrome.tabs.sendMessage(
		tabId,
		TranslatorMessages.startPageTranslationSession({
			sessionId: session.sessionId,
			targetLanguage: settings.targetLanguage,
			...buildTranslationAppearancePayload(settings),
			...buildDebugPayload(settings),
		}),
		getFrameMessageOptions(frameId),
	);

	if (!extraction || !Array.isArray(extraction.items)) {
		pageTranslationQueue.remove(tabId, frameId);
		return { items: [], totalSegments: 0 };
	}

	if (extraction.items.length > 0) {
		await queuePageTranslationItems(
			tabId,
			session.sessionId,
			extraction.items,
			frameId,
		);
	} else if (
		!TranslatorPageTranslationQueue.shouldKeepPageTranslationSession(extraction)
	) {
		pageTranslationQueue.remove(tabId, frameId);
	}

	return extraction;
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

	pageTranslationQueue.remove(tab.id);
	const embeddedFrames = await discoverEmbeddedPageFrames(tab.id, tab.url);
	const frames = [{ frameId: 0, url: tab.url }, ...embeddedFrames];
	let queuedCount = 0;
	let totalSegments = 0;
	let keepAliveCount = 0;

	for (const frame of frames) {
		try {
			const extraction = await startPageTranslationFrame(
				tab.id,
				frame.frameId,
				settings,
			);

			queuedCount += extraction.items.length;
			totalSegments += Number(extraction.totalSegments) || 0;
			keepAliveCount += extraction.keepAlive ? 1 : 0;
		} catch (error) {
			pageTranslationQueue.remove(tab.id, frame.frameId);

			if (frame.frameId === 0) {
				throw error;
			}
		}
	}

	if (queuedCount > 0) {
		return;
	}

	if (totalSegments > 0) {
		await sendToast(
			tab.id,
			"Visible content is already translated. More content will translate as you scroll.",
			"info",
		);
		return;
	}

	if (keepAliveCount > 0) {
		await sendToast(
			tab.id,
			"Subtitle translation is ready. Turn on YouTube captions and play the video.",
			"info",
		);
		return;
	}

	await sendToast(
		tab.id,
		"No translatable text was found on this page.",
		"info",
	);
	setBadge(tab.id, "");
}

async function translateSelection(tabId, selectionText, frameId, options = {}) {
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
		throw new Error(
			"Translation is disabled for this domain. Remove it from Disabled Domains in Settings to continue.",
		);
	}

	const hasPermission = await ensureApiPermission(settings);

	if (!hasPermission) {
		throw new Error(
			"Permission to access the configured API origin was denied.",
		);
	}

	await ensureContentScript(tabId, frameId);
	const selectionAnchor =
		settings.selectionPanelPositionMode === "near-selection"
			? options.selectionAnchor ||
				(await getSelectionAnchor(tabId, frameId, text))
			: null;
	const frameMessageOptions = getFrameMessageOptions(frameId);
	const requestId = createSelectionRequestId();
	const panelPayload = {
		requestId,
		sourceText: text,
		targetLanguage: settings.targetLanguage,
		...buildTranslationAppearancePayload(settings),
		...buildSelectionPanelPayload(settings, selectionAnchor),
	};
	await chrome.tabs.sendMessage(
		tabId,
		TranslatorMessages.renderSelectionPlaceholder(panelPayload),
		frameMessageOptions,
	);

	try {
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

		const renderResult = await chrome.tabs.sendMessage(
			tabId,
			TranslatorMessages.renderSelectionTranslation({
				...panelPayload,
				translation,
				protectedFragments: translations[0]?.protectedFragments || [],
			}),
			frameMessageOptions,
		);
		if (renderResult?.rendered === "floating") {
			setBadge(tabId, "TR");
		}
		return { ok: true, requestId };
	} catch (error) {
		const renderResult = await chrome.tabs.sendMessage(
			tabId,
			TranslatorMessages.renderSelectionError({
				...panelPayload,
				error:
					String(error?.message || "").trim() ||
					"The translation could not be completed. Try again.",
			}),
			frameMessageOptions,
		);
		if (renderResult?.rendered === "floating") {
			setBadge(tabId, "!");
		}
		return { ok: false, error: error.message, requestId };
	}
}

async function enableYoutubeCaptions(tabId) {
	const [result] = await chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: () => {
			const player = document.querySelector("#movie_player");
			const captionButton = player?.querySelector(".ytp-subtitles-button");

			if (!player || !captionButton) {
				return { enabled: false, hasTrack: false };
			}

			if (captionButton.getAttribute("aria-pressed") !== "true") {
				captionButton.click();
			}

			const responseTracks =
				globalThis.ytInitialPlayerResponse?.captions
					?.playerCaptionsTracklistRenderer?.captionTracks;
			const playerTracks = player.getOption?.("captions", "tracklist");
			const tracks = Array.isArray(responseTracks)
				? responseTracks
				: Array.isArray(playerTracks)
					? playerTracks
					: [];

			if (
				captionButton.getAttribute("aria-pressed") !== "true" &&
				tracks.length > 0
			) {
				const track = tracks[0];
				player.setOption?.("captions", "track", {
					languageCode: track.languageCode,
					kind: track.kind || "",
					name: track.name?.simpleText || track.name || "",
				});
			}

			return {
				enabled: captionButton.getAttribute("aria-pressed") === "true",
				hasTrack: tracks.length > 0,
			};
		},
	});

	return result?.result || { enabled: false, hasTrack: false };
}

async function startYoutubeSubtitleTranslation(sender) {
	if (!sender?.tab?.id || (sender.frameId ?? 0) !== 0) {
		throw new Error(
			"YouTube subtitle translation requires the main video page.",
		);
	}

	const tab = await chrome.tabs.get(sender.tab.id);

	const profileId = tab?.url
		? TranslatorContentSiteProfiles.resolveSiteProfile(
				new URL(tab.url).hostname,
			).id
		: "default";

	if (profileId !== "youtube") {
		throw new Error("This control is only available on YouTube videos.");
	}

	const captions = await enableYoutubeCaptions(tab.id).catch(() => ({
		enabled: false,
		hasTrack: false,
	}));

	try {
		await translatePage(tab);
		return { ok: true, captions };
	} catch (error) {
		return {
			ok: false,
			error: error.message,
			openOptions: String(error.message || "").includes(
				"Settings are incomplete",
			),
		};
	}
}

async function handleRuntimeMessage(message, sender) {
	if (!message || typeof message !== "object") {
		return { ok: false };
	}

	if (message.type === TranslatorMessages.MESSAGE_TYPES.OPEN_OPTIONS) {
		await chrome.runtime.openOptionsPage();
		return { ok: true };
	}

	if (
		message.type ===
		TranslatorMessages.MESSAGE_TYPES.START_YOUTUBE_SUBTITLE_TRANSLATION
	) {
		return startYoutubeSubtitleTranslation(sender);
	}

	if (
		message.type ===
		TranslatorMessages.MESSAGE_TYPES.RETRY_SELECTION_TRANSLATION
	) {
		if (!sender.tab?.id) {
			throw new Error("Selection translation retry requires a browser tab.");
		}

		return translateSelection(
			sender.tab.id,
			message.payload?.sourceText,
			sender.frameId,
			{ selectionAnchor: message.payload?.selectionAnchor },
		);
	}

	if (message.type === TranslatorMessages.MESSAGE_TYPES.TEST_CONNECTION) {
		const validation = TranslatorStorage.validateSettings(message.payload);

		if (!validation.isValid) {
			throw new Error(validation.errors.join(" "));
		}

		const translationStartedAt = Date.now();
		const translations = await TranslatorApi.requestTranslations({
			settings: validation.settings,
			items: [{ id: "sample", kind: "paragraph", text: "Hello world." }],
		});
		const modelDiagnostics = await fetchModelsDiagnostics(validation.settings);

		return {
			ok: true,
			translation: translations[0] ? translations[0].translation : "",
			latencyMs: Date.now() - translationStartedAt,
			modelsAvailable: modelDiagnostics.ok,
			modelCount: modelDiagnostics.count || 0,
			modelsLatencyMs: modelDiagnostics.latencyMs || 0,
			modelsError: modelDiagnostics.error || "",
		};
	}

	if (
		message.type ===
		TranslatorMessages.MESSAGE_TYPES.QUEUE_PAGE_TRANSLATION_ITEMS
	) {
		const tabId = sender?.tab?.id;
		const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : 0;

		if (!tabId) {
			return { ok: false, queued: 0 };
		}

		const result = await queuePageTranslationItems(
			tabId,
			message.payload?.sessionId,
			message.payload?.items,
			frameId,
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
			pageTranslationQueue.remove(tab.id);
			await chrome.tabs
				.sendMessage(tab.id, TranslatorMessages.clearPendingTranslations())
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
			await translateSelection(tab.id, info.selectionText, info.frameId);
		}
	} catch (error) {
		if (tab?.id) {
			pageTranslationQueue.remove(tab.id);
			await chrome.tabs
				.sendMessage(tab.id, TranslatorMessages.clearPendingTranslations())
				.catch(() => {});
			await sendToast(tab.id, error.message, "error");
			setBadge(tab.id, "!");
		}
	}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === "loading") {
		pageTranslationQueue.remove(tabId);
		setBadge(tabId, "");
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	pageTranslationQueue.remove(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleRuntimeMessage(message, sender)
		.then((result) => sendResponse(result))
		.catch((error) => sendResponse({ ok: false, error: error.message }));

	return true;
});
