const test = require("node:test");
const assert = require("node:assert/strict");

const originalWindow = global.window;
const originalDocument = global.document;
const originalChrome = global.chrome;
const originalNode = global.Node;

global.Node = {
	DOCUMENT_POSITION_FOLLOWING: 4,
	DOCUMENT_POSITION_PRECEDING: 2,
	ELEMENT_NODE: 1,
	TEXT_NODE: 3,
};

global.window = {
	__OPENAI_TRANSLATOR_CONTENT__: false,
	TranslatorContentExtraction: require("../content-extraction.js"),
	TranslatorMessages: require("../translator-messages.js"),
	clearTimeout,
	getComputedStyle() {
		return {
			backdropFilter: "none",
			display: "block",
			filter: "none",
			mixBlendMode: "normal",
			perspective: "none",
			transform: "none",
			visibility: "visible",
		};
	},
	setTimeout,
};
global.document = {
	body: {},
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
	DIRECT_NOTE_TARGET_SELECTOR,
	READABLE_BLOCK_SELECTOR,
	SOCIAL_TEXT_BLOCK_SELECTOR,
	_allocateSourceId,
	_getHighestSourceIdCounter,
	_getNoteElementTagName,
	_hasSourceTextChanged,
	_isSafeNoteInsertionTarget,
	_rememberSourceText,
	_resetSourceIdCounterForTest,
	_resetSourceTextSnapshotsForTest,
	_shouldAppendNoteInsideTarget,
	detectContentMode,
	isHeadingLikeElement,
	isInsideTranslation,
	isTranslatorOwned,
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
		parentElement: options.parentElement || null,
		computedStyle: options.computedStyle || null,
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

test("site-owned translation class is not treated as extension-owned", () => {
	const siteTranslationBlock = createFakeElement({
		ancestorSelectors: [".translation"],
		matchedSelectors: ["p"],
		tagName: "P",
	});
	const extensionBlock = createFakeElement({
		ancestorSelectors: ['[data-ot-role]'],
		matchedSelectors: ["p"],
		tagName: "P",
	});

	assert.equal(isInsideTranslation(siteTranslationBlock), false);
	assert.equal(isTranslatorOwned(siteTranslationBlock), false);
	assert.equal(isUnsupportedElement(siteTranslationBlock), false);
	assert.equal(isInsideTranslation(extensionBlock), true);
	assert.equal(isTranslatorOwned(extensionBlock), true);
});

test("source id allocation scans existing ids once and stays monotonic", () => {
	const originalQuerySelectorAll = global.document.querySelectorAll;
	let scanCount = 0;

	try {
		_resetSourceIdCounterForTest();
		global.document.querySelectorAll = () => {
			scanCount += 1;

			return scanCount === 1
				? [{ getAttribute: () => "ot-3" }, { getAttribute: () => "ot-7" }]
				: [{ getAttribute: () => "ot-100" }];
		};

		assert.equal(_getHighestSourceIdCounter(), 7);
		scanCount = 0;
		assert.equal(_allocateSourceId(), "ot-8");
		assert.equal(_allocateSourceId(), "ot-9");
		assert.equal(scanCount, 1);
	} finally {
		global.document.querySelectorAll = originalQuerySelectorAll;
		_resetSourceIdCounterForTest();
	}
});

test("table cell notes use structure-preserving insertion helpers", () => {
	assert.equal(_getNoteElementTagName({ tagName: "TD" }), "div");
	assert.equal(_getNoteElementTagName({ tagName: "TH" }), "div");
	assert.equal(_shouldAppendNoteInsideTarget({ tagName: "TD" }), true);
	assert.equal(_shouldAppendNoteInsideTarget({ tagName: "P" }), false);
});

test("source text snapshots ignore unchanged mutations", () => {
	const textNode = {
		nodeType: global.Node.TEXT_NODE,
		textContent: "Alpha text",
	};
	const element = {
		childNodes: [textNode],
		closest() {
			return null;
		},
		getAttribute() {
			return null;
		},
		matches() {
			return false;
		},
		nodeType: global.Node.ELEMENT_NODE,
		tagName: "P",
	};

	_resetSourceTextSnapshotsForTest();
	_rememberSourceText(element, "Alpha text");
	assert.equal(_hasSourceTextChanged(element), false);

	textNode.textContent = "Beta text";
	assert.equal(_hasSourceTextChanged(element), true);
	_resetSourceTextSnapshotsForTest();
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

test("X tweet text blocks are readable direct note targets", () => {
	assert.ok(READABLE_BLOCK_SELECTOR.includes(SOCIAL_TEXT_BLOCK_SELECTOR));
	assert.ok(DIRECT_NOTE_TARGET_SELECTOR.includes(SOCIAL_TEXT_BLOCK_SELECTOR));

	const tweetText = createFakeElement({
		matchedSelectors: [SOCIAL_TEXT_BLOCK_SELECTOR],
		tagName: "DIV",
	});

	assert.ok(scoreCandidateBlock(tweetText, "Short status") >= 40);
});

test("identity transforms do not block direct note insertion targets", () => {
	const body = {};
	const parent = {
		computedStyle: {
			backdropFilter: "none",
			filter: "none",
			mixBlendMode: "normal",
			perspective: "none",
			transform: "matrix(1, 0, 0, 1, 0, 0)",
		},
		matches() {
			return false;
		},
		parentElement: body,
		tagName: "DIV",
	};
	const tweetText = createFakeElement({
		matchedSelectors: [SOCIAL_TEXT_BLOCK_SELECTOR],
		parentElement: parent,
		tagName: "DIV",
	});

	global.document.body = body;
	global.window.getComputedStyle = (element) =>
		element.computedStyle || {
			backdropFilter: "none",
			display: "block",
			filter: "none",
			mixBlendMode: "normal",
			perspective: "none",
			transform: "none",
			visibility: "visible",
		};

	assert.equal(_isSafeNoteInsertionTarget(tweetText), true);

	parent.computedStyle.transform = "matrix(1, 0, 0, 1, 0, 12)";
	assert.equal(_isSafeNoteInsertionTarget(tweetText), false);
});

test.after(() => {
	global.window = originalWindow;
	global.document = originalDocument;
	global.chrome = originalChrome;
	global.Node = originalNode;
});
