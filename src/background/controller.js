import { getSelectionAnchor } from "./selection-anchor.js";
import { createYoutubeCaptionPrefetch } from "./youtube-caption-prefetch.js";

export function createBackgroundController(options = {}) {
	const {
		chrome,
		Api,
		Messages,
		Settings,
		SiteProfiles,
		TranslationSession,
		logger,
		platform,
	} = options;
	const {
		buildDebugPayload,
		buildSelectionPanelPayload,
		buildTranslationAppearancePayload,
		buildYoutubeSubtitlePayload,
		clearPagePlaceholders,
		discoverEmbeddedPageFrames,
		ensureApiPermission,
		ensureContentScript,
		fetchModelsDiagnostics,
		getFrameMessageOptions,
		isDomainDisabled,
		isSupportedPage,
		isTabMessageDisconnectError,
		renderPageTranslationUpdates,
		sendToast,
		sendYoutubeDiagnosticEvent,
		setBadge,
		setupContextMenus,
	} = platform;
	const PAGE_TRANSLATION_CONCURRENCY = 5;
	const PAGE_TRANSLATION_BATCH_SIZE = 8;
	let selectionRequestSequence = 0;
	function createSelectionRequestId() {
		selectionRequestSequence += 1;
		return `selection-${Date.now()}-${selectionRequestSequence}`;
	}
	async function loadSettingsOrOpenOptions() {
		const settings = await Settings.getSettings();

		if (Settings.hasCompleteSettings(settings)) {
			return settings;
		}

		await chrome.runtime.openOptionsPage();
		throw new Error("Settings are incomplete. Configure the extension first.");
	}

	const pageTranslationQueue = TranslationSession.createPageTranslationQueue({
		concurrency: PAGE_TRANSLATION_CONCURRENCY,
		batchSize: PAGE_TRANSLATION_BATCH_SIZE,
		processBatch: ({ tabId, frameId, sessionId, items }) =>
			processPageTranslationItemBatch(tabId, frameId, sessionId, items),
		onError(error, context) {
			logger?.error("page-batch-failed", {
				error: error?.message || String(error),
				frameId: context?.frameId,
				sessionId: context?.sessionId,
				tabId: context?.tabId,
			});
		},
	});
	const youtubeCaptionPrefetch = createYoutubeCaptionPrefetch({
		enqueue: ({ tabId, frameId, sessionId, items }) =>
			queuePageTranslationItems(tabId, sessionId, items, frameId),
		fetch: options.fetch,
		onDiagnostic(stage, detail, context) {
			sendYoutubeDiagnosticEvent?.(
				context.tabId,
				context.frameId || 0,
				stage,
				detail,
			)?.catch?.(() => {});
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
		logger?.debug("page-batch-start", {
			frameId,
			itemCount: items?.length || 0,
			sessionId,
			tabId,
		});
		const session = getPageTranslationSession(tabId, sessionId, frameId);

		const batchItems = (items || []).filter(
			(item) => item && typeof item.id === "string",
		);

		if (!session || batchItems.length === 0) {
			return;
		}

		try {
			const subtitleItems = batchItems.filter(
				(item) => item.kind === "subtitle",
			);

			if (subtitleItems.length > 0) {
				await sendYoutubeDiagnosticEvent(
					tabId,
					frameId,
					"api-start",
					`Requesting ${subtitleItems.length} caption translation(s)`,
				);
			}

			const placeholderIds = batchItems
				.filter((item) => item.kind !== "subtitle")
				.map((item) => item.id);

			if (placeholderIds.length > 0) {
				await chrome.tabs.sendMessage(
					tabId,
					Messages.renderPagePlaceholders({
						ids: placeholderIds,
						targetLanguage: session.settings.targetLanguage,
						...buildTranslationAppearancePayload(session.settings),
					}),
					getFrameMessageOptions(frameId),
				);
			}

			const chunkPlan = Api.createRecursiveChunkPlan(batchItems);
			const mergeState = Api.createProgressiveMergeState(chunkPlan);
			const progressiveResult = await Api.requestTranslationsBatchedProgressive(
				{
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

						const completedTranslations = Api.consumeProgressiveTranslations(
							chunkPlan,
							mergeState,
							translations,
						);

						if (completedTranslations.length > 0) {
							if (
								completedTranslations.some(
									(translation) => translation.kind === "subtitle",
								)
							) {
								await sendYoutubeDiagnosticEvent(
									tabId,
									frameId,
									"api-success",
									`API returned ${completedTranslations.length} completed translation(s)`,
								);
							}

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
				},
			);

			const incompleteSegmentIds = Api.getIncompleteSegmentIds(
				chunkPlan,
				mergeState,
			);

			if (incompleteSegmentIds.length > 0) {
				await clearPagePlaceholders(tabId, incompleteSegmentIds, frameId);
			}

			if (progressiveResult.failures.length > 0) {
				const subtitleFailure = progressiveResult.failures.find((failure) =>
					failure.chunkItems?.some((item) => item.kind === "subtitle"),
				);

				if (subtitleFailure) {
					await sendYoutubeDiagnosticEvent(
						tabId,
						frameId,
						"api-error",
						String(
							subtitleFailure.error?.message ||
								"Caption translation request failed",
						),
					);
				}

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
			Messages.startPageTranslationSession({
				sessionId: session.sessionId,
				targetLanguage: settings.targetLanguage,
				...buildTranslationAppearancePayload(settings),
				...buildYoutubeSubtitlePayload(settings),
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
			!TranslationSession.shouldKeepPageTranslationSession(extraction)
		) {
			pageTranslationQueue.remove(tabId, frameId);
		}

		return { ...extraction, sessionId: session.sessionId };
	}

	function removePageTranslationState(tabId, frameId) {
		pageTranslationQueue.remove(tabId, frameId);

		if (!Number.isInteger(frameId) || frameId === 0) {
			youtubeCaptionPrefetch.remove(tabId);
		}
	}

	async function translatePage(tab) {
		logger?.info("page-translation-start", { tabId: tab?.id });
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

		removePageTranslationState(tab.id);
		const embeddedFrames = await discoverEmbeddedPageFrames(tab.id, tab.url);
		const frames = [{ frameId: 0, url: tab.url }, ...embeddedFrames];
		let queuedCount = 0;
		let totalSegments = 0;
		let keepAliveCount = 0;
		let mainSessionId = "";

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
				if (frame.frameId === 0) {
					mainSessionId = extraction.sessionId || "";
				}
			} catch (error) {
				removePageTranslationState(tab.id, frame.frameId);

				if (frame.frameId === 0) {
					throw error;
				}
			}
		}

		if (queuedCount > 0) {
			return { sessionId: mainSessionId };
		}

		if (totalSegments > 0) {
			await sendToast(
				tab.id,
				"Visible content is already translated. More content will translate as you scroll.",
				"info",
			);
			return { sessionId: mainSessionId };
		}

		if (keepAliveCount > 0) {
			await sendToast(
				tab.id,
				"Subtitle translation is ready. Turn on YouTube captions and play the video.",
				"info",
			);
			return { sessionId: mainSessionId };
		}

		await sendToast(
			tab.id,
			"No translatable text was found on this page.",
			"info",
		);
		setBadge(tab.id, "");
		return { sessionId: mainSessionId };
	}

	async function translateSelection(
		tabId,
		selectionText,
		frameId,
		options = {},
	) {
		logger?.info("selection-translation-start", { frameId, tabId });
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
					(await getSelectionAnchor({
						chrome,
						tabId,
						frameId,
						selectionText: text,
						isTabMessageDisconnectError,
					}))
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
			Messages.renderSelectionPlaceholder(panelPayload),
			frameMessageOptions,
		);

		try {
			const chunkPlan = Api.createRecursiveChunkPlan([
				{ id: "selection", kind: "selection", text },
			]);
			const partialTranslations = await Api.requestTranslationsBatched({
				settings,
				chunks: chunkPlan.chunks,
				concurrency: 1,
			});
			const translations = Api.mergeRecursiveTranslations(
				chunkPlan,
				partialTranslations,
			);
			const translation = translations[0]?.translation;

			if (!translation) {
				throw new Error("The API did not return a translation.");
			}

			const renderResult = await chrome.tabs.sendMessage(
				tabId,
				Messages.renderSelectionTranslation({
					...panelPayload,
					translation,
					protectedFragments: translations[0]?.protectedFragments || [],
				}),
				frameMessageOptions,
			);
			if (renderResult?.rendered === "floating") {
				setBadge(tabId, "TR");
			}
			logger?.info("selection-render-complete", {
				frameId,
				requestId,
				tabId,
			});
			return { ok: true, requestId };
		} catch (error) {
			const renderResult = await chrome.tabs.sendMessage(
				tabId,
				Messages.renderSelectionError({
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
			logger?.error("selection-translation-failed", {
				error: error.message,
				frameId,
				requestId,
				tabId,
			});
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
				const selectedTrack = player.getOption?.("captions", "track");
				const timedTrack =
					tracks.find(
						(track) =>
							track?.baseUrl &&
							selectedTrack?.languageCode === track.languageCode,
					) || tracks.find((track) => track?.baseUrl);
				const video =
					player.querySelector?.("video") || document.querySelector("video");

				return {
					currentTimeMs: Math.max(0, Number(video?.currentTime) || 0) * 1000,
					enabled: captionButton.getAttribute("aria-pressed") === "true",
					hasTrack: tracks.length > 0,
					trackBaseUrl: String(timedTrack?.baseUrl || ""),
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
			? SiteProfiles.resolveSiteProfile(new URL(tab.url).hostname).id
			: "default";

		if (profileId !== "youtube") {
			throw new Error("This control is only available on YouTube videos.");
		}

		const captions = await enableYoutubeCaptions(tab.id).catch(() => ({
			enabled: false,
			hasTrack: false,
		}));

		try {
			const translation = await translatePage(tab);
			const prefetch = await youtubeCaptionPrefetch.initialize({
				baseUrl: captions.trackBaseUrl,
				currentTimeMs: captions.currentTimeMs,
				frameId: 0,
				sessionId: translation?.sessionId,
				tabId: tab.id,
			});
			return { ok: true, captions, prefetch };
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

		if (sender.id !== chrome.runtime.id) {
			return { ok: false, error: "Untrusted message sender." };
		}

		if (message.type === Messages.MESSAGE_TYPES.GET_RUNTIME_HEALTH) {
			return {
				ok: true,
				component: "background",
				version: chrome.runtime.getManifest().version,
			};
		}

		if (message.type === Messages.MESSAGE_TYPES.GET_PAGE_TRANSLATION_SESSION) {
			const tabId = sender?.tab?.id;
			const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : 0;

			if (!tabId) {
				return { ok: true, active: false };
			}

			const session = getPageTranslationSession(tabId, undefined, frameId);

			if (!session) {
				return { ok: true, active: false };
			}

			return {
				ok: true,
				active: true,
				sessionId: session.sessionId,
				targetLanguage: session.settings.targetLanguage,
				...buildTranslationAppearancePayload(session.settings),
				...buildYoutubeSubtitlePayload(session.settings),
				...buildDebugPayload(session.settings),
			};
		}

		if (message.type === Messages.MESSAGE_TYPES.AUTOMATION_TRANSLATE_PAGE) {
			if (!sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
				return {
					ok: false,
					error: "Automation commands require an extension page.",
				};
			}
			const tabs = await chrome.tabs.query({});
			const tab = tabs.find((item) => item.url === message.payload?.pageUrl);
			if (!tab?.id) throw new Error("Could not resolve the automation tab.");
			await translatePage(tab);
			return { ok: true, tabId: tab.id };
		}

		if (
			message.type === Messages.MESSAGE_TYPES.AUTOMATION_TRANSLATE_SELECTION
		) {
			if (!sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
				return {
					ok: false,
					error: "Automation commands require an extension page.",
				};
			}
			const tabs = await chrome.tabs.query({});
			const tab = tabs.find((item) => item.url === message.payload?.pageUrl);
			if (!tab?.id) throw new Error("Could not resolve the automation tab.");
			return translateSelection(
				tab.id,
				message.payload?.selectionText,
				message.payload?.frameId,
			);
		}

		if (message.type === Messages.MESSAGE_TYPES.OPEN_OPTIONS) {
			await chrome.runtime.openOptionsPage();
			return { ok: true };
		}

		if (
			message.type === Messages.MESSAGE_TYPES.START_YOUTUBE_SUBTITLE_TRANSLATION
		) {
			return startYoutubeSubtitleTranslation(sender);
		}

		if (message.type === Messages.MESSAGE_TYPES.PREFETCH_YOUTUBE_SUBTITLES) {
			if (!sender.tab?.id || (sender.frameId ?? 0) !== 0) {
				return { available: false, queued: 0 };
			}

			const session = getPageTranslationSession(sender.tab.id, undefined, 0);

			return youtubeCaptionPrefetch.update({
				currentTimeMs: message.payload?.currentTimeMs,
				sessionId: session?.sessionId,
				tabId: sender.tab.id,
			});
		}

		if (message.type === Messages.MESSAGE_TYPES.RETRY_SELECTION_TRANSLATION) {
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

		if (message.type === Messages.MESSAGE_TYPES.TEST_CONNECTION) {
			const validation = Settings.validateSettings(message.payload);

			if (!validation.isValid) {
				throw new Error(validation.errors.join(" "));
			}

			const translationStartedAt = Date.now();
			const translations = await Api.requestTranslations({
				settings: validation.settings,
				items: [{ id: "sample", kind: "paragraph", text: "Hello world." }],
			});
			const modelDiagnostics = await fetchModelsDiagnostics(
				validation.settings,
			);

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

		if (message.type === Messages.MESSAGE_TYPES.QUEUE_PAGE_TRANSLATION_ITEMS) {
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

	return {
		handleRuntimeMessage,
		pageTranslationQueue,
		removePageTranslationState,
		setupContextMenus,
		translatePage,
		translateSelection,
	};
}
