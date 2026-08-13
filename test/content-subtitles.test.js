import assert from "node:assert/strict";
import test from "node:test";
import { resolveSiteProfile } from "../src/content/extraction/site-profiles.js";
import {
	applySubtitleDisplayMode,
	bindSubtitleNote,
	cacheSubtitleTranslations,
	consumeCachedSubtitleTranslations,
	findMatchingSubtitleSource,
	getMeaningfulCharacterMinimum,
	getSegmentKind,
	hasCachedSubtitleTranslation,
	isSubtitleProfile,
	prepareSubtitleNote,
	reconcileSubtitleNotes,
	removeDetachedSubtitleSources,
	replaceSubtitleSource,
	resetChangedSubtitleSource,
	resolvePlayerControlError,
	resolvePlayerControlState,
	SUBTITLE_DISPLAY_MODE_ATTR,
	SUBTITLE_SOURCE_TEXT_ATTR,
	shouldAllowAncestorTransforms,
	shouldKeepSessionAlive,
	shouldRenderPlaceholder,
} from "../src/content/youtube/subtitles.js";

const youtubeProfile = resolveSiteProfile("www.youtube.com");
const defaultProfile = resolveSiteProfile("example.com");

test("prefetched subtitle translations are consumed by exact source text", () => {
	const cache = new Map();

	cacheSubtitleTranslations(cache, [
		{ kind: "subtitle", sourceText: "Hello world", translation: "哈囉世界" },
		{ kind: "subtitle", sourceText: "Later", translation: "稍後" },
	]);

	assert.deepEqual(
		consumeCachedSubtitleTranslations(cache, [
			{ id: "visible-1", kind: "subtitle", text: "Hello world" },
			{ id: "visible-2", kind: "subtitle", text: "Unknown" },
		]),
		{
			cached: [
				{
					id: "visible-1",
					kind: "subtitle",
					sourceText: "Hello world",
					translation: "哈囉世界",
				},
			],
			missing: [{ id: "visible-2", kind: "subtitle", text: "Unknown" }],
		},
	);
	assert.equal(cache.get("Hello world").translation, "哈囉世界");
	assert.equal(cache.get("Later").translation, "稍後");
	assert.equal(
		hasCachedSubtitleTranslation(cache, ["Unknown", "Hello world"]),
		true,
	);
	assert.equal(hasCachedSubtitleTranslation(cache, ["Unknown"]), false);
});

test("subtitle cache ignores empty and unrelated translation results", () => {
	const cache = new Map();

	assert.equal(
		cacheSubtitleTranslations(cache, [
			{ kind: "paragraph", sourceText: "Paragraph", translation: "段落" },
			{ kind: "subtitle", sourceText: "", translation: "空" },
			{ kind: "subtitle", sourceText: "Caption", translation: "" },
		]),
		0,
	);
	assert.equal(cache.size, 0);
});

test("player control state exposes stable accessible labels", () => {
	assert.deepEqual(resolvePlayerControlState("idle"), {
		pressed: "false",
		state: "idle",
		title: "Translate subtitles with Vibe Translator",
	});
	assert.deepEqual(resolvePlayerControlState("loading"), {
		pressed: "false",
		state: "loading",
		title: "Starting Vibe Translator…",
	});
	assert.deepEqual(resolvePlayerControlState("active"), {
		pressed: "true",
		state: "active",
		title: "Vibe Translator subtitle translation is active",
	});
	assert.deepEqual(resolvePlayerControlState("error"), {
		pressed: "false",
		state: "error",
		title: "Vibe Translator could not start. Click to try again",
	});
});

test("player control surfaces runtime failures and settings recovery", () => {
	assert.deepEqual(resolvePlayerControlError({}), {
		openOptions: false,
		state: "error",
		title: "Vibe Translator could not start. Click to try again",
	});
	assert.deepEqual(
		resolvePlayerControlError({
			error: "Settings are incomplete. Configure the extension first.",
			openOptions: true,
		}),
		{
			openOptions: true,
			state: "error",
			title: "Configure Vibe Translator, then click to try again",
		},
	);
	assert.deepEqual(
		resolvePlayerControlError({ error: "API permission was denied." }),
		{
			openOptions: false,
			state: "error",
			title: "API permission was denied. Click to try again",
		},
	);
});

test("YouTube uses the compact persistent subtitle behavior", () => {
	assert.equal(isSubtitleProfile(youtubeProfile), true);
	assert.equal(getMeaningfulCharacterMinimum(youtubeProfile), 1);
	assert.equal(getSegmentKind(youtubeProfile, "paragraph"), "subtitle");
	assert.equal(shouldAllowAncestorTransforms(youtubeProfile), true);
	assert.equal(shouldKeepSessionAlive(youtubeProfile), true);
	assert.equal(shouldRenderPlaceholder(youtubeProfile), false);
});

