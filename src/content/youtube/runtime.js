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
		Messages,
	} = options;
	function getYoutubeDiagnosticSnapshot() {
		return YoutubeDiagnosticsApi.collectYoutubeDiagnostics({
			document,
			extensionVersion: chrome.runtime.getManifest?.().version || "unknown",
			location: window.location,
			playerResponse: window.ytInitialPlayerResponse,
		});
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

		if (options.show || pageState.youtubeDiagnostics.panel?.isConnected) {
			renderYoutubeDiagnostics();
		}
	}

	function applyYoutubeControlPresentation(button, presentation) {
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
	}

	function applyYoutubeControlState(button, state) {
		if (!button || !SubtitleApi?.resolvePlayerControlState) {
			return;
		}

		const resolved = SubtitleApi.resolvePlayerControlState(state);

		applyYoutubeControlPresentation(button, resolved);
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
		applyYoutubeControlPresentation(button, presentation);
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
			pageState.youtubeControl.videoKey = videoKey;
			pageState.youtubeControl.state = "idle";
			pageState.youtubeDiagnostics.store.clear();
			pageState.youtubeDiagnostics.status = "Ready";
			closeYoutubeDiagnostics();
			pageState.pageTranslation.active = false;
			pageState.pageTranslation.sessionId = "";
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
		cleanupYoutubeRuntime,
		clearYoutubeCaptionCheck,
		closeYoutubeDiagnostics,
		ensureYoutubeControl,
		recordYoutubeDiagnostic,
		scheduleYoutubeControlMount,
	};
}
