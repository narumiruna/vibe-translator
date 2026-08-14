import { createCaptionFallbackStore } from "./caption-fallback.js";

export function createYoutubeRuntime(options = {}) {
	const {
		document,
		window,
		chrome,
		pageState,
		rootAttr: ROOT_ATTR,
		styleId: STYLE_ID,
		ensureStyles,
		SubtitleApi,
		YoutubeDiagnosticsApi,
		YoutubePlayerControlApi,
		TimedCaptionApi,
		Messages,
		scheduleVisibleTranslation,
	} = options;
	const captionFallbackStore = createCaptionFallbackStore();

	pageState.youtubeDiagnostics.captionStatus ||= {
		hasTrack: false,
		prefetchAvailable: false,
		timedTrackAvailable: false,
		trackCount: 0,
		trackSource: "none",
	};

	function getYoutubeDiagnosticSnapshot() {
		const events = pageState.youtubeDiagnostics.store.getEvents();

		return {
			...YoutubeDiagnosticsApi.collectYoutubeDiagnostics({
				captionStatus: pageState.youtubeDiagnostics.captionStatus,
				document,
				extensionVersion: chrome.runtime.getManifest?.().version || "unknown",
				location: window.location,
			}),
			captionFallback: captionFallbackStore.getSummary(),
			captionTrace: pageState.youtubeDiagnostics.captionTrace?.getSummary?.(),
			failureCount: events.filter((event) => event.stage === "api-error")
				.length,
		};
	}

	function getYoutubeDiagnosticReport() {
		return YoutubeDiagnosticsApi.createDiagnosticReport(
			getYoutubeDiagnosticSnapshot(),
			pageState.youtubeDiagnostics.store.getEvents(),
		);
	}

	function closeYoutubeDiagnostics() {
		pageState.youtubeDiagnostics.panel?.remove();
		pageState.youtubeDiagnostics.panel = null;
	}

	async function copyYoutubeDiagnostics(button) {
		const report = getYoutubeDiagnosticReport();

		try {
			await navigator.clipboard.writeText(report);
			button.textContent = "Copied";
		} catch (_error) {
			button.textContent = "Copy failed";
		}
	}

	function renderYoutubeDiagnostics() {
		ensureStyles();
		const player = document.querySelector("#movie_player");

		if (!player) {
			return null;
		}

		let panel = pageState.youtubeDiagnostics.panel;

		if (!panel?.isConnected) {
			panel = document.createElement("aside");
			panel.setAttribute(ROOT_ATTR, "youtube-diagnostics");
			panel.setAttribute("aria-live", "polite");
			panel.setAttribute("aria-label", "Vibe Translator diagnostics");
			pageState.youtubeDiagnostics.panel = panel;
			player.appendChild(panel);
		}

		const title = document.createElement("strong");
		const status = document.createElement("span");
		const output = document.createElement("pre");
		const copyButton = document.createElement("button");
		const closeButton = document.createElement("button");

		title.textContent = "Vibe Translator diagnostics";
		status.setAttribute("data-ot-diagnostic-status", "");
		status.textContent = pageState.youtubeDiagnostics.status;
		output.textContent = getYoutubeDiagnosticReport();
		copyButton.type = "button";
		copyButton.textContent = "Copy diagnostics";
		copyButton.addEventListener("click", () => {
			copyYoutubeDiagnostics(copyButton);
		});
		closeButton.type = "button";
		closeButton.textContent = "Close";
		closeButton.addEventListener("click", closeYoutubeDiagnostics);
		panel.replaceChildren(title, status, output, copyButton, closeButton);

		return panel;
	}

	function recordYoutubeDiagnostic(stage, detail, options = {}) {
		pageState.youtubeDiagnostics.store.add(stage, detail);
		pageState.youtubeDiagnostics.status = detail || stage;
		pageState.youtubeDiagnostics.captionTrace?.addOutcomes?.(options.outcomes);

		if (Number(options.outcomes?.rendered) > 0) {
			recoverYoutubeCaptionTimeout();
		}
		if (options.show || pageState.youtubeDiagnostics.panel?.isConnected) {
			renderYoutubeDiagnostics();
		}
	}

	function getYoutubeCurrentTimeMs() {
		const video = document.querySelector("#movie_player video");

		return Math.max(0, Number(video?.currentTime) || 0) * 1000;
	}

	function recoverYoutubeCaptionTimeout() {
		const button = pageState.youtubeControl.button;

		if (
			pageState.youtubeControl.errorReason !== "caption-timeout" ||
			!button ||
			!YoutubePlayerControlApi?.getVisibleYoutubeCaptionText(document)
		) {
			return false;
		}

		applyYoutubeControlState(button, "active");
		recordYoutubeDiagnostic(
			"caption-recovered",
			"YouTube captions became visible; translation remains active",
		);
		return true;
	}

	function recordYoutubeCachePaths(matched = {}) {
		const cached = matched.cached || [];
		const missing = matched.missing || [];
		const video = document.querySelector("#movie_player video");
		const playback = {
			playbackRate: video?.playbackRate,
			videoTimeMs: Math.max(0, Number(video?.currentTime) || 0) * 1000,
		};

		for (const item of cached) {
			pageState.youtubeDiagnostics.captionTrace?.addMutation?.({
				...playback,
				cachePath: item.cachePath || "exact",
				characters: item.sourceText?.length,
				kind: "render",
			});
		}
		if (cached.length > 0 || missing.length > 0) {
			const exact = cached.filter(
				(item) => item.cachePath !== "timed-prefix",
			).length;
			const timedPrefix = cached.length - exact;

			recordYoutubeDiagnostic(
				"cache-path",
				`exact=${exact}; timed-prefix=${timedPrefix}; visible-fallback=${missing.length}`,
			);
			recoverYoutubeCaptionTimeout();
		}
	}

	function getCaptionSlots() {
		const sources = Array.from(
			document.querySelectorAll?.(
				YoutubeDiagnosticsApi.CAPTION_SEGMENT_SELECTOR,
			) || [],
		);
		const slotBySourceId = new Map();
		const activeSlotIds = new Set();

		for (let index = 0; index < sources.length; index += 1) {
			const slotId = `caption-${index}`;
			const sourceId = sources[index].getAttribute?.("data-ot-source-id");

			activeSlotIds.add(slotId);
			if (sourceId) {
				slotBySourceId.set(sourceId, slotId);
			}
		}

		return { activeSlotIds, slotBySourceId };
	}

	function prepareYoutubeCaptionFallbacks(matched = {}) {
		const before = captionFallbackStore.getSummary();
		const { activeSlotIds, slotBySourceId } = getCaptionSlots();
		const accepted = [];

		captionFallbackStore.retain(activeSlotIds);
		for (const item of matched.missing || []) {
			const slotId = slotBySourceId.get(item.id);
			const result = captionFallbackStore.offer(slotId, item);
			const video = document.querySelector("#movie_player video");
			const trace = {
				characters: item.text?.length,
				kind: "source",
				playbackRate: video?.playbackRate,
				videoTimeMs: getYoutubeCurrentTimeMs(),
			};

			if (result.accepted) {
				accepted.push(item);
				pageState.youtubeDiagnostics.captionTrace?.addMutation?.({
					...trace,
					cachePath: "visible-fallback",
				});
			} else if (result.coalesced) {
				pageState.youtubeDiagnostics.captionTrace?.addMutation?.({
					...trace,
					progressive: true,
				});
			}
		}

		const after = captionFallbackStore.getSummary();
		const coalesced =
			after.coalescedFallbackCount - before.coalescedFallbackCount;

		if (coalesced > 0) {
			recordYoutubeDiagnostic(
				"fallback-coalesced",
				`coalesced=${coalesced}; active-slots=${after.activeSlotCount}; latest-pending=${after.latestPendingCount}`,
			);
		}
		return accepted;
	}

	function matchYoutubeCaptionItems(items) {
		const matched = SubtitleApi.consumeCachedSubtitleTranslations(
			pageState.youtubeSubtitleTranslations,
			items,
			{ currentTimeMs: getYoutubeCurrentTimeMs() },
		);

		recordYoutubeCachePaths(matched);
		return {
			cached: matched.cached,
			missing: prepareYoutubeCaptionFallbacks(matched),
		};
	}

	function hasYoutubeCachedTranslation(sourceTexts) {
		return SubtitleApi.hasCachedSubtitleTranslation(
			pageState.youtubeSubtitleTranslations,
			sourceTexts,
			{ currentTimeMs: getYoutubeCurrentTimeMs() },
		);
	}

	function settleYoutubeCaptionFallbacks(items) {
		const settledIds = new Set();
		const supersededIds = new Set();
		let shouldRetry = false;

		for (const item of items || []) {
			const id = typeof item === "string" ? item : item?.id;
			const result = captionFallbackStore.settle(id);

			if (!result.tracked) {
				continue;
			}
			settledIds.add(id);
			if (result.superseded) {
				supersededIds.add(id);
			}
			shouldRetry ||= result.shouldRetry;
		}

		if (shouldRetry) {
			scheduleVisibleTranslation?.();
		}
		return { settledIds, supersededIds };
	}

	function resetYoutubeCaptionFallbacks() {
		captionFallbackStore.clear();
	}

	function setYoutubeCaptionStatus(captions = {}, prefetch = {}) {
		pageState.youtubeDiagnostics.captionStatus = {
			hasTrack: Boolean(captions.hasTrack),
			prefetchAvailable: Boolean(prefetch.available),
			timedTrackAvailable: Boolean(captions.timedTrackAvailable),
			trackCount: Math.max(0, Number(captions.trackCount) || 0),
			trackSource: String(captions.trackSource || "none"),
		};
	}

	function applyYoutubeControlPresentation(button, presentation, options = {}) {
		if (!button || !presentation) {
			return;
		}

		button.setAttribute("aria-label", presentation.title);
		button.setAttribute("aria-pressed", presentation.pressed || "false");
		button.setAttribute("data-state", presentation.state);
		button.setAttribute("data-tooltip-title", presentation.title);
		button.title = presentation.title;
		button.disabled = presentation.state === "loading";
		pageState.youtubeControl.button = button;
		pageState.youtubeControl.state = presentation.state;
		pageState.youtubeControl.errorReason =
			presentation.state === "error" ? options.errorReason || "fatal" : "";
	}

	function applyYoutubeControlState(button, state) {
		if (!button || !SubtitleApi?.resolvePlayerControlState) {
			return;
		}

		const resolved = SubtitleApi.resolvePlayerControlState(state);

		applyYoutubeControlPresentation(button, resolved, {
			errorReason:
				state === "error"
					? pageState.youtubeControl.errorReason || "fatal"
					: "",
		});
	}

	function getYoutubeVideoKey() {
		const location = window.location;

		if (location.pathname === "/watch") {
			return new URLSearchParams(location.search).get("v") || "";
		}

		return /^\/shorts\/([^/]+)/u.exec(location.pathname)?.[1] || "";
	}

	function clearYoutubeCaptionCheck() {
		if (pageState.youtubeControl.captionCheckTimer) {
			window.clearTimeout(pageState.youtubeControl.captionCheckTimer);
			pageState.youtubeControl.captionCheckTimer = null;
		}
	}

	function reportYoutubePrefetchProgress(reason, force = false) {
		const video = pageState.youtubeControl.prefetchVideo;
		const currentTimeMs = Math.max(0, Number(video?.currentTime) || 0) * 1000;

		if (
			!video ||
			!TimedCaptionApi?.shouldReportCaptionProgress(
				pageState.youtubeControl.lastPrefetchTimeMs,
				currentTimeMs,
				{ force },
			)
		) {
			return false;
		}

		pageState.youtubeControl.lastPrefetchTimeMs = currentTimeMs;
		chrome.runtime
			.sendMessage(
				Messages.prefetchYoutubeSubtitles({
					currentTimeMs,
					playbackRate: TimedCaptionApi.normalizePlaybackRate(
						video.playbackRate,
					),
					reason,
				}),
			)
			.catch?.(() => {});
		return true;
	}

	function handleYoutubePlaybackProgress() {
		reportYoutubePrefetchProgress("progress", false);
	}

	function handleYoutubePlaybackSeek() {
		reportYoutubePrefetchProgress("seek", true);
	}

	function handleYoutubePlaybackRateChange() {
		reportYoutubePrefetchProgress("ratechange", true);
	}

	function clearYoutubePrefetchTracking() {
		const video = pageState.youtubeControl.prefetchVideo;

		video?.removeEventListener?.("timeupdate", handleYoutubePlaybackProgress);
		video?.removeEventListener?.("seeking", handleYoutubePlaybackSeek);
		video?.removeEventListener?.("ratechange", handleYoutubePlaybackRateChange);
		pageState.youtubeControl.prefetchVideo = null;
		pageState.youtubeControl.lastPrefetchTimeMs = 0;
	}

	function bindYoutubePrefetchTracking() {
		const video =
			document.querySelector?.("#movie_player video") ||
			document.querySelector?.("video");

		clearYoutubePrefetchTracking();

		if (!video) {
			return false;
		}

		pageState.youtubeControl.prefetchVideo = video;
		pageState.youtubeControl.lastPrefetchTimeMs =
			Math.max(0, Number(video.currentTime) || 0) * 1000;
		video.addEventListener?.("timeupdate", handleYoutubePlaybackProgress);
		video.addEventListener?.("seeking", handleYoutubePlaybackSeek);
		video.addEventListener?.("ratechange", handleYoutubePlaybackRateChange);
		return true;
	}

	function showYoutubeCaptionUnavailable(button) {
		if (
			!button ||
			pageState.youtubeControl.button !== button ||
			pageState.youtubeControl.state !== "active" ||
			YoutubePlayerControlApi?.getVisibleYoutubeCaptionText(document)
		) {
			return;
		}

		const presentation = SubtitleApi.resolvePlayerControlError({
			error: "YouTube captions are not visible. Turn on CC and play the video",
		});
		applyYoutubeControlPresentation(button, presentation, {
			errorReason: "caption-timeout",
		});
		recordYoutubeDiagnostic("caption-timeout", presentation.title, {
			show: true,
		});
	}

	function scheduleYoutubeCaptionCheck(button) {
		clearYoutubeCaptionCheck();
		pageState.youtubeControl.captionCheckTimer = window.setTimeout(() => {
			pageState.youtubeControl.captionCheckTimer = null;
			showYoutubeCaptionUnavailable(button);
		}, 4500);
	}

	async function handleYoutubeControlClick(_event, clickedButton) {
		const button = clickedButton || pageState.youtubeControl.button;

		if (!button) {
			return;
		}

		if (pageState.youtubeControl.state === "loading") {
			recordYoutubeDiagnostic(
				"duplicate-click",
				"Translation startup is already in progress",
				{ show: true },
			);
			return;
		}

		recordYoutubeDiagnostic("click", "Player button click received", {
			show: true,
		});
		applyYoutubeControlState(button, "loading");
		recordYoutubeDiagnostic("loading", "Contacting extension background");
		YoutubePlayerControlApi?.turnOnNativeYoutubeCaptions(
			document.querySelector("#movie_player"),
			window.ytInitialPlayerResponse,
		);

		try {
			const response = await chrome.runtime.sendMessage(
				Messages.startYoutubeSubtitleTranslation(),
			);

			if (!response?.ok) {
				const presentation = SubtitleApi.resolvePlayerControlError(response);
				applyYoutubeControlPresentation(button, presentation);
				recordYoutubeDiagnostic("background-error", presentation.title, {
					show: true,
				});

				if (presentation.openOptions) {
					await chrome.runtime.sendMessage(Messages.openOptions());
				}

				return;
			}

			applyYoutubeControlState(button, "active");
			setYoutubeCaptionStatus(response.captions, response.prefetch);
			if (response.prefetch?.available) {
				bindYoutubePrefetchTracking();
			} else {
				clearYoutubePrefetchTracking();
			}
			recordYoutubeDiagnostic(
				"active",
				`Translation session active; caption enabled=${Boolean(response.captions?.enabled)}; track found=${Boolean(response.captions?.hasTrack)}`,
			);
			scheduleYoutubeCaptionCheck(button);
		} catch (error) {
			const rawError = String(error?.message || "");
			const presentation = SubtitleApi.resolvePlayerControlError({
				error: rawError,
				openOptions:
					rawError.includes("message port closed") ||
					rawError.includes("Extension context invalidated"),
			});
			applyYoutubeControlPresentation(button, presentation);
			recordYoutubeDiagnostic("message-error", presentation.title, {
				show: true,
			});
		}
	}

	function mountYoutubeControl() {
		pageState.youtubeControl.scheduled = false;
		const controlApi = YoutubePlayerControlApi;

		if (!document.getElementById(STYLE_ID)) {
			ensureStyles();
		}

		if (!controlApi) {
			return;
		}

		const videoKey = getYoutubeVideoKey();

		if (videoKey !== pageState.youtubeControl.videoKey) {
			clearYoutubePrefetchTracking();
			pageState.youtubeControl.videoKey = videoKey;
			pageState.youtubeControl.state = "idle";
			pageState.youtubeControl.errorReason = "";
			pageState.youtubeDiagnostics.store.clear();
			pageState.youtubeDiagnostics.captionTrace?.clear?.();
			captionFallbackStore.clear();
			setYoutubeCaptionStatus();
			pageState.youtubeDiagnostics.status = "Ready";
			closeYoutubeDiagnostics();
			pageState.pageTranslation.active = false;
			pageState.pageTranslation.sessionId = "";
			pageState.pageTranslation.targetLanguage = "";
			pageState.youtubeSubtitleTranslations?.clear?.();
		}

		const button = controlApi.mountYoutubePlayerControl({
			applyState: applyYoutubeControlState,
			document,
			location: window.location,
			onClick: handleYoutubeControlClick,
		});

		if (button) {
			applyYoutubeControlState(button, pageState.youtubeControl.state);
		}
	}

	function scheduleYoutubeControlMount() {
		if (pageState.youtubeControl.scheduled) {
			return;
		}

		pageState.youtubeControl.scheduled = true;
		pageState.youtubeControl.mountTimer = window.setTimeout(() => {
			pageState.youtubeControl.mountTimer = null;
			mountYoutubeControl();
		}, 0);
	}

	function cleanupYoutubeRuntime() {
		clearYoutubeCaptionCheck();
		captionFallbackStore.clear();
		clearYoutubePrefetchTracking();
		if (pageState.youtubeControl.mountTimer) {
			window.clearTimeout(pageState.youtubeControl.mountTimer);
			pageState.youtubeControl.mountTimer = null;
		}
		pageState.youtubeControl.scheduled = false;
		pageState.youtubeControl.observer?.disconnect();
		pageState.youtubeControl.observer = null;
		window.removeEventListener?.(
			"yt-navigate-finish",
			scheduleYoutubeControlMount,
		);
		YoutubePlayerControlApi?.unbindYoutubePlayerControl?.(document);
		document
			.querySelector?.(
				YoutubePlayerControlApi?.CONTROL_SELECTOR ||
					"[data-ot-youtube-control]",
			)
			?.remove?.();
		pageState.youtubeControl.button = null;
		closeYoutubeDiagnostics();
	}

	function ensureYoutubeControl() {
		if (
			!YoutubePlayerControlApi ||
			pageState.youtubeControl.observer ||
			!document.documentElement
		) {
			return;
		}

		pageState.youtubeControl.observer = new MutationObserver(
			scheduleYoutubeControlMount,
		);
		pageState.youtubeControl.observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		window.addEventListener("yt-navigate-finish", scheduleYoutubeControlMount);
		scheduleYoutubeControlMount();
	}

	return {
		applyYoutubeControlState,
		bindYoutubePrefetchTracking,
		cleanupYoutubeRuntime,
		clearYoutubeCaptionCheck,
		closeYoutubeDiagnostics,
		ensureYoutubeControl,
		hasYoutubeCachedTranslation,
		matchYoutubeCaptionItems,
		recordYoutubeCachePaths,
		recordYoutubeDiagnostic,
		recoverYoutubeCaptionTimeout,
		resetYoutubeCaptionFallbacks,
		settleYoutubeCaptionFallbacks,
		scheduleYoutubeControlMount,
	};
}
