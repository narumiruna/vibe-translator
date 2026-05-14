((root) => {
	const ARTICLE_CONTENT_SELECTOR = [
		"article",
		'[role="article"]',
		".article-content",
		".doc-content",
		".docs-content",
		".docs-prose",
		".entry-content",
		".markdown-body",
		".post-content",
		".prose",
		".rich-text",
	].join(", ");
	const MAIN_CONTENT_SELECTOR = [
		"main",
		ARTICLE_CONTENT_SELECTOR,
		'[role="main"]',
		"#main",
		".main",
		"#content",
		".content",
		".post",
		".entry",
	].join(", ");
	const SEMANTIC_BLOCK_SELECTOR = [
		"p",
		"li",
		"blockquote",
		"figcaption",
		"td",
		"th",
	].join(", ");
	const TITLE_BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6";
	const TITLE_LIKE_SELECTOR = [
		'[role="heading"]',
		".headline",
		".gs-c-promo-heading",
		".gs-c-promo-heading__title",
		'[data-testid*="headline" i]',
	].join(", ");
	const HEADING_SELECTOR = [TITLE_BLOCK_SELECTOR, TITLE_LIKE_SELECTOR].join(
		", ",
	);
	const SUMMARY_BLOCK_SELECTOR = [
		"#novel_ex",
		'[itemprop="description"]',
		".summary",
		".description",
		".p-novel__summary",
	].join(", ");
	const DIRECTORY_SECTION_TITLE_SELECTOR = ".p-eplist__chapter-title";
	const READABLE_LINK_SELECTOR = ".p-eplist__subtitle";
	const READABLE_BLOCK_SELECTOR = [
		SEMANTIC_BLOCK_SELECTOR,
		HEADING_SELECTOR,
		SUMMARY_BLOCK_SELECTOR,
		DIRECTORY_SECTION_TITLE_SELECTOR,
		READABLE_LINK_SELECTOR,
	].join(", ");
	const DIRECT_NOTE_TARGET_SELECTOR = [
		SUMMARY_BLOCK_SELECTOR,
		DIRECTORY_SECTION_TITLE_SELECTOR,
	].join(", ");
	const DIRECT_BLOCK_CHILD_SELECTOR = [
		"article",
		"aside",
		"blockquote",
		"div",
		"dl",
		"figure",
		"footer",
		"form",
		"header",
		"li",
		"main",
		"nav",
		"ol",
		"p",
		"pre",
		"section",
		"table",
		"ul",
	].join(", ");
	const SKIP_ANCESTOR_SELECTOR = [
		"script",
		"style",
		"noscript",
		"textarea",
		"input",
		"select",
		"option",
		"svg",
		"canvas",
		"math",
		".katex",
		".katex-mathml",
		".MathJax",
		".mathjax",
		".mjx-container",
		"mjx-assistive-mml",
		'[role="math"]',
		'[aria-hidden="true"]',
		'[contenteditable="true"]',
		".translation",
		"[data-ot-role]",
	].join(", ");
	const INTERACTIVE_SELECTOR =
		'a, button, [role="button"], input, select, textarea';
	const MATH_SELECTOR = [
		"math",
		".katex",
		".katex-display",
		".katex-mathml",
		".MathJax",
		".mathjax",
		".mjx-container",
		"mjx-assistive-mml",
		'[role="math"]',
	].join(", ");
	const INLINE_CODE_SELECTOR = "code, kbd, samp";
	const UNSUPPORTED_ANCESTOR_SELECTOR = [
		".meta",
		".metadata",
		".byline",
		".timestamp",
		".share",
		".sharing",
		".social-share",
		".docs-mobile-tools",
		".docs-nav-card",
		".docs-nav-rail",
		".docs-toc-card",
		".docs-toc-inline",
		".docs-toc-rail",
		".toc",
		".table-of-contents",
		"nav",
		'[role="navigation"]',
		'[aria-label*="navigation" i]',
		'[aria-label*="share" i]',
		'[aria-label*="table of contents" i]',
		'[class*="share"]',
		'[data-testid*="share"]',
	].join(", ");
	const UNSUPPORTED_ELEMENT_SELECTOR = [
		"time",
		"button",
		'[role="button"]',
		".meta",
		".metadata",
		".byline",
		".timestamp",
		".share",
		".sharing",
		".social-share",
		".docs-mobile-tools",
		".docs-nav-card",
		".docs-nav-rail",
		".docs-toc-card",
		".docs-toc-inline",
		".docs-toc-rail",
		".toc",
		".table-of-contents",
		"nav",
		'[role="navigation"]',
		'[aria-label*="navigation" i]',
		'[aria-label*="share" i]',
		'[aria-label*="table of contents" i]',
		'[class*="share"]',
		'[data-testid*="share"]',
	].join(", ");
	const TERMINAL_LIKE_SELECTOR = [
		'[role="log"]',
		'[role="textbox"]',
		".terminal",
		".console",
		".xterm",
		".cm-editor",
		".monaco-editor",
	].join(", ");

	function normalizeInlineWhitespace(text) {
		return String(text || "")
			.replace(/[ \t\r\f\v]+/g, " ")
			.trim();
	}

	function normalizeSegmentText(text) {
		return String(text || "")
			.split("\n")
			.map((line) => normalizeInlineWhitespace(line))
			.filter(
				(line, index, array) => line || (index > 0 && index < array.length - 1),
			)
			.join("\n")
			.trim();
	}

	function isUnsupportedElement(element) {
		if (!element?.matches) {
			return false;
		}

		return Boolean(
			element.matches(UNSUPPORTED_ELEMENT_SELECTOR) ||
				element.closest(UNSUPPORTED_ANCESTOR_SELECTOR),
		);
	}

	function getElementPlainText(element) {
		if (!element) {
			return "";
		}

		return normalizeSegmentText(element.innerText || element.textContent || "");
	}

	function getElementLinkTextLength(element) {
		if (!element?.querySelectorAll) {
			return 0;
		}

		let total = 0;

		for (const link of element.querySelectorAll("a")) {
			total += normalizeInlineWhitespace(link.textContent || "").length;
		}

		return total;
	}

	function getElementLinkDensity(element, textLength) {
		if (!element || textLength <= 0) {
			return 0;
		}

		return Math.min(1, getElementLinkTextLength(element) / textLength);
	}

	function getDirectBlockChildCount(element) {
		if (!element?.children) {
			return 0;
		}

		return Array.from(element.children).filter((child) =>
			child.matches?.(DIRECT_BLOCK_CHILD_SELECTOR),
		).length;
	}

	function isHeadingLikeElement(element) {
		return Boolean(
			element?.matches?.(HEADING_SELECTOR) ||
				element?.matches?.(DIRECTORY_SECTION_TITLE_SELECTOR),
		);
	}

	function isReadableTitleLink(element) {
		return Boolean(element?.matches?.(READABLE_LINK_SELECTOR));
	}

	function hasNestedReadableBlocks(element) {
		if (!element?.querySelector) {
			return false;
		}

		return Boolean(element.querySelector(READABLE_BLOCK_SELECTOR));
	}

	function hasSelectedRelative(element, selectedElements) {
		return (selectedElements || []).some(
			(selectedElement) =>
				selectedElement === element ||
				selectedElement.contains(element) ||
				element.contains(selectedElement),
		);
	}

	function getCandidateElements(root) {
		if (!root) {
			return [];
		}

		const elements = Array.from(root.querySelectorAll(READABLE_BLOCK_SELECTOR));

		return elements.sort((left, right) => {
			if (left === right) {
				return 0;
			}

			const position = left.compareDocumentPosition(right);

			if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
				return -1;
			}

			if (position & Node.DOCUMENT_POSITION_PRECEDING) {
				return 1;
			}

			return 0;
		});
	}

	function isLikelyUiMetaBlock(element, text) {
		const textLength = text.length;
		const linkCount = element.querySelectorAll("a").length;
		const interactiveCount =
			element.querySelectorAll(INTERACTIVE_SELECTOR).length;
		const directBlockChildCount = getDirectBlockChildCount(element);
		const linkDensity = getElementLinkDensity(element, textLength);

		return (
			(linkDensity >= 0.35 && linkCount >= 2) ||
			(interactiveCount >= 2 && textLength < 160) ||
			(directBlockChildCount >= 4 && linkCount >= 2)
		);
	}

	function scoreCandidateBlock(element, text) {
		const textLength = text.length;
		const linkCount = element.querySelectorAll("a").length;
		const interactiveCount =
			element.querySelectorAll(INTERACTIVE_SELECTOR).length;
		const directBlockChildCount = getDirectBlockChildCount(element);
		const linkDensity = getElementLinkDensity(element, textLength);
		const isHeading = isHeadingLikeElement(element);
		const isTitleLink = isReadableTitleLink(element);
		const base = Math.min(320, textLength);
		const semanticBonus = element.matches(SEMANTIC_BLOCK_SELECTOR) ? 60 : 0;
		const headingBonus = isHeading ? 140 : 0;
		const summaryBonus = element.matches(SUMMARY_BLOCK_SELECTOR) ? 140 : 0;
		const readableLinkBonus = isTitleLink ? 320 : 0;
		const linkPenalty =
			isHeading || isTitleLink ? linkDensity * 60 : linkDensity * 280;
		const linkCountPenalty =
			isHeading || isTitleLink ? linkCount * 4 : linkCount * 10;

		return (
			base +
			semanticBonus +
			headingBonus +
			summaryBonus +
			readableLinkBonus -
			linkPenalty -
			linkCountPenalty -
			interactiveCount * 14 -
			directBlockChildCount * 20
		);
	}

	function scoreTranslationRoot(element, options = {}) {
		const doc = options.document || root.document || {};
		const isInsideTranslation =
			typeof options.isInsideTranslation === "function"
				? options.isInsideTranslation
				: () => false;
		const isTranslatorOwned =
			typeof options.isTranslatorOwned === "function"
				? options.isTranslatorOwned
				: () => false;

		if (
			!element?.isConnected ||
			isInsideTranslation(element) ||
			isTranslatorOwned(element)
		) {
			return Number.NEGATIVE_INFINITY;
		}

		const textLength = getElementPlainText(element).length;

		if (textLength < 80) {
			return Number.NEGATIVE_INFINITY;
		}

		const semanticCount = element.querySelectorAll(
			SEMANTIC_BLOCK_SELECTOR,
		).length;
		const unsupportedCount = element.querySelectorAll(
			UNSUPPORTED_ELEMENT_SELECTOR,
		).length;
		const interactiveCount =
			element.querySelectorAll(INTERACTIVE_SELECTOR).length;
		const directBlockChildCount = getDirectBlockChildCount(element);
		const linkDensity = getElementLinkDensity(element, textLength);
		const rootBonus = element.matches('main, article, [role="main"]') ? 400 : 0;
		const articleContentBonus = element.matches(ARTICLE_CONTENT_SELECTOR)
			? 900
			: 0;
		const bodyPenalty = element === doc.body ? 1200 : 0;
		const nestedRootPenalty =
			element.querySelectorAll('main, article, [role="main"]').length * 120;

		return (
			Math.min(600, textLength / 4) +
			semanticCount * 45 +
			rootBonus +
			articleContentBonus -
			linkDensity * 420 -
			unsupportedCount * 24 -
			interactiveCount * 4 -
			directBlockChildCount -
			bodyPenalty -
			nestedRootPenalty
		);
	}

	function detectContentMode(rootElement) {
		if (!rootElement) {
			return "leaf";
		}

		if (
			rootElement.querySelector?.(".p-eplist") &&
			(rootElement.querySelectorAll?.(READABLE_LINK_SELECTOR).length || 0) >= 12
		) {
			return "directory";
		}

		const semanticBlocks = Array.from(
			rootElement.querySelectorAll(SEMANTIC_BLOCK_SELECTOR),
		);
		return semanticBlocks.length > 0 ? "leaf" : "empty";
	}

	const api = {
		ARTICLE_CONTENT_SELECTOR,
		DIRECT_BLOCK_CHILD_SELECTOR,
		DIRECT_NOTE_TARGET_SELECTOR,
		HEADING_SELECTOR,
		INLINE_CODE_SELECTOR,
		INTERACTIVE_SELECTOR,
		MAIN_CONTENT_SELECTOR,
		MATH_SELECTOR,
		READABLE_BLOCK_SELECTOR,
		READABLE_LINK_SELECTOR,
		SEMANTIC_BLOCK_SELECTOR,
		SKIP_ANCESTOR_SELECTOR,
		SUMMARY_BLOCK_SELECTOR,
		TERMINAL_LIKE_SELECTOR,
		TITLE_LIKE_SELECTOR,
		UNSUPPORTED_ANCESTOR_SELECTOR,
		UNSUPPORTED_ELEMENT_SELECTOR,
		detectContentMode,
		getCandidateElements,
		getDirectBlockChildCount,
		getElementLinkDensity,
		getElementPlainText,
		hasNestedReadableBlocks,
		hasSelectedRelative,
		isHeadingLikeElement,
		isLikelyUiMetaBlock,
		isReadableTitleLink,
		isUnsupportedElement,
		normalizeInlineWhitespace,
		normalizeSegmentText,
		scoreCandidateBlock,
		scoreTranslationRoot,
	};

	root.TranslatorContentExtraction = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
