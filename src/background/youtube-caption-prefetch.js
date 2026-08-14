import TimedCaptions from "../content/youtube/timed-captions.js";

function isTrustedYoutubeCaptionUrl(value) {
	try {
		const url = new URL(String(value || ""));
		const hostname = url.hostname.toLowerCase();

		return (
			url.protocol === "https:" &&
			(hostname === "youtube.com" || hostname.endsWith(".youtube.com"))
		);
	} catch (_error) {
		return false;
	}
}

function createYoutubeCaptionPrefetch(options = {}) {
	const fetchImpl = options.fetch || globalThis.fetch;
	const enqueue = options.enqueue || (async () => ({ queued: 0 }));
	const onDiagnostic = options.onDiagnostic || (() => {});
	const sessions = new Map();

	function getSession(context) {
		const session = sessions.get(context.tabId);

		return session &&
			(!context.sessionId || context.sessionId === session.sessionId)
			? session
			: null;
	}

	async function update(context = {}) {
		const session = getSession(context);

		if (!session) {
			return { available: false, queued: 0 };
		}

		const playbackRate = TimedCaptions.normalizePlaybackRate(
			context.playbackRate,
		);
		const windowMs = TimedCaptions.getCaptionWindowMs(playbackRate);
		const windowCues = TimedCaptions.selectCaptionWindow(session.cues, {
			currentTimeMs: context.currentTimeMs,
			windowMs,
		});
		const items = TimedCaptions.buildTimedCaptionItems(windowCues);

		if (items.length === 0) {
			return { available: true, queued: 0 };
		}

		const placement =
			context.reason === "startup" || context.reason === "seek"
				? "front"
				: "back";
		const result = await enqueue({
			frameId: session.frameId,
			items,
			placement,
			playbackRate,
			sessionId: session.sessionId,
			tabId: session.tabId,
			windowMs,
		});
		const queued = Math.max(0, Number(result?.queued) || 0);

		onDiagnostic(
			"prefetch-window",
			`rate=${playbackRate}; window=${windowMs}ms; placement=${placement}; cues=${items.length}; queued=${queued}`,
			context,
		);
		return { available: true, queued };
	}

	async function initialize(context = {}) {
		const unavailable = { available: false, cueCount: 0, queued: 0 };

		if (
			!context.tabId ||
			!context.sessionId ||
			!isTrustedYoutubeCaptionUrl(context.baseUrl) ||
			typeof fetchImpl !== "function"
		) {
			return unavailable;
		}

		try {
			const response = await fetchImpl(
				TimedCaptions.buildJson3TrackUrl(context.baseUrl),
			);

			if (!response?.ok) {
				throw new Error(
					`Timed caption request failed with status ${response?.status || "unknown"}`,
				);
			}

			const cues = TimedCaptions.parseJson3Captions(await response.json()).map(
				(cue, cueIndex) => ({ ...cue, cueIndex }),
			);

			if (cues.length === 0) {
				throw new Error("Timed caption response did not contain usable cues");
			}

			sessions.set(context.tabId, {
				cues,
				frameId: context.frameId || 0,
				sessionId: context.sessionId,
				tabId: context.tabId,
			});
			const result = await update({ ...context, reason: "startup" });

			onDiagnostic(
				"prefetch-ready",
				`Loaded ${cues.length} timed caption cue(s); queued ${result.queued} for the initial playback window`,
				context,
			);

			return {
				available: true,
				cueCount: cues.length,
				queued: result.queued,
			};
		} catch (error) {
			sessions.delete(context.tabId);
			onDiagnostic(
				"prefetch-fallback",
				`${String(error?.message || "Timed captions unavailable")}; using visible captions`,
				context,
			);
			return unavailable;
		}
	}

	function remove(tabId) {
		return sessions.delete(tabId);
	}

	return { initialize, remove, update };
}

const api = { createYoutubeCaptionPrefetch, isTrustedYoutubeCaptionUrl };

export { createYoutubeCaptionPrefetch, isTrustedYoutubeCaptionUrl };
export default api;
