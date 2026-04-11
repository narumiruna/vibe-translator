(function () {
  if (window.__OPENAI_TRANSLATOR_CONTENT__) {
    return;
  }

  window.__OPENAI_TRANSLATOR_CONTENT__ = true;

  const SOURCE_ATTR = 'data-ot-source-id';
  const NOTE_ATTR = 'data-ot-note-id';
  const ROOT_ATTR = 'data-ot-role';
  const SELECTED_NOTE_ID = 'selection-note';
  const STYLE_ID = 'ot-translator-style';
  const CANDIDATE_SELECTOR = [
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
    'th',
    'div'
  ].join(', ');
  const NESTED_BLOCK_SELECTOR = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'blockquote',
    'figcaption',
    'table',
    'ul',
    'ol'
  ].join(', ');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${ROOT_ATTR}="note"] {
        margin: 0.45rem 0 0.9rem;
        padding: 0.55rem 0.8rem 0.7rem;
        border-top: 1px dashed rgba(31, 122, 79, 0.55);
        border-radius: 10px;
        background: rgba(236, 245, 239, 0.96);
        box-shadow: 0 6px 18px rgba(25, 50, 35, 0.08);
        color: #173622;
        font-size: 0.95em;
        line-height: 1.55;
      }

      [${ROOT_ATTR}="note-header"] {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.35rem;
        font-size: 0.78em;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #1f7a4f;
      }

      [${ROOT_ATTR}="note-header"]::before {
        content: "";
        width: 0.8rem;
        height: 0.8rem;
        border-radius: 999px;
        background: linear-gradient(135deg, #1f7a4f, #74a67a);
        box-shadow: 0 0 0 3px rgba(31, 122, 79, 0.12);
      }

      [${ROOT_ATTR}="note-body"] {
        white-space: pre-wrap;
        word-break: break-word;
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
    `;
    document.documentElement.appendChild(style);
  }

  function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function shouldTranslateText(text) {
    const normalized = normalizeWhitespace(text);
    const meaningfulChars = normalized.replace(/[\s\p{P}\p{S}]/gu, '');

    return meaningfulChars.length >= 2;
  }

  function isOwnNode(element) {
    return Boolean(element && element.closest && element.closest(`[${ROOT_ATTR}]`));
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

  function hasNestedBlocks(element) {
    if (!element || element.tagName !== 'DIV') {
      return false;
    }

    return Boolean(element.querySelector(NESTED_BLOCK_SELECTOR));
  }

  function isCandidateElement(element) {
    if (!element || isOwnNode(element) || !isVisible(element)) {
      return false;
    }

    const tagName = element.tagName;

    if (tagName === 'DIV') {
      const text = normalizeWhitespace(element.innerText);

      if (text.length < 80 || hasNestedBlocks(element)) {
        return false;
      }
    }

    const text = normalizeWhitespace(element.innerText);

    return shouldTranslateText(text);
  }

  function collectPageItems() {
    ensureStyles();

    const elements = Array.from(document.body.querySelectorAll(CANDIDATE_SELECTOR));
    const items = [];
    let counter = 0;

    for (const element of elements) {
      if (!isCandidateElement(element)) {
        continue;
      }

      const noteSibling = element.nextElementSibling;

      if (noteSibling && noteSibling.matches(`[${NOTE_ATTR}]`)) {
        noteSibling.remove();
      }

      const itemId = element.getAttribute(SOURCE_ATTR) || `ot-${++counter}`;
      element.setAttribute(SOURCE_ATTR, itemId);
      items.push({
        id: itemId,
        text: normalizeWhitespace(element.innerText)
      });
    }

    return items;
  }

  function buildNote(id, translation, targetLanguage, headingText) {
    const note = document.createElement('div');
    const header = document.createElement('div');
    const body = document.createElement('div');

    note.setAttribute(ROOT_ATTR, 'note');
    note.setAttribute(NOTE_ATTR, id);
    header.setAttribute(ROOT_ATTR, 'note-header');
    body.setAttribute(ROOT_ATTR, 'note-body');
    header.textContent = headingText || `Translation · ${targetLanguage}`;
    body.textContent = translation;
    note.appendChild(header);
    note.appendChild(body);

    return note;
  }

  function renderPageTranslations(payload) {
    ensureStyles();

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

      const existingNote = element.nextElementSibling;
      const note =
        existingNote && existingNote.getAttribute(NOTE_ATTR) === id
          ? existingNote
          : buildNote(id, translation, payload.targetLanguage);

      note.querySelector(`[${ROOT_ATTR}="note-header"]`).textContent =
        `Translation · ${payload.targetLanguage}`;
      note.querySelector(`[${ROOT_ATTR}="note-body"]`).textContent = translation;

      if (!existingNote || existingNote !== note) {
        element.insertAdjacentElement('afterend', note);
      }

      rendered += 1;
    }

    return { rendered };
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

    return element.closest(CANDIDATE_SELECTOR) || element.closest('p, div, li, article, section');
  }

  function renderSelectionTranslation(payload) {
    ensureStyles();

    const container = findSelectionContainer();

    if (!container || isOwnNode(container)) {
      showToast(payload.translation, 'success', 12000);
      return { rendered: 'toast' };
    }

    const existingNote =
      container.nextElementSibling &&
      container.nextElementSibling.getAttribute(NOTE_ATTR) === SELECTED_NOTE_ID
        ? container.nextElementSibling
        : null;
    const note = existingNote || buildNote(
      SELECTED_NOTE_ID,
      payload.translation,
      payload.targetLanguage,
      `Selected text · ${payload.targetLanguage}`
    );

    note.querySelector(`[${ROOT_ATTR}="note-header"]`).textContent =
      `Selected text · ${payload.targetLanguage}`;
    note.querySelector(`[${ROOT_ATTR}="note-body"]`).textContent = payload.translation;

    if (!existingNote) {
      container.insertAdjacentElement('afterend', note);
    }

    return { rendered: 'inline' };
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
      sendResponse({ ok: true, items: collectPageItems() });
      return;
    }

    if (message.type === 'render-page-translations') {
      sendResponse({
        ok: true,
        ...renderPageTranslations(message.payload || {})
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

    if (message.type === 'show-toast') {
      const payload = message.payload || {};
      showToast(payload.message || '', payload.level || 'info');
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  });
})();
