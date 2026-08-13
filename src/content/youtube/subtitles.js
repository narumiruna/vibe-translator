import Settings from "../../shared/settings.js";

const SUBTITLE_PRESENTATION = "subtitle";
const SUBTITLE_PRESENTATION_ATTR = "data-ot-presentation";
const SUBTITLE_DISPLAY_MODE_ATTR = "data-ot-subtitle-display-mode";
const SUBTITLE_FONT_SIZE_PROPERTY = "--ot-subtitle-font-size";
const SUBTITLE_REPLACED_ATTR = "data-ot-subtitle-replaced";
const SUBTITLE_SOURCE_TEXT_ATTR = "data-ot-subtitle-source-text";
const YOUTUBE_CAPTION_SEGMENT_SELECTOR = ".ytp-caption-segment";

const PLAYER_CONTROL_STATES = Object.freeze({
	active: Object.freeze({
		pressed: "true",
		state: "active",
		title: "Vibe Translator subtitle translation is active",
	}),
	error: Object.freeze({
		pressed: "false",
		state: "error",
		title: "Vibe Translator could not start. Click to try again",
	}),
	idle: Object.freeze({
		pressed: "false",
		state: "idle",
		title: "Translate subtitles with Vibe Translator",
	}),
	loading: Object.freeze({
		pressed: "false",
		state: "loading",
		title: "Starting Vibe Translator…",
	}),
});

function resolvePlayerControlState(state) {
	return {
		...(PLAYER_CONTROL_STATES[state] || PLAYER_CONTROL_STATES.idle),
	};
}

function resolvePlayerControlError(response) {
	const rawError = String(response?.error || "").trim();
	const openOptions = Boolean(response?.openOptions);
	let title = "Vibe Translator could not start. Click to try again";

	if (openOptions) {
		title = "Configure Vibe Translator, then click to try again";
	} else if (rawError) {
		title = `${rawError.replace(/\s*Click to try again\.?$/iu, "").replace(/[.!?]+$/u, "")}. Click to try again`;
	}

	return {
		openOptions,
		state: "error",
		title,
	};
}

function isSubtitleProfile(profile) {
	return profile?.presentation === SUBTITLE_PRESENTATION;
}

function cacheSubtitleTranslations(cache, translations) {
	if (!cache?.set) {
		return 0;
	}

	let cached = 0;

	for (const item of translations || []) {
		if (
			item?.kind !== "subtitle" ||
			!String(item.sourceText || "").trim() ||
			!String(item.translation || "").trim()
		) {
			continue;
		}

		cache.set(item.sourceText, item);
		cached += 1;
	}

	return cached;
}

function consumeCachedSubtitleTranslations(cache, items) {
	const cached = [];
	const missing = [];

	for (const item of items || []) {
		const cachedItem = item?.text ? cache?.get?.(item.text) : null;

		if (!cachedItem?.translation) {
			missing.push(item);
			continue;
		}

		cached.push({
			id: item.id,
			kind: "subtitle",
			sourceText: item.text,
			translation: cachedItem.translation,
		});
	}

	return { cached, missing };
}

function hasCachedSubtitleTranslation(cache, sourceTexts) {
	return (sourceTexts || []).some((sourceText) =>
		Boolean(sourceText && cache?.get?.(sourceText)?.translation),
	);
}

function findMatchingSubtitleSource(
	profile,
	sources,
	sourceText,
	getSourceText,
	excludedSources = new Set(),
) {
	if (!isSubtitleProfile(profile) || !sourceText) {
		return null;
	}

	for (const source of sources || []) {
		if (
			!source ||
			excludedSources.has(source) ||
			getSourceText?.(source) !== sourceText
		) {
			continue;
		}

		return source;
	}

	return null;
}

function getMeaningfulCharacterMinimum(profile) {
	return isSubtitleProfile(profile) ? 1 : 2;
}

