const test = require("node:test");
const assert = require("node:assert/strict");

const {
	getSelectionPanelWidth,
	normalizeSelectionAnchorRect,
	normalizeSelectionPanelPositionMode,
} = require("../content-selection-panel.js");

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
});
