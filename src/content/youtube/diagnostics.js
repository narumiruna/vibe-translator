const CONTROL_SELECTOR = "[data-ot-youtube-control]";
const CAPTION_BUTTON_SELECTOR = ".ytp-subtitles-button";
const CAPTION_SEGMENT_SELECTOR =
	"#ytp-caption-window-container .ytp-caption-segment";
const MAX_EVENTS = 30;
const MAX_TRACE_SAMPLES = 120;
const MAX_TRACE_WORD_OFFSETS = 32;
const TRACE_CACHE_PATHS = new Set([
	"exact",
	"timed-prefix",
	"visible-fallback",
]);

function normalizeNonNegativeNumber(value, fallback = 0) {
	const number = Number(value);

	return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeTraceLimit(value) {
	const number = Math.floor(Number(value));

	return Number.isFinite(number) && number > 0
		? Math.min(number, MAX_TRACE_SAMPLES)
		: MAX_TRACE_SAMPLES;
}

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

	return target === control || target?.closest?.(CONTROL_SELECTOR) === control;
}

function collectYoutubeDiagnostics(options = {}) {
	const documentLike = options.document || globalThis.document;
	const control = documentLike?.querySelector?.(CONTROL_SELECTOR);
	const captionButton = documentLike?.querySelector?.(CAPTION_BUTTON_SELECTOR);
	const video = documentLike?.querySelector?.("#movie_player video");
	const playbackRate = Number(video?.playbackRate);
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
		page: getVideoPageLabel(options.location || globalThis.location),
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
		playback: {
			currentTimeMs: Math.max(0, Number(video?.currentTime) || 0) * 1000,
			playbackRate:
				Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
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

function createCaptionTraceStore(options = {}) {
	const limit = normalizeTraceLimit(options.limit);
	const samples = [];
	const counters = {
		exactCacheHits: 0,
		progressiveSourceMutations: 0,
		timedPrefixHits: 0,
		visibleFallbacks: 0,
	};

	function cloneSample(sample) {
		return {
			...sample,
			...(sample.wordOffsetsMs
				? { wordOffsetsMs: [...sample.wordOffsetsMs] }
				: {}),
		};
	}

	function append(sample) {
		samples.push(sample);
		if (samples.length > limit) {
			samples.splice(0, samples.length - limit);
		}
		return cloneSample(sample);
	}

	function countSample(sample) {
		if (sample.cachePath === "exact") {
			counters.exactCacheHits += 1;
		} else if (sample.cachePath === "timed-prefix") {
			counters.timedPrefixHits += 1;
		} else if (sample.cachePath === "visible-fallback") {
			counters.visibleFallbacks += 1;
		}

		if (sample.kind === "source" && sample.progressive) {
			counters.progressiveSourceMutations += 1;
		}
	}

	return {
		addCue(cue = {}) {
			return append({
				cueStartMs: normalizeNonNegativeNumber(cue.cueStartMs),
				durationMs: normalizeNonNegativeNumber(cue.durationMs),
				kind: "cue",
				wordOffsetsMs: (Array.isArray(cue.wordOffsetsMs)
					? cue.wordOffsetsMs
					: []
				)
					.slice(0, MAX_TRACE_WORD_OFFSETS)
					.map((value) => normalizeNonNegativeNumber(value)),
			});
		},
		addMutation(mutation = {}) {
			const cachePath = TRACE_CACHE_PATHS.has(mutation.cachePath)
				? mutation.cachePath
				: "";
			const sample = {
				cachePath,
				characters: Math.floor(normalizeNonNegativeNumber(mutation.characters)),
				kind: mutation.kind === "source" ? "source" : "render",
				playbackRate:
					Number.isFinite(Number(mutation.playbackRate)) &&
					Number(mutation.playbackRate) > 0
						? Number(mutation.playbackRate)
						: 1,
				progressive: Boolean(mutation.progressive),
				videoTimeMs: normalizeNonNegativeNumber(mutation.videoTimeMs),
			};

			countSample(sample);
			return append(sample);
		},
		clear() {
			samples.length = 0;
			for (const key of Object.keys(counters)) {
				counters[key] = 0;
			}
		},
		getSamples() {
			return samples.map(cloneSample);
		},
		getSummary() {
			return { ...counters, sampleCount: samples.length };
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
	createCaptionTraceStore,
	createDiagnosticReport,
	createDiagnosticStore,
};

export {
	CAPTION_BUTTON_SELECTOR,
	CAPTION_SEGMENT_SELECTOR,
	CONTROL_SELECTOR,
	collectYoutubeDiagnostics,
	createCaptionTraceStore,
	createDiagnosticReport,
	createDiagnosticStore,
};
export default api;