test("ordinary pages preserve inline reading-card behavior", () => {
	assert.equal(isSubtitleProfile(defaultProfile), false);
	assert.equal(getMeaningfulCharacterMinimum(defaultProfile), 2);
	assert.equal(getSegmentKind(defaultProfile, "heading"), "heading");
	assert.equal(shouldAllowAncestorTransforms(defaultProfile), false);
	assert.equal(shouldKeepSessionAlive(defaultProfile), false);
	assert.equal(shouldRenderPlaceholder(defaultProfile), true);
});

test("changed subtitle cues drop stale identity and rendered text", () => {
	const attributes = new Map([
		["data-ot-source-id", "ot-3"],
		["data-ot-source-stale", "true"],
		["data-ot-translated", "true"],
		["data-translated", "true"],
		["data-ot-queued", "true"],
	]);
	let noteRemoved = false;
	const element = {
		removeAttribute(name) {
			attributes.delete(name);
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	};
	const note = {
		remove() {
			noteRemoved = true;
		},
	};

	assert.equal(
		resetChangedSubtitleSource(youtubeProfile, {
			element,
			note,
			processedAttribute: "data-translated",
			queuedAttribute: "data-ot-queued",
			sourceAttribute: "data-ot-source-id",
			staleAttribute: "data-ot-source-stale",
			translatedAttribute: "data-ot-translated",
		}),
		true,
	);
	assert.equal(noteRemoved, true);
	assert.equal(attributes.has("data-ot-source-id"), false);
	assert.equal(attributes.has("data-ot-source-stale"), false);
	assert.equal(attributes.has("data-ot-translated"), false);
	assert.equal(attributes.has("data-translated"), false);
	assert.equal(attributes.get("data-ot-queued"), "false");
});

test("detached subtitle sources remove notes left behind by native cue replacement", () => {
	let noteRemoved = false;
	const attributes = new Map([
		["data-ot-source-id", "ot-9"],
		["data-ot-source-stale", "true"],
		["data-ot-translated", "true"],
		["data-translated", "true"],
		["data-ot-queued", "true"],
	]);
	const source = {
		getAttribute(name) {
			return attributes.get(name) || null;
		},
		removeAttribute(name) {
			attributes.delete(name);
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
		matches(selector) {
			return selector === "[data-ot-source-id]";
		},
		querySelectorAll() {
			return [];
		},
	};

	assert.equal(
		removeDetachedSubtitleSources(youtubeProfile, source, {
			findNote(candidate, id) {
				assert.equal(candidate, source);
				assert.equal(id, "ot-9");
				return {
					remove() {
						noteRemoved = true;
					},
				};
			},
			processedAttribute: "data-translated",
			queuedAttribute: "data-ot-queued",
			sourceAttribute: "data-ot-source-id",
			staleAttribute: "data-ot-source-stale",
			translatedAttribute: "data-ot-translated",
		}),
		1,
	);
	assert.equal(noteRemoved, true);
	assert.equal(attributes.has("data-ot-source-id"), false);
	assert.equal(attributes.has("data-ot-source-stale"), false);
	assert.equal(attributes.has("data-ot-translated"), false);
	assert.equal(attributes.has("data-translated"), false);
	assert.equal(attributes.get("data-ot-queued"), "false");
	assert.equal(
		removeDetachedSubtitleSources(defaultProfile, source, {
			findNote() {},
			sourceAttribute: "data-ot-source-id",
		}),
		0,
	);
});

test("detached subtitle results rebind only to an identical visible source", () => {
	const oldSource = { text: "Old cue" };
	const matchingSource = { text: "Current cue" };
	const otherSource = { text: "Other cue" };

	assert.equal(
		findMatchingSubtitleSource(
			youtubeProfile,
			[oldSource, matchingSource, otherSource],
			"Current cue",
			(source) => source.text,
			new Set([oldSource]),
		),
		matchingSource,
	);
	assert.equal(
		findMatchingSubtitleSource(
			youtubeProfile,
			[oldSource, otherSource],
			"Current cue",
			(source) => source.text,
		),
		null,
	);
	assert.equal(
		findMatchingSubtitleSource(
			defaultProfile,
			[matchingSource],
			"Current cue",
			(source) => source.text,
		),
		null,
	);
});

test("subtitle display modes change only the bound native segment", () => {
	const firstAttributes = new Map();
	const secondAttributes = new Map();
	const noteAttributes = new Map();
	const createSource = (attributes) => ({
		removeAttribute(name) {
			attributes.delete(name);
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	});
	const firstSource = createSource(firstAttributes);
	const secondSource = createSource(secondAttributes);
	const note = {
		setAttribute(name, value) {
			noteAttributes.set(name, value);
		},
	};

	assert.equal(
		bindSubtitleNote(youtubeProfile, note, {
			displayMode: "bilingual",
			sourceText: "  Hello   world  ",
		}),
		true,
	);
	assert.equal(noteAttributes.get(SUBTITLE_SOURCE_TEXT_ATTR), "Hello world");
	assert.equal(noteAttributes.get(SUBTITLE_DISPLAY_MODE_ATTR), "bilingual");
	assert.equal(
		applySubtitleDisplayMode(youtubeProfile, firstSource, "bilingual"),
		true,
	);
	assert.equal(firstAttributes.has("data-ot-subtitle-replaced"), false);

	bindSubtitleNote(youtubeProfile, note, {
		displayMode: "translation-only",
		sourceText: "Hello world",
	});
	assert.equal(
		applySubtitleDisplayMode(youtubeProfile, firstSource, "translation-only"),
		true,
	);
	assert.equal(firstAttributes.get("data-ot-subtitle-replaced"), "true");
	assert.equal(secondAttributes.has("data-ot-subtitle-replaced"), false);
	assert.equal(
		applySubtitleDisplayMode(defaultProfile, secondSource, "translation-only"),
		false,
	);
});

test("subtitle reconciliation removes notes whose exact source changed or disappeared", () => {
	const matchingSource = {
		attributes: new Map([["data-ot-source-id", "ot-1"]]),
		text: "First cue",
		removeAttribute(name) {
			this.attributes.delete(name);
		},
		setAttribute(name, value) {
			this.attributes.set(name, value);
		},
	};
	const changedSource = {
		attributes: new Map([["data-ot-source-id", "ot-2"]]),
		text: "New second cue",
		removeAttribute(name) {
			this.attributes.delete(name);
		},
		setAttribute(name, value) {
			this.attributes.set(name, value);
		},
	};
	const sources = new Map([
		["ot-1", matchingSource],
		["ot-2", changedSource],
	]);
	function createNote(id, sourceText, displayMode) {
		const attributes = new Map([
			["data-ot-note-id", id],
			[SUBTITLE_SOURCE_TEXT_ATTR, sourceText],
			[SUBTITLE_DISPLAY_MODE_ATTR, displayMode],
		]);

		return {
			attributes,
			removed: false,
			getAttribute(name) {
				return attributes.get(name) || null;
			},
			remove() {
				this.removed = true;
			},
		};
	}
	const matchingNote = createNote("ot-1", "First cue", "bilingual");
	const changedNote = createNote(
		"ot-2",
		"Previous second cue",
		"translation-only",
	);
	const detachedNote = createNote("ot-3", "Detached cue", "translation-only");

	assert.equal(
		reconcileSubtitleNotes(youtubeProfile, {
			findSource: (id) => sources.get(id) || null,
			getSourceText: (source) => source.text,
			noteAttribute: "data-ot-note-id",
			notes: [matchingNote, changedNote, detachedNote],
			processedAttribute: "data-translated",
			queuedAttribute: "data-ot-queued",
			sourceAttribute: "data-ot-source-id",
			staleAttribute: "data-ot-source-stale",
			translatedAttribute: "data-ot-translated",
		}),
		2,
	);
	assert.equal(matchingNote.removed, false);
	assert.equal(changedNote.removed, true);
	assert.equal(detachedNote.removed, true);
	assert.equal(changedSource.attributes.has("data-ot-source-id"), false);
	assert.equal(changedSource.attributes.get("data-ot-queued"), "false");
});

test("translated subtitles can still explicitly clear native replacement state", () => {
	const attributes = new Map();
	const source = {
		removeAttribute(name) {
			attributes.delete(name);
		},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	};

	assert.equal(replaceSubtitleSource(youtubeProfile, source, true), true);
	assert.equal(attributes.get("data-ot-subtitle-replaced"), "true");
	assert.equal(replaceSubtitleSource(youtubeProfile, source, false), true);
	assert.equal(attributes.has("data-ot-subtitle-replaced"), false);
	assert.equal(replaceSubtitleSource(defaultProfile, source, true), false);
});

test("subtitle notes inherit size when the source is the caption segment", () => {
	const properties = new Map();
	const source = {
		matches(selector) {
			return selector === ".ytp-caption-segment";
		},
	};
	const note = {
		setAttribute() {},
		style: {
			setProperty(name, value) {
				properties.set(name, value);
			},
		},
	};

	assert.equal(
		prepareSubtitleNote(youtubeProfile, note, source, (element) => {
			assert.equal(element, source);
			return { fontSize: "26px" };
		}),
		true,
	);
	assert.equal(properties.get("--ot-subtitle-font-size"), "26px");
});

test("subtitle notes inherit the native caption segment size", () => {
	const properties = new Map();
	const segment = {};
	const source = {
		querySelector(selector) {
			return selector === ".ytp-caption-segment" ? segment : null;
		},
	};
	const note = {
		attributes: new Map(),
		setAttribute(name, value) {
			this.attributes.set(name, value);
		},
		style: {
			setProperty(name, value) {
				properties.set(name, value);
			},
		},
	};

	assert.equal(
		prepareSubtitleNote(youtubeProfile, note, source, () => ({
			fontSize: "24px",
		})),
		true,
	);
	assert.equal(note.attributes.get("data-ot-presentation"), "subtitle");
	assert.equal(properties.get("--ot-subtitle-font-size"), "24px");
});
