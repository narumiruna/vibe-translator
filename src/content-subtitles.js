((root) => {
	const SUBTITLE_PRESENTATION = "subtitle";
	const SUBTITLE_PRESENTATION_ATTR = "data-ot-presentation";
	const SUBTITLE_FONT_SIZE_PROPERTY = "--ot-subtitle-font-size";
	const SUBTITLE_REPLACED_ATTR = "data-ot-subtitle-replaced";
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

	function resetChangedSubtitleSource(profile, options = {}) {
		if (!isSubtitleProfile(profile) || !options.element) {
			return false;
		}

		options.note?.remove?.();
		replaceSubtitleSource(profile, options.element, false);

		for (const attribute of [
			options.sourceAttribute,
			options.staleAttribute,
			options.translatedAttribute,
			options.processedAttribute,
		]) {
			if (attribute) {
				options.element.removeAttribute(attribute);
			}
		}

		if (options.queuedAttribute) {
			options.element.setAttribute(options.queuedAttribute, "false");
		}

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

			replaceSubtitleSource(profile, source, false);
			const note = id ? options.findNote?.(source, id) : null;

			for (const attribute of [
				options.sourceAttribute,
				options.staleAttribute,
				options.translatedAttribute,
				options.processedAttribute,
			]) {
				if (attribute) {
					source.removeAttribute?.(attribute);
				}
			}

			if (options.queuedAttribute) {
				source.setAttribute?.(options.queuedAttribute, "false");
			}

			if (!note) {
				continue;
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

		const captionSegment =
			source?.querySelector?.(YOUTUBE_CAPTION_SEGMENT_SELECTOR) || source;
		const fontSize = normalizeCaptionFontSize(
			getComputedStyle?.(captionSegment)?.fontSize,
		);

		if (fontSize) {
			note.style?.setProperty?.(SUBTITLE_FONT_SIZE_PROPERTY, fontSize);
		}

		return true;
	}

	const api = {
		SUBTITLE_FONT_SIZE_PROPERTY,
		SUBTITLE_PRESENTATION,
		SUBTITLE_PRESENTATION_ATTR,
		SUBTITLE_REPLACED_ATTR,
		YOUTUBE_CAPTION_SEGMENT_SELECTOR,
		getMeaningfulCharacterMinimum,
		getSegmentKind,
		isSubtitleProfile,
		normalizeCaptionFontSize,
		prepareSubtitleNote,
		removeDetachedSubtitleSources,
		replaceSubtitleSource,
		resetChangedSubtitleSource,
		resolvePlayerControlError,
		resolvePlayerControlState,
		shouldAllowAncestorTransforms,
		shouldKeepSessionAlive,
		shouldRenderPlaceholder,
	};

	root.TranslatorContentSubtitles = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
