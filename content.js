(function () {
  if (window.__OPENAI_TRANSLATOR_CONTENT__) {
    return;
  }

  window.__OPENAI_TRANSLATOR_CONTENT__ = true;

  const SOURCE_ATTR = 'data-ot-source-id';
  const NOTE_ATTR = 'data-ot-note-id';
  const STALE_ATTR = 'data-ot-source-stale';
  const TRANSLATED_ATTR = 'data-ot-translated';
  const ROOT_ATTR = 'data-ot-role';
  const SELECTED_NOTE_ID = 'selection-note';
  const STYLE_ID = 'ot-translator-style';
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
    'figcaption',
    'td',
    'th'
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
    '[contenteditable="true"]',
    `[${ROOT_ATTR}]`
  ].join(', ');
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
  const pendingStaleSources = new Set();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${ROOT_ATTR}="note"] {
        all: initial;
        display: block;
        box-sizing: border-box;
        max-width: 100%;
        margin: 0.32rem 0 0.72rem;
        padding: 0.12rem 0 0.34rem;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        color: #25553c;
        text-align: start;
        letter-spacing: normal;
        white-space: normal;
        background: transparent;
        border: 0;
        outline: 0;
        position: static;
        transform: none;
        perspective: none;
        overflow: visible;
        z-index: auto;
      }

      [${ROOT_ATTR}="note"][data-phase="ready"] {
        animation: ot-slide-fade 0.35s ease forwards;
      }

      [${ROOT_ATTR}="note"][data-stale="true"] {
        opacity: 0.65;
      }

      [${ROOT_ATTR}="note-body"] {
        all: initial;
        display: block;
        padding-top: 0.06rem;
        padding-bottom: 0.22rem;
        border-bottom: 1px dashed rgba(41, 133, 75, 0.75);
        font-family: inherit;
        font-size: inherit;
        line-height: 1.6;
        color: #25553c;
        white-space: pre-wrap;
        word-break: break-word;
      }

      [${ROOT_ATTR}="note-body"][data-state="pending"] {
        min-height: 1.2em;
        border-bottom-color: rgba(41, 133, 75, 0.32);
        color: transparent;
        background:
          linear-gradient(
            90deg,
            rgba(37, 85, 60, 0.08) 0%,
            rgba(255, 255, 255, 0.68) 50%,
            rgba(37, 85, 60, 0.08) 100%
          );
        background-size: 200% 100%;
        animation: ot-shimmer 1.2s linear infinite;
      }

      [${ROOT_ATTR}="note-body"][data-state="ready"] {
        animation: ot-slide-fade 0.35s ease forwards;
      }

      [${ROOT_ATTR}="note-body"] code {
        all: initial;
        display: inline;
        padding: 0.08em 0.34em;
        border-radius: 0.35em;
        background: rgba(37, 85, 60, 0.09);
        color: #1d4330;
        font: 0.92em/1.4 ui-monospace, 'SFMono-Regular', Menlo, monospace;
      }

      [${ROOT_ATTR}="toast-layer"] {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      [${ROOT_ATTR}="toast"] {
        min-width: 240px;
        max-width: 360px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(28, 33, 36, 0.94);
        color: #f7f9f8;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        font: 500 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }

      [${ROOT_ATTR}="toast"][data-level="success"] {
        background: rgba(24, 78, 53, 0.96);
      }

      [${ROOT_ATTR}="toast"][data-level="error"] {
        background: rgba(121, 33, 33, 0.97);
      }

      @keyframes ot-shimmer {
        0% {
          background-position: 200% 0;
        }

        100% {
          background-position: -200% 0;
        }
      }

      @keyframes ot-slide-fade {
        from {
          opacity: 0;
          transform: translateY(6px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.documentElement.appendChild(style);
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
    const normalized = normalizeSegmentText(text);
    const meaningfulChars = normalized.replace(/[\s\p{P}\p{S}]/gu, '');

    return meaningfulChars.length >= 2;
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

  function serializeNode(node) {
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

    return Array.from(element.childNodes).map((child) => serializeNode(child)).join('');
  }

  function getSegmentText(element) {
    return normalizeSegmentText(serializeNode(element));
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

    const text = getSegmentText(element);

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

    if (element.tagName === 'LI') {
      return element.querySelector(`:scope > [${NOTE_ATTR}="${id}"]`);
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
          continue;
        }

        if (mutation.type === 'childList') {
          markRelatedSourcesStale(mutation.target);

          for (const node of mutation.addedNodes) {
            markRelatedSourcesStale(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
    observerStarted = true;
  }

  function buildSegmentItem(element, counterRef) {
    const itemId = element.getAttribute(SOURCE_ATTR) || `ot-${counterRef.value += 1}`;

    element.setAttribute(SOURCE_ATTR, itemId);

    return {
      id: itemId,
      kind: getSegmentKind(element),
      text: getSegmentText(element)
    };
  }

  function collectSemanticItems() {
    const items = [];
    const totalElements = [];
    const counterRef = { value: document.querySelectorAll(`[${SOURCE_ATTR}]`).length };
    const elements = Array.from(document.body.querySelectorAll(SEMANTIC_BLOCK_SELECTOR));

    for (const element of elements) {
      if (!isCandidateElement(element)) {
        continue;
      }

      totalElements.push(element);

      const existingId = element.getAttribute(SOURCE_ATTR);
      const stale = element.getAttribute(STALE_ATTR) === 'true';
      const hasNote = existingId ? Boolean(getExistingNoteForSource(element, existingId)) : false;
      const translated = element.getAttribute(TRANSLATED_ATTR) === 'true';

      if ((hasNote || translated) && !stale) {
        continue;
      }

      items.push(buildSegmentItem(element, counterRef));
    }

    return {
      items,
      totalSegments: totalElements.length
    };
  }

  function collectFallbackItems() {
    const counterRef = { value: document.querySelectorAll(`[${SOURCE_ATTR}]`).length };
    const seen = new Set();
    const items = [];
    let totalSegments = 0;
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
        const stale = anchor.getAttribute(STALE_ATTR) === 'true';
        const hasNote = existingId ? Boolean(getExistingNoteForSource(anchor, existingId)) : false;
        const translated = anchor.getAttribute(TRANSLATED_ATTR) === 'true';

        if (!hasNote && !translated || stale) {
          items.push(buildSegmentItem(anchor, counterRef));
        }
      }

      currentNode = walker.nextNode();
    }

    return {
      items,
      totalSegments
    };
  }

  function collectPageItems() {
    ensureStyles();
    ensureObserver();

    const semantic = collectSemanticItems();

    if (semantic.totalSegments > 0) {
      return {
        items: semantic.items,
        totalSegments: semantic.totalSegments,
        pendingSegments: semantic.items.length
      };
    }

    const fallback = collectFallbackItems();

    return {
      items: fallback.items,
      totalSegments: fallback.totalSegments,
      pendingSegments: fallback.items.length
    };
  }

  function buildNote(id) {
    const note = document.createElement('div');
    const body = document.createElement('div');

    note.setAttribute(ROOT_ATTR, 'note');
    note.setAttribute(NOTE_ATTR, id);
    body.setAttribute(ROOT_ATTR, 'note-body');
    note.appendChild(body);

    return note;
  }

  function setNotePending(note, targetLanguage) {
    const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

    note.setAttribute('data-phase', 'pending');
    note.setAttribute('data-lang', targetLanguage);
    body.setAttribute('data-state', 'pending');
    body.replaceChildren(document.createTextNode(' '));
  }

  function appendFormattedText(container, text) {
    const lines = String(text || '').split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const parts = line.split(/(`[^`\n]+`)/g).filter(Boolean);

      for (const part of parts) {
        if (/^`[^`\n]+`$/.test(part)) {
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

  function upsertNoteForSource(element, id, translation, targetLanguage) {
    if (hasUnsafeLayoutContext(element)) {
      return null;
    }

    const existingNote = getExistingNoteForSource(element, id);
    const note = existingNote || buildNote(id);
    const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

    note.setAttribute('data-phase', 'ready');
    note.setAttribute('data-lang', targetLanguage);
    body.setAttribute('data-state', 'ready');
    body.replaceChildren();
    appendFormattedText(body, translation);
    note.removeAttribute('data-stale');
    element.removeAttribute(STALE_ATTR);
    element.setAttribute(TRANSLATED_ATTR, 'true');

    if (!existingNote) {
      if (element.tagName === 'LI') {
        element.appendChild(note);
      } else {
        element.insertAdjacentElement('afterend', note);
      }
    }

    return note;
  }

  function renderPagePlaceholders(payload) {
    ensureStyles();
    ensureObserver();

    const ids = new Set(payload.ids || []);
    let rendered = 0;

    for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
      const id = element.getAttribute(SOURCE_ATTR);

      if (!ids.has(id) || hasUnsafeLayoutContext(element)) {
        continue;
      }

      const note = getExistingNoteForSource(element, id) || buildNote(id);

      setNotePending(note, payload.targetLanguage);

      if (!note.isConnected) {
        if (element.tagName === 'LI') {
          element.appendChild(note);
        } else {
          element.insertAdjacentElement('afterend', note);
        }
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
    ensureStyles();
    ensureObserver();

    const translationMap = new Map(
      (payload.translations || []).map((item) => [item.id, item.translation])
    );
    let rendered = 0;

    for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
      const id = element.getAttribute(SOURCE_ATTR);
      const translation = translationMap.get(id);

      if (!translation) {
        continue;
      }

      const note = upsertNoteForSource(element, id, translation, payload.targetLanguage);

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
      }
    }

    return { cleared };
  }

  function findSelectionContainer() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    if (!element) {
      return null;
    }

    return element.closest(SEMANTIC_BLOCK_SELECTOR) || element.closest(GENERIC_BLOCK_SELECTOR);
  }

  function renderSelectionTranslation(payload) {
    ensureStyles();
    ensureObserver();

    const container = findSelectionContainer();

    if (!container || isTranslatorOwned(container)) {
      showToast(payload.translation, 'success', 12000);
      return { rendered: 'toast' };
    }

    if (hasUnsafeLayoutContext(container)) {
      showToast(payload.translation, 'success', 12000);
      return { rendered: 'toast' };
    }

    upsertNoteForSource(container, SELECTED_NOTE_ID, payload.translation, payload.targetLanguage);

    return { rendered: 'inline' };
  }

  function renderSelectionPlaceholder(payload) {
    ensureStyles();
    ensureObserver();

    const container = findSelectionContainer();

    if (!container || isTranslatorOwned(container) || hasUnsafeLayoutContext(container)) {
      return { rendered: 'toast' };
    }

    const note = getExistingNoteForSource(container, SELECTED_NOTE_ID) || buildNote(SELECTED_NOTE_ID);

    setNotePending(note, payload.targetLanguage);

    if (!note.isConnected) {
      if (container.tagName === 'LI') {
        container.appendChild(note);
      } else {
        container.insertAdjacentElement('afterend', note);
      }
    }

    return { rendered: 'inline' };
  }

  function clearPendingTranslations() {
    const notes = Array.from(document.querySelectorAll(`[${ROOT_ATTR}="note"][data-phase="pending"]`));

    for (const note of notes) {
      note.remove();
    }

    return { cleared: notes.length };
  }

  function getToastLayer() {
    ensureStyles();
    let layer = document.querySelector(`[${ROOT_ATTR}="toast-layer"]`);

    if (!layer) {
      layer = document.createElement('div');
      layer.setAttribute(ROOT_ATTR, 'toast-layer');
      document.documentElement.appendChild(layer);
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
