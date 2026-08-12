((root) => {
	const CONTROL_SELECTOR = "[data-ot-youtube-control]";
	const CAPTION_BUTTON_SELECTOR = ".ytp-subtitles-button";
	const CAPTION_SEGMENT_SELECTOR =
		"#ytp-caption-window-container .ytp-caption-segment";
	const MAX_EVENTS = 30;

	function getVideoPageLabel(locationLike) {
		const hostname = String(locationLike?.hostname || "");
		const pathname = String(locationLike?.pathname || "");
		const videoId = new URLSearchParams(String(locationLike?.search || "")).get(
			"v",
		);

		return `${hostname}${pathname}${videoId ? `?v=${videoId}` : ""}`;
	}

	function getCaptionTracks(playerResponse) {
		const tracks =
			playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

		return Array.isArray(tracks) ? tracks : [];
	}

	function getControlHitTarget(documentLike, control) {
		if (!control?.getBoundingClientRect || !documentLike?.elementFromPoint) {
			return false;
		}

		const rect = control.getBoundingClientRect();
		const target = documentLike.elementFromPoint(
			rect.left + rect.width / 2,
			rect.top + rect.height / 2,
		);

		return (
			target === control || target?.closest?.(CONTROL_SELECTOR) === control
		);
	}

	function collectYoutubeDiagnostics(options = {}) {
		const documentLike = options.document || root.document;
		const control = documentLike?.querySelector?.(CONTROL_SELECTOR);
		const captionButton = documentLike?.querySelector?.(
			CAPTION_BUTTON_SELECTOR,
		);
		const captionSegments = Array.from(
			documentLike?.querySelectorAll?.(CAPTION_SEGMENT_SELECTOR) || [],
		);
		const visibleCaptionText = captionSegments
			.map((segment) => String(segment.textContent || "").trim())
			.filter(Boolean)
			.join("\n");
		const readyNotes = Array.from(
			documentLike?.querySelectorAll?.(
				'#ytp-caption-window-container [data-ot-role="note"][data-phase="ready"]',
			) || [],
		);

		return {
			captionButton: {
				ariaLabel: captionButton?.getAttribute?.("aria-label") || "",
				ariaPressed: captionButton?.getAttribute?.("aria-pressed") || "",
				found: Boolean(captionButton),
			},
			control: {
				disabled: Boolean(control?.disabled),
				found: Boolean(control),
				hitTarget: getControlHitTarget(documentLike, control),
				state: control?.getAttribute?.("data-state") || "",
			},
			extensionVersion: String(options.extensionVersion || "unknown"),
			page: getVideoPageLabel(options.location || root.location),
			pipeline: {
				queuedSourceCount: captionSegments.filter(
					(segment) => segment.getAttribute?.("data-ot-queued") === "true",
				).length,
				readyNoteCount: readyNotes.length,
				sourceCount: captionSegments.filter((segment) =>
					Boolean(segment.getAttribute?.("data-ot-source-id")),
				).length,
				translatedSourceCount: captionSegments.filter(
					(segment) => segment.getAttribute?.("data-ot-translated") === "true",
				).length,
			},
			trackCount: getCaptionTracks(options.playerResponse).length,
			visibleCaptionCharacters: visibleCaptionText.length,
		};
	}

	function redactDiagnosticText(value) {
		return String(value || "")
			.replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/giu, "$1[redacted]")
			.replace(/(api[_-]?key\s*[=:]\s*["']?)[^\s"']+/giu, "$1[redacted]");
	}

	function normalizeDiagnosticEvent(event) {
		return {
			at: String(event?.at || new Date().toISOString()),
			detail: redactDiagnosticText(event?.detail),
			stage: String(event?.stage || "unknown"),
		};
	}

	function createDiagnosticStore() {
		const events = [];

		return {
			add(stage, detail = "") {
				events.push(normalizeDiagnosticEvent({ detail, stage }));
				if (events.length > MAX_EVENTS) {
					events.splice(0, events.length - MAX_EVENTS);
				}
				return events.at(-1);
			},
			clear() {
				events.length = 0;
			},
			getEvents() {
				return events.map((event) => ({ ...event }));
			},
		};
	}

	function createDiagnosticReport(snapshot, events) {
		return [
			"Vibe Translator YouTube diagnostics",
			JSON.stringify(
				{
					events: (events || []).map(normalizeDiagnosticEvent),
					snapshot: snapshot || {},
				},
				null,
				2,
			),
		].join("\n");
	}

	const api = {
		CAPTION_BUTTON_SELECTOR,
		CAPTION_SEGMENT_SELECTOR,
		CONTROL_SELECTOR,
		collectYoutubeDiagnostics,
		createDiagnosticReport,
		createDiagnosticStore,
	};

	root.TranslatorYoutubeDiagnostics = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
