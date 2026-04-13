const test = require("node:test");
const assert = require("node:assert/strict");

const originalWindow = global.window;
const originalDocument = global.document;
const originalChrome = global.chrome;

global.window = {
	__OPENAI_TRANSLATOR_CONTENT__: false,
	clearTimeout,
	getComputedStyle() {
		return {
			visibility: "visible",
			display: "block",
		};
	},
	setTimeout,
};
global.document = {
	querySelectorAll() {
		return [];
	},
};
global.chrome = {
	runtime: {
		onMessage: {
			addListener() {},
		},
	},
};

const {
	isHeadingLikeElement,
	isUnsupportedElement,
	scoreCandidateBlock,
} = require("../content.js");

function splitSelector(selector) {
	return String(selector)
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function createFakeElement(options = {}) {
	const matchedSelectors = new Set(options.matchedSelectors || []);
	const ancestorSelectors = new Set(options.ancestorSelectors || []);
	const linkTexts = options.linkTexts || [];
	const interactiveCount = options.interactiveCount || 0;
	const directBlockChildCount = options.directBlockChildCount || 0;

	return {
		tagName: options.tagName || "DIV",
		children: Array.from({ length: directBlockChildCount }, () => ({
			matches(selector) {
				return splitSelector(selector).includes("div");
			},
		})),
		closest(selector) {
			return splitSelector(selector).some((part) => ancestorSelectors.has(part))
				? {}
				: null;
		},
		matches(selector) {
			return splitSelector(selector).some((part) => matchedSelectors.has(part));
		},
		querySelectorAll(selector) {
			if (selector === "a") {
				return linkTexts.map((text) => ({ textContent: text }));
			}

			if (selector.includes('[role="button"]')) {
				return Array.from({ length: interactiveCount }, () => ({}));
			}

			return [];
		},
	};
}

test("headline-like selectors are treated as headings", () => {
	assert.equal(
		isHeadingLikeElement(
			createFakeElement({
				matchedSelectors: [".gs-c-promo-heading"],
				tagName: "A",
			}),
		),
		true,
	);

	assert.equal(
		isHeadingLikeElement(
			createFakeElement({
				matchedSelectors: ['[role="heading"]'],
			}),
		),
		true,
	);
});

test("content inside article headers is no longer treated as unsupported", () => {
	assert.equal(
		isUnsupportedElement(
			createFakeElement({
				ancestorSelectors: ["header"],
				matchedSelectors: ["h1"],
				tagName: "H1",
			}),
		),
		false,
	);

	assert.equal(
		isUnsupportedElement(
			createFakeElement({
				ancestorSelectors: [".share"],
				matchedSelectors: ["p"],
				tagName: "P",
			}),
		),
		true,
	);
});

test("heading candidates score above equivalent non-heading link blocks", () => {
	const heading = createFakeElement({
		interactiveCount: 1,
		linkTexts: ["Breaking news headline"],
		matchedSelectors: ["h2"],
		tagName: "H2",
	});
	const nonHeading = createFakeElement({
		interactiveCount: 1,
		linkTexts: ["Breaking news headline"],
		matchedSelectors: ["div"],
		tagName: "DIV",
	});

	assert.ok(
		scoreCandidateBlock(heading, "Breaking news headline") >
			scoreCandidateBlock(nonHeading, "Breaking news headline"),
	);
});

test("plain heading blocks keep a positive heading bonus", () => {
	const heading = createFakeElement({
		matchedSelectors: ["h2"],
		tagName: "H2",
	});
	const nonHeading = createFakeElement({
		matchedSelectors: ["div"],
		tagName: "DIV",
	});

	assert.ok(
		scoreCandidateBlock(heading, "Section title") >
			scoreCandidateBlock(nonHeading, "Section title"),
	);
});

test.after(() => {
	global.window = originalWindow;
	global.document = originalDocument;
	global.chrome = originalChrome;
});
