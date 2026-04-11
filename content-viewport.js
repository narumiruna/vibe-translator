(function (root) {
  const DEFAULT_PREFETCH_VIEWPORTS = 1;
  const DEFAULT_TOP_MARGIN = 96;

  function normalizeViewportOptions(options) {
    const viewportHeight = Math.max(0, Number(options && options.viewportHeight) || 0);
    const prefetchViewports = Math.max(
      0,
      Number(options && options.prefetchViewports) || DEFAULT_PREFETCH_VIEWPORTS
    );
    const topMargin = Math.max(0, Number(options && options.topMargin) || DEFAULT_TOP_MARGIN);

    return {
      viewportHeight,
      prefetchViewports,
      topMargin
    };
  }

  function isRectWithinTranslationWindow(rect, options) {
    if (!rect) {
      return false;
    }

    const normalized = normalizeViewportOptions(options);
    const maxTop = normalized.viewportHeight * (1 + normalized.prefetchViewports);

    return Number(rect.bottom) >= -normalized.topMargin && Number(rect.top) <= maxTop;
  }

  function sortByViewportPosition(items) {
    return [...(items || [])].sort((left, right) => {
      if (left.rect.top !== right.rect.top) {
        return left.rect.top - right.rect.top;
      }

      return left.rect.bottom - right.rect.bottom;
    });
  }

  function selectWindowCandidates(items, options) {
    const filtered = (items || []).filter((item) =>
      isRectWithinTranslationWindow(item.rect, options)
    );

    return sortByViewportPosition(filtered);
  }

  const api = {
    DEFAULT_PREFETCH_VIEWPORTS,
    DEFAULT_TOP_MARGIN,
    isRectWithinTranslationWindow,
    normalizeViewportOptions,
    selectWindowCandidates,
    sortByViewportPosition
  };

  root.TranslatorContentViewport = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
