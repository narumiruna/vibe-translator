const test = require("node:test");
const assert = require("node:assert/strict");

const {
	createSelectionPanelRenderer,
	getSelectionPanelWidth,
	normalizeSelectionAnchorRect,
	normalizeSelectionPanelPositionMode,
	shouldCloseSelectionPanelOnKey,
} = require("../src/content-selection-panel.js");

test("normalizeSelectionPanelPositionMode falls back to near-selection", () => {
	assert.equal(
		normalizeSelectionPanelPositionMode("bottom-right"),
		"bottom-right",
	);
	assert.equal(
		normalizeSelectionPanelPositionMode(" NEAR-SELECTION "),
		"near-selection",
	);
	assert.equal(
		normalizeSelectionPanelPositionMode("unknown"),
		"near-selection",
	);
});

test("normalizeSelectionAnchorRect requires finite rectangle values", () => {
	assert.deepEqual(
		normalizeSelectionAnchorRect({
			top: "10",
			right: 90,
			bottom: 30,
			left: 20,
			width: 70,
			height: 20,
		}),
		{
			top: 10,
			right: 90,
			bottom: 30,
			left: 20,
			width: 70,
			height: 20,
		},
	);
	assert.equal(normalizeSelectionAnchorRect(null), null);
	assert.equal(
		normalizeSelectionAnchorRect({
			top: 10,
			right: Number.NaN,
			bottom: 30,
			left: 20,
			width: 70,
			height: 20,
		}),
		null,
	);
});

test("getSelectionPanelWidth keeps compact and expanded widths within viewport margins", () => {
	assert.equal(getSelectionPanelWidth(1024, false), 280);
	assert.equal(getSelectionPanelWidth(1024, true), 420);
	assert.equal(getSelectionPanelWidth(300, true), 276);
	assert.equal(getSelectionPanelWidth(1024, false, 360), 360);
	assert.equal(getSelectionPanelWidth(1024, true, 360), 420);
	assert.equal(getSelectionPanelWidth(1024, false, 480), 480);
	assert.equal(getSelectionPanelWidth(1024, true, 480), 480);
});

test("shouldCloseSelectionPanelOnKey only accepts plain Escape", () => {
	assert.equal(shouldCloseSelectionPanelOnKey({ key: "Escape" }), true);
	assert.equal(
		shouldCloseSelectionPanelOnKey({ key: "Escape", defaultPrevented: true }),
		false,
	);
	assert.equal(
		shouldCloseSelectionPanelOnKey({ key: "Escape", isComposing: true }),
		false,
	);
	assert.equal(shouldCloseSelectionPanelOnKey({ key: "Enter" }), false);
	assert.equal(shouldCloseSelectionPanelOnKey(null), false);
});

test("selection panel renderer close reports cleared panels", () => {
	let removed = false;
	const panel = {
		remove() {
			removed = true;
		},
	};
	const renderer = createSelectionPanelRenderer({
		document: {
			querySelector(selector) {
				return selector === '[data-ot-role="selection-panel"]'
					? panel
					: null;
			},
		},
		window: {},
		withObserverPaused(callback) {
			return callback();
		},
	});

	assert.deepEqual(renderer.close(), { cleared: 1 });
	assert.equal(removed, true);
});

test("selection panel renderer measures reused content in collapsed state", () => {
	let measuredExpandedState = "";
	const attributes = {
		"data-expanded": "true",
	};
	const title = {};
	const expandButton = {
		hidden: true,
		setAttribute(name, value) {
			this[name] = value;
		},
		textContent: "",
	};
	const body = {
		_textContent: "",
		clientWidth: 180,
		get clientHeight() {
			measuredExpandedState = attributes["data-expanded"];
			return 80;
		},
		querySelectorAll() {
			return [];
		},
		replaceChildren() {
			this._textContent = "";
		},
		scrollHeight: 160,
		scrollWidth: 180,
		setAttribute() {},
		get textContent() {
			return this._textContent;
		},
		set textContent(value) {
			this._textContent = value;
		},
	};
	const panel = {
		offsetHeight: 120,
		offsetWidth: 280,
		querySelector(selector) {
			if (selector === '[data-ot-role="selection-panel-title"]') {
				return title;
			}

			if (selector === '[data-ot-role="selection-panel-body"]') {
				return body;
			}

			if (selector === '[data-ot-role="selection-panel-expand"]') {
				return expandButton;
			}

			return null;
		},
		setAttribute(name, value) {
			attributes[name] = value;
		},
		style: {},
	};
	const renderer = createSelectionPanelRenderer({
		appendFormattedText(container, text) {
			container.textContent = text;
		},
		document: {
			documentElement: { clientHeight: 600, clientWidth: 800 },
			querySelector(selector) {
				return selector === '[data-ot-role="selection-panel"]'
					? panel
					: null;
			},
		},
		window: { innerHeight: 600, innerWidth: 800 },
		withObserverPaused(callback) {
			return callback();
		},
	});

	renderer.update({
		pending: false,
		selectionPanelPositionMode: "bottom-right",
		targetLanguage: "日本語",
		translation: "Short text that overflows only in compact mode.",
	});

	assert.equal(measuredExpandedState, "false");
	assert.equal(expandButton.hidden, false);
});
