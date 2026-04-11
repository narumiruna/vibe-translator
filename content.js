(function () {
  if (window.__OPENAI_TRANSLATOR_CONTENT__) {
    return;
  }

  window.__OPENAI_TRANSLATOR_CONTENT__ = true;

  const SOURCE_ATTR = 'data-ot-source-id';
  const NOTE_ATTR = 'data-ot-note-id';
  const STALE_ATTR = 'data-ot-source-stale';
  const TRANSLATED_ATTR = 'data-ot-translated';
  const QUEUED_ATTR = 'data-ot-queued';
  const ROOT_ATTR = 'data-ot-role';
  const STYLE_ID = 'ot-translator-style';
  const PREFETCH_VIEWPORTS = 2;
  const VISIBLE_TRANSLATION_FLUSH_DELAY_MS = 80;
  const DEFAULT_TRANSLATION_APPEARANCE = Object.freeze({
    underlineColor: '#1f7a4f',
    underlineStyle: 'dashed',
    underlineThickness: 2,
    underlineOffset: 3
  });
  const SEMANTIC_BLOCK_SELECTOR = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'li',
    'blockquote',
    'figcaption'
  ].join(', ');
  const GENERIC_BLOCK_SELECTOR = ['article', 'main', 'section', 'div'].join(', ');
  const SKIP_ANCESTOR_SELECTOR = [
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'option',
    'svg',
    'canvas',
    'math',
    '.katex',
    '.katex-mathml',
    '.MathJax',
    '.mathjax',
    '.mjx-container',
    'mjx-assistive-mml',
    '[role="math"]',
    '[aria-hidden="true"]',
    '[contenteditable="true"]',
    `[${ROOT_ATTR}]`
  ].join(', ');
  const MATH_SELECTOR = [
    'math',
    '.katex',
    '.katex-display',
    '.katex-mathml',
    '.MathJax',
    '.mathjax',
    '.mjx-container',
    'mjx-assistive-mml',
    '[role="math"]'
  ].join(', ');
  const PROTECTED_PLACEHOLDER_REGEX = /__OT_(?:TOKEN|MATH)_\d+__/g;
  const INLINE_CODE_SELECTOR = 'code, kbd, samp';
  const TERMINAL_LIKE_SELECTOR = [
    '[role="log"]',
    '[role="textbox"]',
    '.terminal',
    '.console',
    '.xterm',
    '.cm-editor',
    '.monaco-editor'
  ].join(', ');
  let observerStarted = false;
  let staleFlushTimer = null;
  let visibleTranslationFlushTimer = null;
  const pendingStaleSources = new Set();
  const ViewportApi = window.TranslatorContentViewport || {
    DEFAULT_PREFETCH_VIEWPORTS: 2,
    DEFAULT_TOP_MARGIN: 96,
    normalizeViewportOptions(options) {
      const prefetchViewports = Math.max(
        0,
        Number(options && options.prefetchViewports) || PREFETCH_VIEWPORTS
      );

      return {
        viewportHeight: Math.max(0, Number(options && options.viewportHeight) || 0),
        prefetchViewports,
        topPrefetchViewports: Math.max(
          0,
          Number(options && options.topPrefetchViewports) || prefetchViewports
        ),
        topMargin: Math.max(0, Number(options && options.topMargin) || 96)
      };
    },
    isRectWithinTranslationWindow(rect, options) {
      const normalized = this.normalizeViewportOptions(options);
      const minBottom =
        -normalized.topMargin - (normalized.viewportHeight * normalized.topPrefetchViewports);

      return (
        rect &&
        Number(rect.bottom) >= minBottom &&
        Number(rect.top) <= normalized.viewportHeight * (1 + normalized.prefetchViewports)
      );
    },
    selectWindowCandidates(items, options) {
      return [...(items || [])]
        .filter((item) => this.isRectWithinTranslationWindow(item.rect, options))
        .sort((left, right) => left.rect.top - right.rect.top);
    },
    getTranslationWindowPriority(rect, options) {
      const normalized = this.normalizeViewportOptions(options);
      const viewportHeight = normalized.viewportHeight;
      const top = Number(rect && rect.top) || 0;
      const bottom = Number(rect && rect.bottom) || 0;

      if (viewportHeight <= 0) {
        return Math.max(0, top);
      }

      if (bottom < 0) {
        return viewportHeight + Math.abs(bottom);
      }

      if (top < viewportHeight) {
        return Math.max(0, top);
      }

      return viewportHeight + Math.max(0, top - viewportHeight);
    }
  };
  const pageState = {
    pageTranslation: {
      active: false,
      sessionId: ''
    },
    translationAppearance: { ...DEFAULT_TRANSLATION_APPEARANCE }
  };

  function normalizeTranslationAppearance(appearance) {
    const source = appearance || {};
    const color = /^#[0-9a-f]{6}$/i.test(String(source.underlineColor || '').trim())
      ? String(source.underlineColor).trim().toLowerCase()
      : DEFAULT_TRANSLATION_APPEARANCE.underlineColor;
    const style = ['solid', 'dashed', 'dotted'].includes(String(source.underlineStyle || '').trim().toLowerCase())
      ? String(source.underlineStyle).trim().toLowerCase()
      : DEFAULT_TRANSLATION_APPEARANCE.underlineStyle;
    const thickness = Math.min(6, Math.max(1, Number(source.underlineThickness) || DEFAULT_TRANSLATION_APPEARANCE.underlineThickness));
    const offset = Math.min(12, Math.max(0, Number(source.underlineOffset) || DEFAULT_TRANSLATION_APPEARANCE.underlineOffset));

    return {
      underlineColor: color,
      underlineStyle: style,
      underlineThickness: thickness,
      underlineOffset: offset
    };
  }

  function ensureStyles(appearance) {
    if (appearance) {
      pageState.translationAppearance = normalizeTranslationAppearance(appearance);
    }

    const resolvedAppearance = pageState.translationAppearance;
    let style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }

    style.textContent = `
      [${ROOT_ATTR}="note"] {
        display: block;
        box-sizing: border-box;
        max-width: 100%;
        margin: 0.28rem 0 0.76rem;
        padding: 0;
        font-family: inherit;
        font-size: 0.92em;
        font-weight: 500;
        line-height: 1.55;
        color: #5f646d;
        text-align: start;
        background: transparent;
        position: static;
      }

      [${ROOT_ATTR}="note"][data-phase="ready"] {
        animation: ot-fade-in 0.22s ease forwards;
      }

      [${ROOT_ATTR}="note"][data-stale="true"] {
        opacity: 0.72;
      }

      [${ROOT_ATTR}="note-body"] {
        display: block;
        margin-top: 0.18rem;
        padding: 0;
        font-family: inherit;
        font-size: inherit;
        line-height: 1.6;
        color: inherit;
        text-decoration-line: underline;
        text-decoration-color: ${resolvedAppearance.underlineColor};
        text-decoration-style: ${resolvedAppearance.underlineStyle};
        text-decoration-thickness: ${resolvedAppearance.underlineThickness}px;
        text-underline-offset: ${resolvedAppearance.underlineOffset}px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      [${ROOT_ATTR}="note-body"][data-state="pending"] {
        min-height: 1.2em;
        color: transparent;
        border-radius: 0.55rem;
        text-decoration-color: transparent;
        background:
          linear-gradient(
            90deg,
            rgba(132, 138, 150, 0.12) 0%,
            rgba(255, 255, 255, 0.72) 50%,
            rgba(132, 138, 150, 0.12) 100%
          );
        background-size: 200% 100%;
        animation: ot-shimmer 1.2s linear infinite;
      }

      [${ROOT_ATTR}="note-body"] code {
        display: inline;
        padding: 0.08em 0.34em;
        border-radius: 0.35em;
        background: rgba(111, 118, 129, 0.12);
        color: #39414d;
        text-decoration: none;
        font: 0.92em/1.4 ui-monospace, 'SFMono-Regular', Menlo, monospace;
      }

      [${ROOT_ATTR}="toast-layer"] {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0 0 1rem;
      }

      [${ROOT_ATTR}="toast"] {
        max-width: min(100%, 32rem);
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(28, 33, 36, 0.94);
        color: #f7f9f8;
        font: 500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }

      [${ROOT_ATTR}="toast"][data-level="success"] {
        background: rgba(24, 78, 53, 0.96);
      }

      [${ROOT_ATTR}="toast"][data-level="error"] {
        background: rgba(121, 33, 33, 0.97);
      }

      [${ROOT_ATTR}="selection-panel"] {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 24px));
        padding: 14px 14px 16px;
        border: 1px solid rgba(41, 66, 52, 0.16);
        border-radius: 18px;
        background: rgba(255, 252, 248, 0.98);
        box-shadow: 0 20px 48px rgba(32, 39, 36, 0.18);
        backdrop-filter: blur(10px);
        color: #2f352f;
        font: 500 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }

      [${ROOT_ATTR}="selection-panel-header"] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      [${ROOT_ATTR}="selection-panel-title"] {
        margin: 0;
        color: #45614c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      [${ROOT_ATTR}="selection-panel-close"] {
        border: 0;
        background: transparent;
        color: #6a726c;
        cursor: pointer;
        padding: 4px;
        border-radius: 999px;
        font: 700 18px/1 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }

      [${ROOT_ATTR}="selection-panel-close"]:hover {
        background: rgba(69, 97, 76, 0.1);
        color: #2c4734;
      }

      [${ROOT_ATTR}="selection-panel-body"] {
        display: block;
        max-height: min(44vh, 24rem);
        overflow: auto;
        padding-right: 4px;
        color: #4d564f;
        white-space: pre-wrap;
        word-break: break-word;
        text-decoration-line: underline;
        text-decoration-color: ${resolvedAppearance.underlineColor};
        text-decoration-style: ${resolvedAppearance.underlineStyle};
        text-decoration-thickness: ${resolvedAppearance.underlineThickness}px;
        text-underline-offset: ${resolvedAppearance.underlineOffset}px;
      }

      [${ROOT_ATTR}="selection-panel-body"][data-state="pending"] {
        min-height: 3.4em;
        color: transparent;
        border-radius: 0.75rem;
        text-decoration-color: transparent;
        background:
          linear-gradient(
            90deg,
            rgba(132, 138, 150, 0.12) 0%,
            rgba(255, 255, 255, 0.74) 50%,
            rgba(132, 138, 150, 0.12) 100%
          );
        background-size: 200% 100%;
        animation: ot-shimmer 1.2s linear infinite;
      }

      [${ROOT_ATTR}="selection-panel-body"] code {
        display: inline;
        padding: 0.08em 0.34em;
        border-radius: 0.35em;
        background: rgba(111, 118, 129, 0.12);
        color: #39414d;
        text-decoration: none;
        font: 0.92em/1.4 ui-monospace, 'SFMono-Regular', Menlo, monospace;
      }

      @media (max-width: 640px) {
        [${ROOT_ATTR}="selection-panel"] {
          right: 12px;
          left: 12px;
          bottom: 12px;
          width: auto;
          max-width: none;
        }
      }

      @keyframes ot-shimmer {
        0% {
          background-position: 200% 0;
        }

        100% {
          background-position: -200% 0;
        }
      }

      @keyframes ot-fade-in {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }
    `;
  }

  function setSourceQueued(element, queued) {
    if (!element) {
      return;
    }

    element.setAttribute(QUEUED_ATTR, queued ? 'true' : 'false');
  }

  function activatePageTranslationSession(sessionId) {
    pageState.pageTranslation.active = true;
    pageState.pageTranslation.sessionId = sessionId || '';
  }

  function isPageTranslationSessionActive() {
    return pageState.pageTranslation.active && Boolean(pageState.pageTranslation.sessionId);
  }

  function normalizeInlineWhitespace(text) {
    return String(text || '').replace(/[ \t\r\f\v]+/g, ' ').trim();
  }

  function normalizeSegmentText(text) {
    return String(text || '')
      .split('\n')
      .map((line) => normalizeInlineWhitespace(line))
      .filter((line, index, array) => line || (index > 0 && index < array.length - 1))
      .join('\n')
      .trim();
  }

  function shouldTranslateText(text) {
    const normalized = normalizeSegmentText(text).replace(PROTECTED_PLACEHOLDER_REGEX, ' ');
    const meaningfulChars = normalized.replace(/[\s\p{P}\p{S}]/gu, '');

    return meaningfulChars.length >= 2;
  }

  function createProtectedPlaceholder(context, fragment) {
    if (!context || !fragment) {
      return '';
    }

    context.counter += 1;

    const placeholder = `__OT_MATH_${context.counter}__`;

    context.tokens.push({
      placeholder,
      preservePlaceholder: true,
      ...fragment
    });

    return placeholder;
  }

  function extractMathFragment(element) {
    if (!element || !element.matches) {
      return null;
    }

    const html = typeof element.outerHTML === 'string' ? element.outerHTML.trim() : '';
    const text = normalizeSegmentText(element.textContent || '');

    if (html) {
      return {
        kind: 'math',
        html,
        text,
        value: text
      };
    }

    const mathChild = !element.matches('math') ? element.querySelector('math') : null;

    if (mathChild && mathChild.outerHTML) {
      return {
        kind: 'math',
        html: mathChild.outerHTML,
        text,
        value: text
      };
    }

    for (const attributeName of ['data-tex', 'data-latex', 'alttext', 'aria-label']) {
      const attributeValue = normalizeSegmentText(element.getAttribute(attributeName) || '');

      if (attributeValue) {
        return {
          kind: 'math',
          text: attributeValue,
          value: attributeValue
        };
      }
    }

    if (text) {
      return {
        kind: 'math',
        text,
        value: text
      };
    }

    return null;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);

    if (style.visibility === 'hidden' || style.display === 'none') {
      return false;
    }

    const rect = element.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
  }

  function getSegmentKind(element) {
    if (!element) {
      return 'paragraph';
    }

    const tag = element.tagName;

    if (/^H[1-6]$/.test(tag)) {
      return 'heading';
    }

    if (tag === 'LI') {
      return 'list_item';
    }

    if (tag === 'TD' || tag === 'TH') {
      return 'table_cell';
    }

    if (tag === 'BLOCKQUOTE') {
      return 'quote';
    }

    return 'paragraph';
  }

  function serializeNode(node, context) {
    if (!node) {
      return '';
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node;

    if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') {
      return '';
    }

    if (element.matches(MATH_SELECTOR)) {
      const mathFragment = extractMathFragment(element);

      return createProtectedPlaceholder(context, mathFragment);
    }

    if (element.closest(SKIP_ANCESTOR_SELECTOR) && !element.matches(INLINE_CODE_SELECTOR)) {
      return '';
    }

    if (element.matches('br')) {
      return '\n';
    }

    if (element.matches(INLINE_CODE_SELECTOR)) {
      return `\`${normalizeInlineWhitespace(element.textContent || '')}\``;
    }

    if (element.matches('pre')) {
      return `\`${normalizeInlineWhitespace(element.textContent || '')}\``;
    }

    return Array.from(element.childNodes).map((child) => serializeNode(child, context)).join('');
  }

  function getSegmentContent(element) {
    const context = {
      counter: 0,
      tokens: []
    };

    return {
      text: normalizeSegmentText(serializeNode(element, context)),
      protectedFragments: context.tokens
    };
  }

  function isGenericBlock(element) {
    return Boolean(element && element.matches && element.matches(GENERIC_BLOCK_SELECTOR));
  }

  function hasNestedSemanticBlocks(element) {
    if (!element || !isGenericBlock(element)) {
      return false;
    }

    return Boolean(element.querySelector(SEMANTIC_BLOCK_SELECTOR));
  }

  function isTranslatorOwned(element) {
    return Boolean(element && element.closest && element.closest(`[${ROOT_ATTR}]`));
  }

  function isCandidateElement(element, options) {
    const relaxed = Boolean(options && options.relaxed);

    if (!element || isTranslatorOwned(element) || !isVisible(element)) {
      return false;
    }

    if (element.closest(SKIP_ANCESTOR_SELECTOR)) {
      return false;
    }

    if (element.closest(TERMINAL_LIKE_SELECTOR)) {
      return false;
    }

    if (isGenericBlock(element) && hasNestedSemanticBlocks(element)) {
      return false;
    }

    const text = getSegmentContent(element).text;

    if (!shouldTranslateText(text)) {
      return false;
    }

    if (isGenericBlock(element) && !relaxed && text.length < 32) {
      return false;
    }

    return true;
  }

  function getExistingNoteForSource(element, id) {
    if (!element) {
      return null;
    }

    const next = element.nextElementSibling;

    if (next && next.getAttribute(NOTE_ATTR) === id) {
      return next;
    }

    return null;
  }

  function markSourceStale(element) {
    if (!element || !element.getAttribute) {
      return;
    }

    const id = element.getAttribute(SOURCE_ATTR);

    if (!id) {
      return;
    }

    element.setAttribute(STALE_ATTR, 'true');
    element.setAttribute(TRANSLATED_ATTR, 'stale');
    setSourceQueued(element, false);
    const note = getExistingNoteForSource(element, id);

    if (note) {
      note.setAttribute('data-stale', 'true');
    }
  }

  function markRelatedSourcesStale(node) {
    if (!node) {
      return;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    if (!element) {
      return;
    }

    if (element.closest(`[${ROOT_ATTR}]`)) {
      return;
    }

    const directSource = element.closest(`[${SOURCE_ATTR}]`);

    if (directSource) {
      pendingStaleSources.add(directSource);
      scheduleStaleFlush();
    }
  }

  function flushPendingStaleSources() {
    staleFlushTimer = null;

    for (const element of pendingStaleSources) {
      markSourceStale(element);
    }

    pendingStaleSources.clear();
  }

  function scheduleStaleFlush() {
    if (staleFlushTimer) {
      return;
    }

    staleFlushTimer = window.setTimeout(flushPendingStaleSources, 120);
  }

  function ensureObserver() {
    if (observerStarted || !document.body) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const targetElement =
          mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE
            ? mutation.target
            : mutation.target && mutation.target.parentElement;

        if (targetElement && targetElement.closest(`[${ROOT_ATTR}]`)) {
          continue;
        }

        if (mutation.type === 'characterData') {
          markRelatedSourcesStale(mutation.target);
          scheduleVisiblePageTranslation();
          continue;
        }

        if (mutation.type === 'childList') {
          markRelatedSourcesStale(mutation.target);

          for (const node of mutation.addedNodes) {
            markRelatedSourcesStale(node);
          }

          scheduleVisiblePageTranslation();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });

    window.addEventListener(
      'scroll',
      () => {
        scheduleVisiblePageTranslation();
      },
      { passive: true }
    );
    window.addEventListener('resize', () => {
      scheduleVisiblePageTranslation();
    });

    observerStarted = true;
  }

  function buildSegmentItem(element, counterRef) {
    const content = getSegmentContent(element);
    let itemId = element.getAttribute(SOURCE_ATTR);

    if (!itemId) {
      counterRef.value += 1;
      itemId = `ot-${counterRef.value}`;
    }

    element.setAttribute(SOURCE_ATTR, itemId);
    if (!element.hasAttribute(QUEUED_ATTR)) {
      element.setAttribute(QUEUED_ATTR, 'false');
    }

    return {
      id: itemId,
      kind: getSegmentKind(element),
      text: content.text,
      protectedFragments: content.protectedFragments
    };
  }

  function getViewportWindowOptions() {
    return ViewportApi.normalizeViewportOptions({
      viewportHeight: window.innerHeight || document.documentElement.clientHeight || 0,
      prefetchViewports: PREFETCH_VIEWPORTS
    });
  }

  function shouldQueueElementForTranslation(element, existingId) {
    const stale = element.getAttribute(STALE_ATTR) === 'true';
    const translated = element.getAttribute(TRANSLATED_ATTR) === 'true';
    const queued = element.getAttribute(QUEUED_ATTR) === 'true';
    const hasNote = existingId ? Boolean(getExistingNoteForSource(element, existingId)) : false;

    if (stale) {
      return true;
    }

    return !(hasNote || translated || queued);
  }

  function createWindowCandidate(element, item) {
    return {
      element,
      item,
      rect: element.getBoundingClientRect()
    };
  }

  function collectSemanticItems(options) {
    const items = [];
    const windowCandidates = [];
    const totalElements = [];
    const counterRef = { value: document.querySelectorAll(`[${SOURCE_ATTR}]`).length };
    const elements = Array.from(document.body.querySelectorAll(SEMANTIC_BLOCK_SELECTOR));
    const windowed = Boolean(options && options.windowed);
    const viewportOptions = windowed ? getViewportWindowOptions() : null;

    for (const element of elements) {
      if (!isCandidateElement(element)) {
        continue;
      }

      totalElements.push(element);

      const existingId = element.getAttribute(SOURCE_ATTR);
      const shouldQueue = shouldQueueElementForTranslation(element, existingId);

      if (!shouldQueue) {
        continue;
      }

      const item = buildSegmentItem(element, counterRef);

      if (windowed) {
        windowCandidates.push(createWindowCandidate(element, item));
      } else {
        items.push(item);
      }
    }

    return {
      items: windowed
        ? ViewportApi.selectWindowCandidates(windowCandidates, viewportOptions).map(
            (candidate) => candidate.item
          )
        : items,
      totalSegments: totalElements.length
    };
  }

  function collectFallbackItems(options) {
    const counterRef = { value: document.querySelectorAll(`[${SOURCE_ATTR}]`).length };
    const seen = new Set();
    const items = [];
    const windowCandidates = [];
    let totalSegments = 0;
    const windowed = Boolean(options && options.windowed);
    const viewportOptions = windowed ? getViewportWindowOptions() : null;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;

          if (!parent || parent.closest(SKIP_ANCESTOR_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!shouldTranslateText(node.textContent || '')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode = walker.nextNode();

    while (currentNode) {
      const parent = currentNode.parentElement;
      const anchor = parent.closest(SEMANTIC_BLOCK_SELECTOR) || parent.closest(GENERIC_BLOCK_SELECTOR);

      if (anchor && isCandidateElement(anchor, { relaxed: true }) && !seen.has(anchor)) {
        seen.add(anchor);
        totalSegments += 1;

        const existingId = anchor.getAttribute(SOURCE_ATTR);
        const shouldQueue = shouldQueueElementForTranslation(anchor, existingId);

        if (shouldQueue) {
          const item = buildSegmentItem(anchor, counterRef);

          if (windowed) {
            windowCandidates.push(createWindowCandidate(anchor, item));
          } else {
            items.push(item);
          }
        }
      }

      currentNode = walker.nextNode();
    }

    return {
      items: windowed
        ? ViewportApi.selectWindowCandidates(windowCandidates, viewportOptions).map(
            (candidate) => candidate.item
          )
        : items,
      totalSegments
    };
  }

  function collectPageItems(options) {
    ensureStyles();
    ensureObserver();

    const semantic = collectSemanticItems(options);

    if (semantic.totalSegments > 0) {
      return {
        items: semantic.items,
        totalSegments: semantic.totalSegments,
        pendingSegments: semantic.items.length
      };
    }

    const fallback = collectFallbackItems(options);

    return {
      items: fallback.items,
      totalSegments: fallback.totalSegments,
      pendingSegments: fallback.items.length
    };
  }

  async function requestVisiblePageTranslationBatch() {
    visibleTranslationFlushTimer = null;

    if (!isPageTranslationSessionActive()) {
      return;
    }

    const extraction = collectPageItems({ windowed: true });

    if (!extraction.items || extraction.items.length === 0) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'queue-page-translation-items',
        payload: {
          sessionId: pageState.pageTranslation.sessionId,
          items: extraction.items
        }
      });
    } catch (error) {
      // Ignore runtime messaging failures on teardown or unsupported pages.
    }
  }

  function scheduleVisiblePageTranslation() {
    if (!isPageTranslationSessionActive() || visibleTranslationFlushTimer) {
      return;
    }

    visibleTranslationFlushTimer = window.setTimeout(() => {
      requestVisiblePageTranslationBatch().catch(() => {});
    }, VISIBLE_TRANSLATION_FLUSH_DELAY_MS);
  }

  function buildNote(sourceElement, id) {
    const tagName = sourceElement && sourceElement.tagName
      ? sourceElement.tagName.toLowerCase()
      : 'p';
    const note = document.createElement(tagName);
    const body = document.createElement('span');

    note.setAttribute(ROOT_ATTR, 'note');
    note.setAttribute(NOTE_ATTR, id);
    body.setAttribute(ROOT_ATTR, 'note-body');
    body.setAttribute('data-state', 'ready');
    note.appendChild(body);

    return note;
  }

  function startPageTranslationSession(payload) {
    ensureStyles(payload && payload.translationAppearance);
    ensureObserver();
    clearPendingTranslations();
    activatePageTranslationSession(payload.sessionId);

    return collectPageItems({ windowed: true });
  }

  function setNotePending(note, targetLanguage) {
    const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

    note.setAttribute('data-phase', 'pending');
    note.setAttribute('data-lang', targetLanguage);
    body.setAttribute('data-state', 'pending');
    body.replaceChildren(document.createTextNode(' '));
  }

  function appendProtectedFragment(container, fragment) {
    if (!fragment) {
      return;
    }

    if (fragment.kind === 'math' && fragment.html) {
      const template = document.createElement('template');

      template.innerHTML = fragment.html;

      if (template.content.childNodes.length > 0) {
        container.appendChild(template.content.cloneNode(true));
        return;
      }
    }

    container.appendChild(document.createTextNode(fragment.text || fragment.value || ''));
  }

  function appendFormattedText(container, text, protectedFragments) {
    const fragmentByPlaceholder = new Map(
      (protectedFragments || []).map((fragment) => [fragment.placeholder, fragment])
    );
    const lines = String(text || '').split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const parts = line.split(/(__OT_(?:TOKEN|MATH)_\d+__|`[^`\n]+`)/g).filter(Boolean);

      for (const part of parts) {
        const protectedFragment = fragmentByPlaceholder.get(part);

        if (protectedFragment) {
          appendProtectedFragment(container, protectedFragment);
        } else if (/^`[^`\n]+`$/.test(part)) {
          const code = document.createElement('code');

          code.textContent = part.slice(1, -1);
          container.appendChild(code);
        } else {
          container.appendChild(document.createTextNode(part));
        }
      }

      if (lineIndex < lines.length - 1) {
        container.appendChild(document.createElement('br'));
      }
    }
  }

  function upsertNoteForSource(element, id, translation, targetLanguage, protectedFragments) {
    if (hasUnsafeLayoutContext(element)) {
      return null;
    }

    const existingNote = getExistingNoteForSource(element, id);
    const note = existingNote || buildNote(element, id);
    const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

    note.setAttribute('data-phase', 'ready');
    note.setAttribute('data-lang', targetLanguage);
    body.setAttribute('data-state', 'ready');
    body.replaceChildren();
    appendFormattedText(body, translation, protectedFragments);
    note.removeAttribute('data-stale');
    element.removeAttribute(STALE_ATTR);
    element.setAttribute(TRANSLATED_ATTR, 'true');
    setSourceQueued(element, false);

    if (!existingNote) {
      element.insertAdjacentElement('afterend', note);
    }

    return note;
  }

  function renderPagePlaceholders(payload) {
    ensureStyles(payload && payload.translationAppearance);
    ensureObserver();

    const ids = new Set(payload.ids || []);
    let rendered = 0;

    for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
      const id = element.getAttribute(SOURCE_ATTR);

      if (!ids.has(id) || hasUnsafeLayoutContext(element)) {
        continue;
      }

      const note = getExistingNoteForSource(element, id) || buildNote(element, id);

      setNotePending(note, payload.targetLanguage);
      setSourceQueued(element, true);

      if (!note.isConnected) {
        element.insertAdjacentElement('afterend', note);
      }
      rendered += 1;
    }

    return { rendered };
  }

  function hasUnsafeLayoutContext(element) {
    let current = element;

    while (current && current !== document.body) {
      if (current.matches && current.matches(TERMINAL_LIKE_SELECTOR)) {
        return true;
      }

      const style = window.getComputedStyle(current);

      if (
        style.transform !== 'none' ||
        style.perspective !== 'none' ||
        style.filter !== 'none' ||
        style.backdropFilter !== 'none'
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function renderPageTranslations(payload) {
    ensureStyles(payload && payload.translationAppearance);
    ensureObserver();

    const translationMap = new Map((payload.translations || []).map((item) => [item.id, item]));
    let rendered = 0;

    for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
      const id = element.getAttribute(SOURCE_ATTR);
      const translationItem = translationMap.get(id);
      const translation = translationItem && translationItem.translation;

      if (!translation) {
        continue;
      }

      const note = upsertNoteForSource(
        element,
        id,
        translation,
        payload.targetLanguage,
        translationItem.protectedFragments
      );

      if (note) {
        rendered += 1;
      }
    }

    return { rendered };
  }

  function clearPagePlaceholders(payload) {
    const ids = new Set(payload.ids || []);
    let cleared = 0;

    for (const note of document.querySelectorAll(`[${ROOT_ATTR}="note"][data-phase="pending"]`)) {
      const id = note.getAttribute(NOTE_ATTR);

      if (!ids.has(id)) {
        continue;
      }

      note.remove();
      cleared += 1;

      const source = document.querySelector(`[${SOURCE_ATTR}="${id}"]`);

      if (source) {
        source.removeAttribute(TRANSLATED_ATTR);
        source.removeAttribute(STALE_ATTR);
        setSourceQueued(source, false);
      }
    }

    return { cleared };
  }

  function closeSelectionPanel() {
    const panel = document.querySelector(`[${ROOT_ATTR}="selection-panel"]`);

    if (panel) {
      panel.remove();
    }
  }

  function getSelectionPanel() {
    ensureStyles();
    let panel = document.querySelector(`[${ROOT_ATTR}="selection-panel"]`);

    if (panel) {
      return panel;
    }

    panel = document.createElement('aside');
    const header = document.createElement('div');
    const title = document.createElement('p');
    const closeButton = document.createElement('button');
    const body = document.createElement('div');

    panel.setAttribute(ROOT_ATTR, 'selection-panel');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', 'Selected text translation');
    header.setAttribute(ROOT_ATTR, 'selection-panel-header');
    title.setAttribute(ROOT_ATTR, 'selection-panel-title');
    closeButton.setAttribute(ROOT_ATTR, 'selection-panel-close');
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Close translation');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      closeSelectionPanel();
    });
    body.setAttribute(ROOT_ATTR, 'selection-panel-body');
    body.setAttribute('data-state', 'ready');
    title.textContent = 'Selected Text Translation';

    header.appendChild(title);
    header.appendChild(closeButton);
    panel.appendChild(header);
    panel.appendChild(body);

    if (document.body) {
      document.body.appendChild(panel);
    } else {
      document.documentElement.appendChild(panel);
    }

    return panel;
  }

  function updateSelectionPanel(payload) {
    const panel = getSelectionPanel();
    const title = panel.querySelector(`[${ROOT_ATTR}="selection-panel-title"]`);
    const body = panel.querySelector(`[${ROOT_ATTR}="selection-panel-body"]`);

    if (title) {
      title.textContent = payload.targetLanguage
        ? `Selected Text Translation · ${payload.targetLanguage}`
        : 'Selected Text Translation';
    }

    if (!body) {
      return panel;
    }

    body.setAttribute('data-state', payload.pending ? 'pending' : 'ready');
    body.replaceChildren();

    if (payload.pending) {
      body.appendChild(document.createTextNode(' '));
      return panel;
    }

    appendFormattedText(body, payload.translation || '', payload.protectedFragments);
    return panel;
  }

  function renderSelectionTranslation(payload) {
    ensureStyles(payload && payload.translationAppearance);
    ensureObserver();

    updateSelectionPanel({
      pending: false,
      targetLanguage: payload.targetLanguage,
      translation: payload.translation
    });

    return { rendered: 'floating' };
  }

  function renderSelectionPlaceholder(payload) {
    ensureStyles(payload && payload.translationAppearance);
    ensureObserver();

    updateSelectionPanel({
      pending: true,
      targetLanguage: payload.targetLanguage
    });

    return { rendered: 'floating' };
  }

  function clearPendingTranslations() {
    const notes = Array.from(document.querySelectorAll(`[${ROOT_ATTR}="note"][data-phase="pending"]`));

    pageState.pageTranslation.active = false;
    pageState.pageTranslation.sessionId = '';
    if (visibleTranslationFlushTimer) {
      window.clearTimeout(visibleTranslationFlushTimer);
      visibleTranslationFlushTimer = null;
    }

    for (const note of notes) {
      note.remove();
    }

    for (const source of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
      if (source.getAttribute(TRANSLATED_ATTR) !== 'true') {
        setSourceQueued(source, false);
      }
    }

    return { cleared: notes.length };
  }

  function getToastLayer() {
    ensureStyles();
    let layer = document.querySelector(`[${ROOT_ATTR}="toast-layer"]`);

    if (!layer) {
      layer = document.createElement('div');
      layer.setAttribute(ROOT_ATTR, 'toast-layer');
      if (document.body) {
        document.body.insertAdjacentElement('afterbegin', layer);
      } else {
        document.documentElement.appendChild(layer);
      }
    }

    return layer;
  }

  function showToast(message, level, timeout) {
    const toast = document.createElement('div');
    const layer = getToastLayer();

    toast.setAttribute(ROOT_ATTR, 'toast');
    toast.setAttribute('data-level', level || 'info');
    toast.textContent = message;
    layer.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();

      if (layer.childElementCount === 0) {
        layer.remove();
      }
    }, timeout || 3200);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      sendResponse({ ok: false });
      return;
    }

    if (message.type === 'ping') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'extract-page-content') {
      sendResponse({
        ok: true,
        ...collectPageItems()
      });
      return;
    }

    if (message.type === 'start-page-translation-session') {
      sendResponse({
        ok: true,
        ...startPageTranslationSession(message.payload || {})
      });
      return;
    }

    if (message.type === 'render-page-translations') {
      sendResponse({
        ok: true,
        ...renderPageTranslations(message.payload || {})
      });
      return;
    }

    if (message.type === 'render-page-translation-updates') {
      sendResponse({
        ok: true,
        ...renderPageTranslations(message.payload || {})
      });
      return;
    }

    if (message.type === 'render-page-placeholders') {
      sendResponse({
        ok: true,
        ...renderPagePlaceholders(message.payload || {})
      });
      return;
    }

    if (message.type === 'render-selection-translation') {
      sendResponse({
        ok: true,
        ...renderSelectionTranslation(message.payload || {})
      });
      return;
    }

    if (message.type === 'render-selection-placeholder') {
      sendResponse({
        ok: true,
        ...renderSelectionPlaceholder(message.payload || {})
      });
      return;
    }

    if (message.type === 'clear-pending-translations') {
      sendResponse({
        ok: true,
        ...clearPendingTranslations()
      });
      return;
    }

    if (message.type === 'clear-page-placeholders') {
      sendResponse({
        ok: true,
        ...clearPagePlaceholders(message.payload || {})
      });
      return;
    }

    if (message.type === 'show-toast') {
      const payload = message.payload || {};
      showToast(payload.message || '', payload.level || 'info');
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  });
})();
