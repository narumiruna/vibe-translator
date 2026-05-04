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
	ARTICLE_CONTENT_SELECTOR,
	detectContentMode,
	isHeadingLikeElement,
	isUnsupportedElement,
	scoreCandidateBlock,
	scoreTranslationRoot,
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
		isConnected: options.isConnected ?? true,
		innerText: options.innerText || options.textContent || "",
		textContent: options.textContent || options.innerText || "",
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

			if (selector === 'main, article, [role="main"]') {
				return Array.from({ length: options.nestedRootCount || 0 }, () => ({}));
			}

			if (selector.includes(".docs-nav-rail") || selector.includes("time")) {
				return Array.from(
					{ length: options.unsupportedCount || 0 },
					() => ({}),
				);
			}

			if (selector.includes('[role="button"]')) {
				return Array.from({ length: interactiveCount }, () => ({}));
			}

			if (selector.includes("blockquote") && selector.includes("figcaption")) {
				return Array.from({ length: options.semanticCount || 0 }, () => ({}));
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

	assert.equal(
		isHeadingLikeElement(
			createFakeElement({
				matchedSelectors: [".p-eplist__chapter-title"],
			}),
		),
		true,
	);
});

test("directory-like chapter listing pages use directory mode", () => {
	const root = {
		querySelector(selector) {
			return selector === ".p-eplist" ? {} : null;
		},
		querySelectorAll(selector) {
			if (selector === ".p-eplist__subtitle") {
				return Array.from({ length: 20 }, () => ({}));
			}

			return [];
		},
	};

	assert.equal(detectContentMode(root), "directory");
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

test("navigation and table-of-contents regions are unsupported", () => {
	assert.equal(
		isUnsupportedElement(
			createFakeElement({
				ancestorSelectors: ["nav"],
				matchedSelectors: ["h2"],
				tagName: "H2",
			}),
		),
		true,
	);

	assert.equal(
		isUnsupportedElement(
			createFakeElement({
				ancestorSelectors: [".docs-toc-rail"],
				matchedSelectors: ["p"],
				tagName: "P",
			}),
		),
		true,
	);
});

test("article content roots outrank surrounding docs layout roots", () => {
	const repeatedText = "Readable documentation paragraph ".repeat(80);
	const mainLayout = createFakeElement({
		directBlockChildCount: 2,
		innerText: repeatedText,
		interactiveCount: 50,
		linkTexts: Array.from({ length: 50 }, (_, index) => `Navigation ${index}`),
		matchedSelectors: ["main"],
		semanticCount: 32,
		tagName: "MAIN",
	});
	const articleBody = createFakeElement({
		directBlockChildCount: 13,
		innerText: repeatedText.slice(0, 1800),
		interactiveCount: 20,
		linkTexts: Array.from({ length: 20 }, (_, index) => `Guide ${index}`),
		matchedSelectors: [".docs-prose"],
		semanticCount: 30,
	});

	assert.match(ARTICLE_CONTENT_SELECTOR, /\.docs-prose/);
	assert.ok(
		scoreTranslationRoot(articleBody) > scoreTranslationRoot(mainLayout),
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
