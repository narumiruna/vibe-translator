const test = require("node:test");
const assert = require("node:assert/strict");

const {
	getMeaningfulCharacterMinimum,
	getSegmentKind,
	isSubtitleProfile,
	prepareSubtitleNote,
	replaceSubtitleSource,
	resolvePlayerControlError,
	resolvePlayerControlState,
	removeDetachedSubtitleSources,
	resetChangedSubtitleSource,
	shouldAllowAncestorTransforms,
	shouldKeepSessionAlive,
	shouldRenderPlaceholder,
} = require("../src/content-subtitles.js");
const { resolveSiteProfile } = require("../src/content-site-profiles.js");

const youtubeProfile = resolveSiteProfile("www.youtube.com");
const defaultProfile = resolveSiteProfile("example.com");

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

test("translated subtitles replace the visible native caption", () => {
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