function getSegmentKind(profile, fallback) {
	return isSubtitleProfile(profile) ? "subtitle" : fallback;
}

function shouldAllowAncestorTransforms(profile) {
	return isSubtitleProfile(profile);
}

function shouldKeepSessionAlive(profile) {
	return Boolean(profile?.dynamic);
}

function shouldRenderPlaceholder(profile) {
	return !isSubtitleProfile(profile);
}

function normalizeSubtitleSourceText(value) {
	return String(value || "")
		.replace(/\s+/gu, " ")
		.trim();
}

function bindSubtitleNote(profile, note, options = {}) {
	if (!isSubtitleProfile(profile) || !note) {
		return false;
	}

	note.setAttribute(
		SUBTITLE_SOURCE_TEXT_ATTR,
		normalizeSubtitleSourceText(options.sourceText),
	);
	note.setAttribute(
		SUBTITLE_DISPLAY_MODE_ATTR,
		Settings.normalizeYoutubeSubtitleDisplayMode(options.displayMode),
	);

	return true;
}

function replaceSubtitleSource(profile, source, replaced) {
	if (!isSubtitleProfile(profile) || !source) {
		return false;
	}

	if (replaced) {
		source.setAttribute?.(SUBTITLE_REPLACED_ATTR, "true");
	} else {
		source.removeAttribute?.(SUBTITLE_REPLACED_ATTR);
	}

	return true;
}

function applySubtitleDisplayMode(profile, source, displayMode) {
	if (!isSubtitleProfile(profile) || !source) {
		return false;
	}

	return replaceSubtitleSource(
		profile,
		source,
		Settings.normalizeYoutubeSubtitleDisplayMode(displayMode) ===
			"translation-only",
	);
}

function clearSubtitleSourceState(profile, element, options = {}) {
	replaceSubtitleSource(profile, element, false);

	for (const attribute of [
		options.sourceAttribute,
		options.staleAttribute,
		options.translatedAttribute,
		options.processedAttribute,
	]) {
		if (attribute) {
			element.removeAttribute?.(attribute);
		}
	}

	if (options.queuedAttribute) {
		element.setAttribute?.(options.queuedAttribute, "false");
	}
}

function resetChangedSubtitleSource(profile, options = {}) {
	if (!isSubtitleProfile(profile) || !options.element) {
		return false;
	}

	options.note?.remove?.();
	clearSubtitleSourceState(profile, options.element, options);

	return true;
}

function getSubtitleSources(node, sourceAttribute) {
	if (!node || !sourceAttribute) {
		return [];
	}

	const selector = `[${sourceAttribute}]`;
	const sources = [];

	if (node.matches?.(selector)) {
		sources.push(node);
	}

	for (const source of node.querySelectorAll?.(selector) || []) {
		sources.push(source);
	}

	return sources;
}

function removeDetachedSubtitleSources(profile, node, options = {}) {
	if (!isSubtitleProfile(profile)) {
		return 0;
	}

	let removed = 0;

	for (const source of getSubtitleSources(node, options.sourceAttribute)) {
		const id = source.getAttribute?.(options.sourceAttribute);
		const note = id ? options.findNote?.(source, id) : null;

		clearSubtitleSourceState(profile, source, options);

		if (!note) {
			continue;
		}

		note.remove?.();
		removed += 1;
	}

	return removed;
}

function reconcileSubtitleNotes(profile, options = {}) {
	if (!isSubtitleProfile(profile)) {
		return 0;
	}

	let removed = 0;

	for (const note of options.notes || []) {
		const id = note.getAttribute?.(options.noteAttribute);
		const source = id ? options.findSource?.(id) : null;
		const sourceSnapshot = normalizeSubtitleSourceText(
			note.getAttribute?.(SUBTITLE_SOURCE_TEXT_ATTR),
		);
		const currentSourceText = normalizeSubtitleSourceText(
			source ? options.getSourceText?.(source) : "",
		);

		if (source && sourceSnapshot && sourceSnapshot === currentSourceText) {
			applySubtitleDisplayMode(
				profile,
				source,
				note.getAttribute?.(SUBTITLE_DISPLAY_MODE_ATTR),
			);
			continue;
		}

		if (source) {
			clearSubtitleSourceState(profile, source, options);
		}
		note.remove?.();
		removed += 1;
	}

	return removed;
}

