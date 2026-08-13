import assert from "node:assert/strict";
import test from "node:test";

import {
	createPageObserver,
	isSubtitleRelatedMutation,
} from "../src/content/page/observer.js";

function createElement(options = {}) {
	return {
		nodeType: 1,
		matches(selector) {
			return options.matches === selector;
		},
		closest(selector) {
			return options.closest === selector ? {} : null;
		},
		querySelector(selector) {
			return options.descendant === selector ? {} : null;
		},
	};
}

const Node = { ELEMENT_NODE: 1 };
const selector = ".ytp-caption-segment";

test("subtitle observer accepts only mutations involving caption segments", () => {
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: createElement(),
				addedNodes: [createElement({ matches: selector })],
				removedNodes: [],
			},
			{ Node, selector },
		),
		true,
	);
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: {
					nodeType: 3,
					parentElement: createElement({ closest: selector }),
				},
				addedNodes: [],
				removedNodes: [],
			},
			{ Node, selector },
		),
		true,
	);
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: createElement({ descendant: selector }),
				addedNodes: [createElement()],
				removedNodes: [],
			},
			{ Node, selector },
		),
		false,
	);
});

test("subtitle removals reconcile exact notes before translation is scheduled", () => {
	const events = [];
	const timers = [];
	let handleMutations;
	const body = {};
	const removedSource = createElement({ matches: selector });
	const observer = createPageObserver({
		MutationObserver: function MutationObserver(callback) {
			handleMutations = callback;
			return {
				disconnect() {},
				observe() {},
			};
		},
		Node,
		SubtitleApi: {
			YOUTUBE_CAPTION_SEGMENT_SELECTOR: selector,
			isSubtitleProfile() {
				return true;
			},
			reconcileSubtitleNotes() {
				events.push("reconcile");
			},
			removeDetachedSubtitleSources(_profile, source) {
				assert.equal(source, removedSource);
				events.push("remove");
			},
			resetChangedSubtitleSource() {
				return false;
			},
		},
		activeSiteProfile: {},
		contentLifecycle: {
			cleanup() {},
			start() {},
		},
		document: {
			body,
			querySelectorAll() {
				return [];
			},
		},
		getExistingNoteForSource() {
			return null;
		},
		getSourceText() {
			return "";
		},
		hasSourceTextChanged() {
			return false;
		},
		isInsideTranslation() {
			return false;
		},
		noteAttr: "data-ot-note-id",
		onScheduleVisibleTranslation() {
			events.push("schedule");
		},
		observerDebounceMs: 0,
		processedAttr: "data-translated",
		queuedAttr: "data-ot-queued",
		rootAttr: "data-ot-role",
		setSourceQueued() {},
		sourceAttr: "data-ot-source-id",
		staleAttr: "data-ot-source-stale",
		translatedAttr: "data-ot-translated",
		window: {
			clearTimeout() {},
			setTimeout(callback) {
				timers.push(callback);
				return timers.length;
			},
		},
	});

	observer.ensureObserver();
	handleMutations([
		{
			addedNodes: [],
			removedNodes: [removedSource],
			target: createElement(),
			type: "childList",
		},
	]);

	assert.deepEqual(events, ["remove", "reconcile", "schedule"]);
	assert.equal(timers.length, 0);
});

test("subtitle text changes reset the source before translation is scheduled", () => {
	const events = [];
	const timers = [];
	let handleMutations;
	const body = {};
	const source = {
		nodeType: Node.ELEMENT_NODE,
		closest(value) {
			return value === selector || value === "[data-ot-source-id]"
				? source
				: null;
		},
		getAttribute(name) {
			return name === "data-ot-source-id" ? "ot-1" : null;
		},
		matches(value) {
			return value === selector;
		},
	};
	const observer = createPageObserver({
		MutationObserver: function MutationObserver(callback) {
			handleMutations = callback;
			return {
				disconnect() {},
				observe() {},
			};
		},
		Node,
		SubtitleApi: {
			YOUTUBE_CAPTION_SEGMENT_SELECTOR: selector,
			isSubtitleProfile() {
				return true;
			},
			removeDetachedSubtitleSources() {},
			resetChangedSubtitleSource() {
				events.push("reset");
				return true;
			},
		},
		activeSiteProfile: {},
		contentLifecycle: {
			cleanup() {},
			start() {},
		},
		document: { body },
		getExistingNoteForSource() {
			return null;
		},
		hasSourceTextChanged() {
			return true;
		},
		isInsideTranslation() {
			return false;
		},
		onScheduleVisibleTranslation() {
			events.push("schedule");
		},
		observerDebounceMs: 0,
		processedAttr: "data-translated",
		queuedAttr: "data-ot-queued",
		rootAttr: "data-ot-role",
		setSourceQueued() {},
		sourceAttr: "data-ot-source-id",
		staleAttr: "data-ot-source-stale",
		translatedAttr: "data-ot-translated",
		window: {
			clearTimeout() {},
			setTimeout(callback) {
				timers.push(callback);
				return timers.length;
			},
		},
	});

	observer.ensureObserver();
	handleMutations([
		{
			addedNodes: [],
			removedNodes: [],
			target: { nodeType: 3, parentElement: source },
			type: "characterData",
		},
	]);

	assert.deepEqual(events, ["reset", "schedule"]);
	assert.equal(timers.length, 0);
});
