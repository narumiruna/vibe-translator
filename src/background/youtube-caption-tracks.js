const TRACK_SOURCES = Object.freeze([
	["initial-response", "initialResponse"],
	["player-response", "playerResponse"],
	["player-option", "playerOption"],
]);

function normalizeTracks(value) {
	return Array.isArray(value)
		? value.filter((track) => track && typeof track === "object")
		: [];
}

function isCurrentSource(source, currentVideoId) {
	const sourceVideoId = String(source?.videoId || "");
	const currentId = String(currentVideoId || "");

	return !sourceVideoId || !currentId || sourceVideoId === currentId;
}

function matchesSelectedTrack(track, selectedTrack) {
	const selectedLanguage = String(selectedTrack?.languageCode || "");
	const selectedKind = String(selectedTrack?.kind || "");

	if (
		!selectedLanguage ||
		String(track?.languageCode || "") !== selectedLanguage
	) {
		return false;
	}

	return !selectedKind || String(track?.kind || "") === selectedKind;
}

function resolveYoutubeCaptionTracks(input = {}) {
	const sources = TRACK_SOURCES.map(([label, key]) => ({
		label,
		tracks: isCurrentSource(input[key], input.currentVideoId)
			? normalizeTracks(input[key]?.tracks)
			: [],
	}));
	const selectedTrack = input.selectedTrack;
	let resolvedSource = null;
	let timedTrack = null;

	if (selectedTrack) {
		for (const source of sources) {
			const selected = source.tracks.find(
				(track) => track.baseUrl && matchesSelectedTrack(track, selectedTrack),
			);

			if (selected) {
				resolvedSource = source;
				timedTrack = selected;
				break;
			}
		}
	}

	if (!timedTrack) {
		for (const source of sources) {
			const candidate = source.tracks.find((track) => track.baseUrl);

			if (candidate) {
				resolvedSource = source;
				timedTrack = candidate;
				break;
			}
		}
	}

	resolvedSource ||= sources.find((source) => source.tracks.length > 0) || null;

	return {
		hasTrack: Boolean(resolvedSource),
		trackBaseUrl: String(timedTrack?.baseUrl || ""),
		trackCount: resolvedSource?.tracks.length || 0,
		trackSource: resolvedSource?.label || "none",
		timedTrackAvailable: Boolean(timedTrack),
	};
}

const api = { resolveYoutubeCaptionTracks };

export { resolveYoutubeCaptionTracks };
export default api;