function normalizeCaptionFontSize(value) {
	const match = /^(\d+(?:\.\d+)?)px$/u.exec(String(value || "").trim());

	if (!match) {
		return "";
	}

	const size = Number(match[1]);

	return size >= 8 && size <= 96 ? `${size}px` : "";
}

function prepareSubtitleNote(profile, note, source, getComputedStyle) {
	if (!isSubtitleProfile(profile) || !note) {
		return false;
	}

	note.setAttribute(SUBTITLE_PRESENTATION_ATTR, SUBTITLE_PRESENTATION);

	const captionSegment = source?.matches?.(YOUTUBE_CAPTION_SEGMENT_SELECTOR)
		? source
		: source?.querySelector?.(YOUTUBE_CAPTION_SEGMENT_SELECTOR) || source;
	const fontSize = normalizeCaptionFontSize(
		getComputedStyle?.(captionSegment)?.fontSize,
	);

	if (fontSize) {
		note.style?.setProperty?.(SUBTITLE_FONT_SIZE_PROPERTY, fontSize);
	}

	return true;
}

const api = {
	applySubtitleDisplayMode,
	bindSubtitleNote,
	cacheSubtitleTranslations,
	consumeCachedSubtitleTranslations,
	hasCachedSubtitleTranslation,
	SUBTITLE_DISPLAY_MODE_ATTR,
	SUBTITLE_FONT_SIZE_PROPERTY,
	SUBTITLE_PRESENTATION,
	SUBTITLE_PRESENTATION_ATTR,
	SUBTITLE_REPLACED_ATTR,
	SUBTITLE_SOURCE_TEXT_ATTR,
	YOUTUBE_CAPTION_SEGMENT_SELECTOR,
	findMatchingSubtitleSource,
	getMeaningfulCharacterMinimum,
	getSegmentKind,
	isSubtitleProfile,
	normalizeCaptionFontSize,
	prepareSubtitleNote,
	reconcileSubtitleNotes,
	removeDetachedSubtitleSources,
	replaceSubtitleSource,
	resetChangedSubtitleSource,
	resolvePlayerControlError,
	resolvePlayerControlState,
	shouldAllowAncestorTransforms,
	shouldKeepSessionAlive,
	shouldRenderPlaceholder,
};

export {
	applySubtitleDisplayMode,
	bindSubtitleNote,
	cacheSubtitleTranslations,
	consumeCachedSubtitleTranslations,
	findMatchingSubtitleSource,
	getMeaningfulCharacterMinimum,
	getSegmentKind,
	hasCachedSubtitleTranslation,
	isSubtitleProfile,
	normalizeCaptionFontSize,
	prepareSubtitleNote,
	reconcileSubtitleNotes,
	removeDetachedSubtitleSources,
	replaceSubtitleSource,
	resetChangedSubtitleSource,
	resolvePlayerControlError,
	resolvePlayerControlState,
	SUBTITLE_DISPLAY_MODE_ATTR,
	SUBTITLE_FONT_SIZE_PROPERTY,
	SUBTITLE_PRESENTATION,
	SUBTITLE_PRESENTATION_ATTR,
	SUBTITLE_REPLACED_ATTR,
	SUBTITLE_SOURCE_TEXT_ATTR,
	shouldAllowAncestorTransforms,
	shouldKeepSessionAlive,
	shouldRenderPlaceholder,
	YOUTUBE_CAPTION_SEGMENT_SELECTOR,
};
export default api;
