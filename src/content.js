const TranslatorContentModule = (() => {
	if (window.__OPENAI_TRANSLATOR_CONTENT__) {
		return;
	}

	window.__OPENAI_TRANSLATOR_CONTENT__ = true;

	const SOURCE_ATTR = "data-ot-source-id";
	const NOTE_ATTR = "data-ot-note-id";
	const STALE_ATTR = "data-ot-source-stale";
	const TRANSLATED_ATTR = "data-ot-translated";
	const PROCESSED_ATTR = "data-translated";
	const QUEUED_ATTR = "data-ot-queued";
	const ROOT_ATTR = "data-ot-role";
	const STYLE_ID = "ot-translator-style";
	const PROSE_BLOCK_ATTR = "data-ot-prose-block";
	const PROSE_SPLIT_ATTR = "data-ot-prose-split";
	const PREFETCH_VIEWPORTS = 2;
	const VISIBLE_TRANSLATION_FLUSH_DELAY_MS = 200;
	const OBSERVER_DEBOUNCE_MS = 200;
	const SCROLL_LISTENER_OPTIONS = Object.freeze({
		capture: true,
		passive: true,
	});
	const ExtractionApi = window.TranslatorContentExtraction;
	const {
		ACTIVE_SITE_PROFILE,
		ARTICLE_CONTENT_SELECTOR,
		DIRECT_NOTE_TARGET_SELECTOR,
		HEADING_SELECTOR,
		INLINE_CODE_SELECTOR,
		MAIN_CONTENT_SELECTOR,
		MATH_SELECTOR,
		PROSE_TEXT_BLOCK_SELECTOR,
		READABLE_BLOCK_SELECTOR,
		SEMANTIC_BLOCK_SELECTOR,
		SITE_PROFILE_ID,
		SITE_PROFILE_WINDOWED,
		SITE_ROOT_SELECTOR,
		SKIP_ANCESTOR_SELECTOR,
		SPLIT_PROSE_CONTAINER_SELECTOR,
		SOCIAL_TEXT_BLOCK_SELECTOR,
		TERMINAL_LIKE_SELECTOR,
		TITLE_LIKE_SELECTOR,
		UNSUPPORTED_ANCESTOR_SELECTOR,
		UNSUPPORTED_ELEMENT_SELECTOR,
	} = ExtractionApi;
	const SubtitleApi =
		window.TranslatorContentSubtitles ||
		(typeof module !== "undefined" && module.exports
			? require("./content-subtitles.js")
			: null);
	const YoutubeDiagnosticsApi =
		window.TranslatorYoutubeDiagnostics ||
		(typeof module !== "undefined" && module.exports
			? require("./youtube-diagnostics.js")
			: null);

	if (!SubtitleApi) {
		throw new Error("TranslatorContentSubtitles must load before content.js.");
	}

	if (!YoutubeDiagnosticsApi) {
		throw new Error(
			"TranslatorYoutubeDiagnostics must load before content.js.",
		);
	}
	const AppearanceApi =
		window.TranslatorAppearance ||
		(typeof module !== "undefined" && module.exports
			? require("./translation-appearance.js")
			: null);

	if (!AppearanceApi) {
		throw new Error("TranslatorAppearance must load before content.js.");
	}
	const SELECTION_PANEL_COMPACT_MAX_BODY_HEIGHT = 132;
	const SELECTION_PANEL_EXPANDED_MAX_BODY_HEIGHT = 320;
	const PROTECTED_PLACEHOLDER_REGEX = /__OT_(?:TOKEN|MATH)_\d+__/g;
	let observerStarted = false;
	let pageObserver = null;
	let observerFlushTimer = null;
	let staleFlushTimer = null;
	let visibleTranslationFlushTimer = null;
	let sourceIdCounter = null;
	let sourceTextSnapshots = new WeakMap();
	const pendingStaleSources = new Set();
	const pendingObserverMutations = [];
	const ViewportApi = window.TranslatorContentViewport || {
		DEFAULT_PREFETCH_VIEWPORTS: 2,
		DEFAULT_TOP_MARGIN: 96,
		normalizeViewportOptions(options) {
			const normalizeNumberOption = (value, fallback) => {
				const numeric = Number(value);

				return Number.isFinite(numeric) ? numeric : fallback;
			};
			const prefetchViewports = Math.max(
				0,
				normalizeNumberOption(options?.prefetchViewports, PREFETCH_VIEWPORTS),
			);

			return {
				viewportHeight: Math.max(
					0,
					normalizeNumberOption(options?.viewportHeight, 0),
				),
				prefetchViewports,
				topPrefetchViewports: Math.max(
					0,
					normalizeNumberOption(
						options?.topPrefetchViewports,
						prefetchViewports,
					),
				),
				topMargin: Math.max(0, normalizeNumberOption(options?.topMargin, 96)),
			};
		},
		isRectWithinTranslationWindow(rect, options) {
			const normalized = this.normalizeViewportOptions(options);
			const minBottom =
				-normalized.topMargin -
				normalized.viewportHeight * normalized.topPrefetchViewports;

			return (
				rect &&
				Number(rect.bottom) >= minBottom &&
				Number(rect.top) <=
					normalized.viewportHeight * (1 + normalized.prefetchViewports)
			);
		},
		selectWindowCandidates(items, options) {
			return [...(items || [])]
				.filter((item) =>
					this.isRectWithinTranslationWindow(item.rect, options),
				)
				.sort((left, right) => left.rect.top - right.rect.top);
		},
		getTranslationWindowPriority(rect, options) {
			const normalized = this.normalizeViewportOptions(options);
			const viewportHeight = normalized.viewportHeight;
			const top = Number(rect?.top) || 0;
			const bottom = Number(rect?.bottom) || 0;

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
		},
	};
	const pageState = {
		pageTranslation: {
			active: false,
			sessionId: "",
		},
		youtubeControl: {
			button: null,
			captionCheckTimer: null,
			observer: null,
			scheduled: false,
			state: "idle",
			videoKey: "",
		},
		youtubeDiagnostics: {
			panel: null,
			status: "Ready",
			store: YoutubeDiagnosticsApi.createDiagnosticStore(),
		},
		translationAppearance: AppearanceApi.normalizeTranslationAppearance(),
		debug: {
			enabled: false,
		},
	};

	function isDebugInfoEnabled() {
		return Boolean(pageState.debug.enabled);
	}

	function estimateTextTokens(text) {
		if (
			window.TranslatorApi &&
			typeof window.TranslatorApi.estimateTokenCount === "function"
		) {
			return window.TranslatorApi.estimateTokenCount(text);
		}

		const normalized = String(text || "").trim();

		return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
	}

	function normalizeSelectionAnchorRect(rect) {
		if (!rect || typeof rect !== "object") {
			return null;
		}

		const top = Number(rect.top);
		const right = Number(rect.right);
		const bottom = Number(rect.bottom);
		const left = Number(rect.left);
		const width = Number(rect.width);
		const height = Number(rect.height);

		if (
			![top, right, bottom, left, width, height].every((value) =>
				Number.isFinite(value),
			)
		) {
			return null;
		}

		return {
			top,
			right,
			bottom,
			left,
			width,
			height,
		};
	}

	function serializeDomRect(rect) {
		if (!rect) {
			return null;
		}

		return normalizeSelectionAnchorRect({
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			left: rect.left,
			width: rect.width,
			height: rect.height,
		});
	}

	function getSelectionAnchorRect() {
		const selection =
			typeof window.getSelection === "function" ? window.getSelection() : null;

		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
			return null;
		}

		const range = selection.getRangeAt(0).cloneRange();
		const rangeRect = serializeDomRect(range.getBoundingClientRect());

		if (rangeRect && (rangeRect.width > 0 || rangeRect.height > 0)) {
			return rangeRect;
		}

		const clientRects = Array.from(range.getClientRects())
			.map((rect) => serializeDomRect(rect))
			.filter((rect) => rect && (rect.width > 0 || rect.height > 0));

		if (clientRects.length > 0) {
			const top = Math.min(...clientRects.map((rect) => rect.top));
			const right = Math.max(...clientRects.map((rect) => rect.right));
			const bottom = Math.max(...clientRects.map((rect) => rect.bottom));
			const left = Math.min(...clientRects.map((rect) => rect.left));

			return {
				top,
				right,
				bottom,
				left,
				width: Math.max(0, right - left),
				height: Math.max(0, bottom - top),
			};
		}

		const anchorElement =
			selection.anchorNode instanceof Element
				? selection.anchorNode
				: selection.anchorNode?.parentElement || null;

		return serializeDomRect(anchorElement?.getBoundingClientRect?.());
	}

	function getDebugNodeLabel(element) {
		if (!element?.tagName) {
			return "unknown";
		}

		const tagName = element.tagName.toLowerCase();
		const id = element.id ? `#${element.id}` : "";
		const classNames = Array.from(element.classList || [])
			.slice(0, 2)
			.map((name) => `.${name}`)
			.join("");

		return `${tagName}${id}${classNames}`;
	}

	function createExtractionDebugState() {
		return {
			profileId: SITE_PROFILE_ID || "default",
			selectedItems: [],
			skippedByReason: new Map(),
			skippedSamples: [],
		};
	}

	function recordExtractionDebugSkip(debugState, reason, element) {
		if (!debugState || !reason) {
			return;
		}

		debugState.skippedByReason.set(
			reason,
			(debugState.skippedByReason.get(reason) || 0) + 1,
		);

		if (debugState.skippedSamples.length >= 6) {
			return;
		}

		debugState.skippedSamples.push({
			reason,
			node: getDebugNodeLabel(element),
		});
	}

	function recordExtractionDebugSelect(debugState, item) {
		if (!debugState || !item) {
			return;
		}

		debugState.selectedItems.push({
			id: item.id,
			kind: item.kind,
			tokenCount: estimateTextTokens(item.text),
			containsMath: Boolean(item.containsMath),
		});
	}

	function finalizeExtractionDebug(debugState) {
		if (!debugState) {
			return null;
		}

		return {
			profileId: debugState.profileId || "default",
			selectedItems: debugState.selectedItems,
			skippedByReason: Array.from(debugState.skippedByReason.entries())
				.sort((left, right) => right[1] - left[1])
				.map(([reason, count]) => ({ reason, count })),
			skippedSamples: debugState.skippedSamples,
		};
	}

	function ensureStyles(appearance) {
		if (appearance) {
			pageState.translationAppearance =
				AppearanceApi.normalizeTranslationAppearance(appearance);
		}

		const resolvedAppearance = pageState.translationAppearance;
		const inlineAppearance = resolvedAppearance.inline;
		const selectionAppearance = resolvedAppearance.selection;
		const inlineBackground = inlineAppearance.showBackground
			? inlineAppearance.light.backgroundColor
			: "transparent";
		const inlineDarkBackground = inlineAppearance.showBackground
			? inlineAppearance.dark.backgroundColor
			: "transparent";
		const fadeAnimation = inlineAppearance.enableFadeAnimation
			? "ot-fade-in 0.18s ease forwards"
			: "none";
		const selectionLightBackground = AppearanceApi.hexToRgbaColor(
			selectionAppearance.light.surfaceColor,
			selectionAppearance.surfaceOpacityPercent,
		);
		const selectionDarkBackground = AppearanceApi.hexToRgbaColor(
			selectionAppearance.dark.surfaceColor,
			selectionAppearance.surfaceOpacityPercent,
		);
		const selectionLightAccentSoft = AppearanceApi.hexToRgbaColor(
			selectionAppearance.light.accentColor,
			10,
		);
		const selectionLightAccentHover = AppearanceApi.hexToRgbaColor(
			selectionAppearance.light.accentColor,
			16,
		);
		const selectionDarkAccentSoft = AppearanceApi.hexToRgbaColor(
			selectionAppearance.dark.accentColor,
			16,
		);
		const selectionLightAccentText = AppearanceApi.getContrastingTextColor(
			selectionAppearance.light.accentColor,
		);
		const selectionDarkAccentText = AppearanceApi.getContrastingTextColor(
			selectionAppearance.dark.accentColor,
		);
		let style = document.getElementById(STYLE_ID);

		if (!style) {
			style = document.createElement("style");
			style.id = STYLE_ID;
			document.documentElement.appendChild(style);
		}

		style.textContent = `
      .translation[${ROOT_ATTR}="note"] {
        all: initial;
        display: block;
        box-sizing: border-box;
        contain: layout style paint;
        isolation: isolate;
        transform: none;
        filter: none;
        backdrop-filter: none;
        mix-blend-mode: normal;
        overflow: visible;
        float: none;
        clear: both;
        width: min(100%, ${inlineAppearance.maxWidthPx}px);
        max-width: 100%;
        margin: ${inlineAppearance.marginTopPx}px 0 ${inlineAppearance.marginBottomPx}px;
        padding: ${inlineAppearance.paddingVerticalPx}px ${inlineAppearance.paddingHorizontalPx}px;
        border: 0;
        border-left: ${inlineAppearance.accentWidthPx}px solid ${inlineAppearance.light.accentColor};
        border-radius: 0 ${inlineAppearance.borderRadiusPx}px ${inlineAppearance.borderRadiusPx}px 0;
        font-family: ${AppearanceApi.FONT_FAMILY_STACKS[inlineAppearance.fontFamily]};
        font-size: ${inlineAppearance.fontSizePx}px;
        font-weight: ${inlineAppearance.fontWeight};
        line-height: ${inlineAppearance.lineHeight};
        letter-spacing: 0.008em;
        color: ${inlineAppearance.light.textColor};
        text-align: start;
        background: ${inlineBackground};
        position: static;
      }

      .translation[${ROOT_ATTR}="note"][data-phase="ready"] {
        animation: ${fadeAnimation};
      }

      .ot-youtube-translate-button {
        color: #ffffff;
      }

      .ot-youtube-translate-button svg {
        display: block;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 10px;
      }

      .ot-youtube-translate-button[data-state="active"] {
        color: #61b8ff;
      }

      .ot-youtube-translate-button[data-state="loading"] {
        color: #d2e9ff;
        cursor: progress;
        opacity: 0.8;
      }

      .ot-youtube-translate-button[data-state="loading"] svg {
        animation: ot-control-pulse 0.9s ease-in-out infinite alternate;
      }

      .ot-youtube-translate-button[data-state="error"] {
        color: #ff8a80;
      }

      [${ROOT_ATTR}="youtube-diagnostics"] {
        position: absolute;
        z-index: 80;
        right: 12px;
        bottom: 56px;
        box-sizing: border-box;
        width: min(390px, calc(100% - 24px));
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: #f5f5f5;
        background: rgba(12, 12, 14, 0.94);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        font: 13px/1.45 Roboto, Arial, sans-serif;
        pointer-events: auto;
      }

      [${ROOT_ATTR}="youtube-diagnostics"] strong,
      [${ROOT_ATTR}="youtube-diagnostics"] span {
        display: block;
      }

      [${ROOT_ATTR}="youtube-diagnostics"] [data-ot-diagnostic-status] {
        margin: 4px 0 10px;
        color: #b9ddff;
      }

      [${ROOT_ATTR}="youtube-diagnostics"] pre {
        max-height: 190px;
        margin: 0 0 10px;
        overflow: auto;
        color: #d7d7dc;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      [${ROOT_ATTR}="youtube-diagnostics"] button {
        min-width: 44px;
        min-height: 32px;
        margin-right: 8px;
        padding: 5px 10px;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 5px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
      }

      [data-ot-subtitle-replaced="true"] {
        display: none !important;
      }

      .translation[${ROOT_ATTR}="note"][data-ot-presentation="subtitle"] {
        display: block;
        width: max-content;
        max-width: min(88vw, 100%);
        margin: 0 auto;
        padding: 0.08em 0.34em 0.14em;
        border: 0;
        border-radius: 3px;
        font-family: "YouTube Noto", Roboto, Arial, sans-serif;
        font-size: var(--ot-subtitle-font-size, clamp(16px, 2.1vw, 32px));
        font-weight: 500;
        line-height: 1.25;
        letter-spacing: normal;
        color: #ffe082;
        text-align: center;
        background: rgba(8, 8, 8, 0.78);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.92);
        animation: none;
        pointer-events: none;
      }

      .translation[${ROOT_ATTR}="note"][data-ot-presentation="subtitle"] [${ROOT_ATTR}="note-label"] {
        display: none;
      }

      .translation[${ROOT_ATTR}="note"][data-ot-presentation="subtitle"] [${ROOT_ATTR}="note-body"] {
        text-align: center;
        white-space: pre-wrap;
        overflow-wrap: break-word;
      }

      .translation[${ROOT_ATTR}="note"][data-stale="true"] {
        opacity: 0.48;
        filter: grayscale(0.2);
      }

      @media (prefers-color-scheme: dark) {
        .translation[${ROOT_ATTR}="note"] {
          border-left-color: ${inlineAppearance.dark.accentColor};
          color: ${inlineAppearance.dark.textColor};
          background: ${inlineDarkBackground};
        }
      }

      .translation [${ROOT_ATTR}="note-label"] {
        all: initial;
        display: ${inlineAppearance.showLabel ? "block" : "none"};
        margin: 0 0 0.4rem;
        color: ${inlineAppearance.light.labelColor};
        font: 600 0.6875rem/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        letter-spacing: 0.06em;
      }

      @media (prefers-color-scheme: dark) {
        .translation [${ROOT_ATTR}="note-label"] {
          color: ${inlineAppearance.dark.labelColor};
        }
      }

      .translation [${ROOT_ATTR}="note-body"] {
        all: initial;
        display: block;
        max-width: 100%;
        margin: 0;
        padding: 0;
        font: inherit;
        color: inherit;
        opacity: 1;
        text-decoration: none;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: normal;
        hyphens: auto;
      }

      .translation [${ROOT_ATTR}="note-body"][data-state="pending"] {
        min-height: 1.2em;
        color: transparent;
        border-radius: 6px;
        text-decoration: none;
        background:
          linear-gradient(
            90deg,
            rgba(79, 125, 98, 0.08) 0%,
            rgba(255, 255, 255, 0.76) 50%,
            rgba(79, 125, 98, 0.08) 100%
          );
        background-size: 200% 100%;
        animation: ot-shimmer 1.2s linear infinite;
      }

      .translation [${ROOT_ATTR}="note-body"] code {
        all: initial;
        display: inline;
        padding: 0.08em 0.34em;
        border-radius: 5px;
        background: rgba(60, 60, 67, 0.08);
        color: #3a3a3c;
        text-decoration: none;
        font: 0.92em/1.4 ui-monospace, "SF Mono", "SFMono-Regular", Menlo, monospace;
      }

      @media (prefers-color-scheme: dark) {
        .translation [${ROOT_ATTR}="note-body"] code {
          background: rgba(255, 255, 255, 0.11);
          color: #f2f2f7;
        }
      }

      [${ROOT_ATTR}="toast-layer"] {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0 0 1rem;
      }

      [${ROOT_ATTR}="toast"] {
        max-width: min(100%, 32rem);
        padding: 11px 14px;
        border-radius: 12px;
        background: rgba(44, 44, 46, 0.95);
        color: #f5f5f7;
        font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      [${ROOT_ATTR}="toast"][data-level="success"] {
        background: rgba(52, 199, 89, 0.9);
        color: #ffffff;
      }

      [${ROOT_ATTR}="toast"][data-level="error"] {
        background: rgba(255, 59, 48, 0.92);
        color: #ffffff;
      }

      .translation[${ROOT_ATTR}="selection-panel"] {
        all: initial;
        box-sizing: border-box;
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: block;
        width: min(${selectionAppearance.widthPx}px, calc(100vw - 24px));
        max-width: min(${selectionAppearance.widthPx}px, calc(100vw - 24px));
        padding: 14px;
        overflow: hidden;
        border: 1px solid rgba(60, 60, 67, 0.12);
        border-radius: ${selectionAppearance.borderRadiusPx}px;
        background: ${selectionLightBackground};
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08), 0 18px 52px rgba(0, 0, 0, 0.14);
        color: ${selectionAppearance.light.textColor};
        font: 400 ${selectionAppearance.fontSizePx}px/${selectionAppearance.lineHeight} -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
        text-align: start;
        color-scheme: light dark;
        isolation: isolate;
        backdrop-filter: blur(24px) saturate(1.15);
        -webkit-backdrop-filter: blur(24px) saturate(1.15);
        animation: ot-panel-in 0.16s ease-out;
      }

      .translation[${ROOT_ATTR}="selection-panel"] *,
      .translation[${ROOT_ATTR}="selection-panel"] *::before,
      .translation[${ROOT_ATTR}="selection-panel"] *::after {
        box-sizing: border-box;
      }

      .translation[${ROOT_ATTR}="selection-panel"] [hidden] {
        display: none !important;
      }

      @media (prefers-color-scheme: dark) {
        .translation[${ROOT_ATTR}="selection-panel"] {
          background: ${selectionDarkBackground};
          border-color: rgba(255, 255, 255, 0.11);
          color: ${selectionAppearance.dark.textColor};
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.34), 0 20px 56px rgba(0, 0, 0, 0.44);
        }
      }

      .translation [${ROOT_ATTR}="selection-panel-header"] {
        all: initial;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-width: 0;
        margin: 0 0 12px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
      }

      .translation [${ROOT_ATTR}="selection-panel-identity"] {
        all: initial;
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: 7px;
        min-width: 0;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
      }

      .translation [${ROOT_ATTR}="selection-panel-icon"] {
        all: initial;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: ${selectionLightAccentSoft};
        color: ${selectionAppearance.light.accentColor};
        font: 650 12px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      }

      .translation [${ROOT_ATTR}="selection-panel-title"] {
        all: initial;
        flex: 0 1 auto;
        min-width: 0;
        margin: 0;
        color: ${selectionAppearance.light.textColor};
        font: 650 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        letter-spacing: -0.01em;
      }

      .translation [${ROOT_ATTR}="selection-panel-language"] {
        all: initial;
        display: inline-flex;
        flex: 0 1 auto;
        align-items: center;
        min-width: 0;
        padding: 4px 7px;
        border: 1px solid rgba(60, 60, 67, 0.1);
        border-radius: 999px;
        background: rgba(60, 60, 67, 0.055);
        color: ${selectionAppearance.light.textColor};
        font: 550 11px/1.25 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
        overflow-wrap: anywhere;
      }

      .translation [${ROOT_ATTR}="selection-panel-close"] {
        all: initial;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        margin: -2px -3px -2px 0;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: #6c6c70;
        cursor: pointer;
        font: 450 19px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        transition: background 0.14s ease, color 0.14s ease;
      }

      .translation [${ROOT_ATTR}="selection-panel-close"]:hover {
        background: rgba(60, 60, 67, 0.09);
        color: #2c2c2e;
      }

      .translation [${ROOT_ATTR}="selection-panel-close"]:focus-visible,
      .translation [${ROOT_ATTR}="selection-panel-expand"]:focus-visible,
      .translation [${ROOT_ATTR}="selection-panel-retry"]:focus-visible {
        outline: 3px solid ${selectionLightAccentSoft};
        outline-offset: 2px;
      }

      .translation [${ROOT_ATTR}="selection-panel-body"] {
        all: initial;
        display: block;
        max-height: ${SELECTION_PANEL_COMPACT_MAX_BODY_HEIGHT}px;
        overflow: auto;
        margin: 0;
        padding: 0 2px 0 0;
        color: ${selectionAppearance.light.textColor};
        font: 400 ${selectionAppearance.fontSizePx}px/${selectionAppearance.lineHeight} -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: normal;
        text-decoration: none;
        scrollbar-width: thin;
      }

      .translation[${ROOT_ATTR}="selection-panel"][data-expanded="true"] [${ROOT_ATTR}="selection-panel-body"] {
        max-height: min(${SELECTION_PANEL_EXPANDED_MAX_BODY_HEIGHT}px, calc(100vh - 120px));
      }

      .translation [${ROOT_ATTR}="selection-panel-status"] {
        all: initial;
        display: block;
        margin: 0 0 11px;
        color: ${selectionAppearance.light.textColor};
        font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
        opacity: 0.72;
      }

      .translation [${ROOT_ATTR}="selection-panel-skeleton"] {
        all: initial;
        display: grid;
        gap: 8px;
      }

      .translation [${ROOT_ATTR}="selection-panel-skeleton"] > span {
        all: initial;
        display: block;
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(60, 60, 67, 0.07) 0%, rgba(255, 255, 255, 0.72) 50%, rgba(60, 60, 67, 0.07) 100%);
        background-size: 200% 100%;
        animation: ot-shimmer 1.2s linear infinite;
      }

      .translation [${ROOT_ATTR}="selection-panel-skeleton"] > span:nth-child(2) {
        width: 88%;
      }

      .translation [${ROOT_ATTR}="selection-panel-skeleton"] > span:nth-child(3) {
        width: 64%;
      }

      .translation [${ROOT_ATTR}="selection-panel-error-message"] {
        all: initial;
        display: block;
        margin: 0;
        color: ${selectionAppearance.light.textColor};
        font: 400 ${selectionAppearance.fontSizePx}px/${selectionAppearance.lineHeight} -apple-system, BlinkMacSystemFont, "SF Pro Text", "Noto Sans TC", system-ui, sans-serif;
        overflow-wrap: anywhere;
      }

      .translation [${ROOT_ATTR}="selection-panel-footer"] {
        all: initial;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        margin: 12px 0 0;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      }

      .translation [${ROOT_ATTR}="selection-panel-expand"],
      .translation [${ROOT_ATTR}="selection-panel-retry"] {
        all: initial;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 6px 10px;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font: 620 12px/1.3 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      }

      .translation [${ROOT_ATTR}="selection-panel-expand"] {
        background: ${selectionLightAccentSoft};
        color: ${selectionAppearance.light.textColor};
      }

      .translation [${ROOT_ATTR}="selection-panel-expand"]:hover {
        background: ${selectionLightAccentHover};
      }

      .translation [${ROOT_ATTR}="selection-panel-retry"] {
        background: ${selectionAppearance.light.accentColor};
        color: ${selectionLightAccentText};
      }

      .translation [${ROOT_ATTR}="selection-panel-retry"]:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .translation [${ROOT_ATTR}="selection-panel-body"] code {
        all: initial;
        display: inline;
        padding: 0.08em 0.34em;
        border-radius: 5px;
        background: rgba(60, 60, 67, 0.08);
        color: #3a3a3c;
        text-decoration: none;
        font: 0.92em/1.4 ui-monospace, "SF Mono", "SFMono-Regular", Menlo, monospace;
      }

      @media (prefers-color-scheme: dark) {
        .translation [${ROOT_ATTR}="selection-panel-icon"],
        .translation [${ROOT_ATTR}="selection-panel-expand"] {
          background: ${selectionDarkAccentSoft};
        }

        .translation [${ROOT_ATTR}="selection-panel-icon"] {
          color: ${selectionAppearance.dark.accentColor};
        }

        .translation [${ROOT_ATTR}="selection-panel-expand"] {
          color: ${selectionAppearance.dark.textColor};
        }

        .translation [${ROOT_ATTR}="selection-panel-title"],
        .translation [${ROOT_ATTR}="selection-panel-language"],
        .translation [${ROOT_ATTR}="selection-panel-body"],
        .translation [${ROOT_ATTR}="selection-panel-status"],
        .translation [${ROOT_ATTR}="selection-panel-error-message"] {
          color: ${selectionAppearance.dark.textColor};
        }

        .translation [${ROOT_ATTR}="selection-panel-language"] {
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.07);
        }

        .translation [${ROOT_ATTR}="selection-panel-close"] {
          color: #aeaeb2;
        }

        .translation [${ROOT_ATTR}="selection-panel-close"]:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f2f2f7;
        }

        .translation [${ROOT_ATTR}="selection-panel-close"]:focus-visible,
        .translation [${ROOT_ATTR}="selection-panel-expand"]:focus-visible,
        .translation [${ROOT_ATTR}="selection-panel-retry"]:focus-visible {
          outline-color: ${selectionDarkAccentSoft};
        }

        .translation [${ROOT_ATTR}="selection-panel-retry"] {
          background: ${selectionAppearance.dark.accentColor};
          color: ${selectionDarkAccentText};
        }

        .translation [${ROOT_ATTR}="selection-panel-body"] code {
          background: rgba(255, 255, 255, 0.11);
          color: #f2f2f7;
        }
      }

      @media (pointer: coarse) {
        .translation [${ROOT_ATTR}="selection-panel-close"] {
          width: 44px;
          height: 44px;
          margin-block: -8px;
        }

        .translation [${ROOT_ATTR}="selection-panel-expand"],
        .translation [${ROOT_ATTR}="selection-panel-retry"] {
          min-height: 44px;
        }
      }

      .translation[${ROOT_ATTR}="debug-panel"] {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(420px, calc(100vw - 24px));
        max-height: min(44vh, 28rem);
        overflow: auto;
        padding: 12px 14px 14px;
        border: 1px solid rgba(60, 60, 67, 0.12);
        border-radius: 14px;
        background: rgba(242, 242, 247, 0.97);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 16px 48px rgba(0, 0, 0, 0.1);
        color: #1c1c1e;
        font: 400 12px/1.5 ui-monospace, "SF Mono", "SFMono-Regular", Menlo, monospace;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      @media (prefers-color-scheme: dark) {
        .translation[${ROOT_ATTR}="debug-panel"] {
          background: rgba(28, 28, 30, 0.97);
          border-color: rgba(255, 255, 255, 0.1);
          color: #f5f5f7;
        }
      }

      .translation [${ROOT_ATTR}="debug-title"] {
        display: block;
        margin: 0 0 10px;
        color: #007aff;
        font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .translation [${ROOT_ATTR}="debug-section-title"] {
        display: block;
        margin: 12px 0 6px;
        color: #6c6c70;
        font-weight: 600;
      }

      .translation [${ROOT_ATTR}="debug-list"] {
        display: block;
        margin: 0;
        padding-left: 18px;
      }

      .translation [${ROOT_ATTR}="debug-list"] li {
        margin: 0 0 4px;
      }

      @media (max-width: 640px) {
        .translation[${ROOT_ATTR}="note"] {
          margin: min(${inlineAppearance.marginTopPx}px, 14px) 0 min(${inlineAppearance.marginBottomPx}px, 20px);
          padding: min(${inlineAppearance.paddingVerticalPx}px, 12px) min(${inlineAppearance.paddingHorizontalPx}px, 13px);
          border-radius: 0 min(${inlineAppearance.borderRadiusPx}px, 7px) min(${inlineAppearance.borderRadiusPx}px, 7px) 0;
        }

        .translation[${ROOT_ATTR}="selection-panel"] {
          right: 10px;
          left: 10px;
          bottom: 10px;
          width: auto;
          max-width: none;
        }

        .translation[${ROOT_ATTR}="debug-panel"] {
          right: 10px;
          left: 10px;
          bottom: 10px;
          width: auto;
          max-width: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .translation[${ROOT_ATTR}="note"][data-phase="ready"],
        .translation[${ROOT_ATTR}="selection-panel"],
        .ot-youtube-translate-button[data-state="loading"] svg,
        .translation [${ROOT_ATTR}="note-body"][data-state="pending"],
        .translation [${ROOT_ATTR}="selection-panel-skeleton"] > span {
          animation: none;
        }
      }

      @keyframes ot-control-pulse {
        from {
          opacity: 0.52;
          transform: scale(0.92);
        }

        to {
          opacity: 1;
          transform: scale(1);
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

      @keyframes ot-panel-in {
        from {
          opacity: 0;
          transform: translateY(3px) scale(0.99);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes ot-fade-in {
        from {
          opacity: 0;
          transform: translateY(4px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
	}

	function getYoutubeDiagnosticSnapshot() {
		return YoutubeDiagnosticsApi.collectYoutubeDiagnostics({
			document,
			extensionVersion: chrome.runtime.getManifest?.().version || "unknown",
			location: window.location,
			playerResponse: window.ytInitialPlayerResponse,
		});
	}

	function getYoutubeDiagnosticReport() {
		return YoutubeDiagnosticsApi.createDiagnosticReport(
			getYoutubeDiagnosticSnapshot(),
			pageState.youtubeDiagnostics.store.getEvents(),
		);
	}

	function closeYoutubeDiagnostics() {
		pageState.youtubeDiagnostics.panel?.remove();
		pageState.youtubeDiagnostics.panel = null;
	}

	async function copyYoutubeDiagnostics(button) {
		const report = getYoutubeDiagnosticReport();

		try {
			await navigator.clipboard.writeText(report);
			button.textContent = "Copied";
		} catch (_error) {
			button.textContent = "Copy failed";
		}
	}

	function renderYoutubeDiagnostics() {
		ensureStyles();
		const player = document.querySelector("#movie_player");

		if (!player) {
			return null;
		}

		let panel = pageState.youtubeDiagnostics.panel;

		if (!panel?.isConnected) {
			panel = document.createElement("aside");
			panel.setAttribute(ROOT_ATTR, "youtube-diagnostics");
			panel.setAttribute("aria-live", "polite");
			panel.setAttribute("aria-label", "Vibe Translator diagnostics");
			pageState.youtubeDiagnostics.panel = panel;
			player.appendChild(panel);
		}

		const title = document.createElement("strong");
		const status = document.createElement("span");
		const output = document.createElement("pre");
		const copyButton = document.createElement("button");
		const closeButton = document.createElement("button");

		title.textContent = "Vibe Translator diagnostics";
		status.setAttribute("data-ot-diagnostic-status", "");
		status.textContent = pageState.youtubeDiagnostics.status;
		output.textContent = getYoutubeDiagnosticReport();
		copyButton.type = "button";
		copyButton.textContent = "Copy diagnostics";
		copyButton.addEventListener("click", () => {
			copyYoutubeDiagnostics(copyButton);
		});
		closeButton.type = "button";
		closeButton.textContent = "Close";
		closeButton.addEventListener("click", closeYoutubeDiagnostics);
		panel.replaceChildren(title, status, output, copyButton, closeButton);

		return panel;
	}

	function recordYoutubeDiagnostic(stage, detail, options = {}) {
		pageState.youtubeDiagnostics.store.add(stage, detail);
		pageState.youtubeDiagnostics.status = detail || stage;

		if (options.show || pageState.youtubeDiagnostics.panel?.isConnected) {
			renderYoutubeDiagnostics();
		}
	}

	function applyYoutubeControlPresentation(button, presentation) {
		if (!button || !presentation) {
			return;
		}

		button.setAttribute("aria-label", presentation.title);
		button.setAttribute("aria-pressed", presentation.pressed || "false");
		button.setAttribute("data-state", presentation.state);
		button.setAttribute("data-tooltip-title", presentation.title);
		button.title = presentation.title;
		button.disabled = presentation.state === "loading";
		pageState.youtubeControl.button = button;
		pageState.youtubeControl.state = presentation.state;
	}

	function applyYoutubeControlState(button, state) {
		if (!button || !SubtitleApi?.resolvePlayerControlState) {
			return;
		}

		const resolved = SubtitleApi.resolvePlayerControlState(state);

		applyYoutubeControlPresentation(button, resolved);
	}

	function getYoutubeVideoKey() {
		const location = window.location;

		if (location.pathname === "/watch") {
			return new URLSearchParams(location.search).get("v") || "";
		}

		return /^\/shorts\/([^/]+)/u.exec(location.pathname)?.[1] || "";
	}

	function clearYoutubeCaptionCheck() {
		if (pageState.youtubeControl.captionCheckTimer) {
			window.clearTimeout(pageState.youtubeControl.captionCheckTimer);
			pageState.youtubeControl.captionCheckTimer = null;
		}
	}

	function showYoutubeCaptionUnavailable(button) {
		if (
			!button ||
			pageState.youtubeControl.button !== button ||
			pageState.youtubeControl.state !== "active" ||
			window.TranslatorYoutubePlayerControl?.getVisibleYoutubeCaptionText(
				document,
			)
		) {
			return;
		}

		const presentation = SubtitleApi.resolvePlayerControlError({
			error: "YouTube captions are not visible. Turn on CC and play the video",
		});
		applyYoutubeControlPresentation(button, presentation);
		recordYoutubeDiagnostic("caption-timeout", presentation.title, {
			show: true,
		});
	}

	function scheduleYoutubeCaptionCheck(button) {
		clearYoutubeCaptionCheck();
		pageState.youtubeControl.captionCheckTimer = window.setTimeout(() => {
			pageState.youtubeControl.captionCheckTimer = null;
			showYoutubeCaptionUnavailable(button);
		}, 4500);
	}

	async function handleYoutubeControlClick(_event, clickedButton) {
		const button = clickedButton || pageState.youtubeControl.button;

		if (!button) {
			return;
		}

		if (pageState.youtubeControl.state === "loading") {
			recordYoutubeDiagnostic(
				"duplicate-click",
				"Translation startup is already in progress",
				{ show: true },
			);
			return;
		}

		recordYoutubeDiagnostic("click", "Player button click received", {
			show: true,
		});
		applyYoutubeControlState(button, "loading");
		recordYoutubeDiagnostic("loading", "Contacting extension background");
		window.TranslatorYoutubePlayerControl?.turnOnNativeYoutubeCaptions(
			document.querySelector("#movie_player"),
			window.ytInitialPlayerResponse,
		);

		try {
			const response = await chrome.runtime.sendMessage(
				window.TranslatorMessages.startYoutubeSubtitleTranslation(),
			);

			if (!response?.ok) {
				const presentation = SubtitleApi.resolvePlayerControlError(response);
				applyYoutubeControlPresentation(button, presentation);
				recordYoutubeDiagnostic("background-error", presentation.title, {
					show: true,
				});

				if (presentation.openOptions) {
					await chrome.runtime.sendMessage(
						window.TranslatorMessages.openOptions(),
					);
				}

				return;
			}

			applyYoutubeControlState(button, "active");
			recordYoutubeDiagnostic(
				"active",
				`Translation session active; caption enabled=${Boolean(response.captions?.enabled)}; track found=${Boolean(response.captions?.hasTrack)}`,
			);
			scheduleYoutubeCaptionCheck(button);
		} catch (error) {
			const rawError = String(error?.message || "");
			const presentation = SubtitleApi.resolvePlayerControlError({
				error: rawError,
				openOptions:
					rawError.includes("message port closed") ||
					rawError.includes("Extension context invalidated"),
			});
			applyYoutubeControlPresentation(button, presentation);
			recordYoutubeDiagnostic("message-error", presentation.title, {
				show: true,
			});
		}
	}

	function mountYoutubeControl() {
		pageState.youtubeControl.scheduled = false;
		const controlApi = window.TranslatorYoutubePlayerControl;

		if (!document.getElementById(STYLE_ID)) {
			ensureStyles();
		}

		if (!controlApi) {
			return;
		}

		const videoKey = getYoutubeVideoKey();

		if (videoKey !== pageState.youtubeControl.videoKey) {
			pageState.youtubeControl.videoKey = videoKey;
			pageState.youtubeControl.state = "idle";
			pageState.youtubeDiagnostics.store.clear();
			pageState.youtubeDiagnostics.status = "Ready";
			closeYoutubeDiagnostics();
			pageState.pageTranslation.active = false;
			pageState.pageTranslation.sessionId = "";
		}

		const button = controlApi.mountYoutubePlayerControl({
			applyState: applyYoutubeControlState,
			document,
			location: window.location,
			onClick: handleYoutubeControlClick,
		});

		if (button) {
			applyYoutubeControlState(button, pageState.youtubeControl.state);
		}
	}

	function scheduleYoutubeControlMount() {
		if (pageState.youtubeControl.scheduled) {
			return;
		}

		pageState.youtubeControl.scheduled = true;
		window.setTimeout(mountYoutubeControl, 0);
	}

	function ensureYoutubeControl() {
		if (
			!window.TranslatorYoutubePlayerControl ||
			pageState.youtubeControl.observer ||
			!document.documentElement
		) {
			return;
		}

		pageState.youtubeControl.observer = new MutationObserver(
			scheduleYoutubeControlMount,
		);
		pageState.youtubeControl.observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		window.addEventListener("yt-navigate-finish", scheduleYoutubeControlMount);
		scheduleYoutubeControlMount();
	}

	function setSourceQueued(element, queued) {
		if (!element) {
			return;
		}

		element.setAttribute(QUEUED_ATTR, queued ? "true" : "false");
	}

	function setSourceTranslated(element, value) {
		if (!element) {
			return;
		}

		if (value) {
			element.setAttribute(TRANSLATED_ATTR, "true");
			element.setAttribute(PROCESSED_ATTR, "true");
			return;
		}

		element.removeAttribute(TRANSLATED_ATTR);
		element.removeAttribute(PROCESSED_ATTR);
	}

	function debugSkip(reason, element) {
		if (!isDebugInfoEnabled()) {
			return;
		}

		const tagName = element?.tagName
			? element.tagName.toLowerCase()
			: element && element.nodeType === Node.TEXT_NODE
				? "#text"
				: "unknown";

		console.debug(`[OpenAI Translator] Skipping ${tagName}: ${reason}`);
	}

	function debugSelect(reason, element) {
		if (!isDebugInfoEnabled()) {
			return;
		}

		const tagName = element?.tagName
			? element.tagName.toLowerCase()
			: "unknown";

		console.debug(`[OpenAI Translator] Selected ${tagName}: ${reason}`);
	}

	function isInsideTranslation(element) {
		return Boolean(element?.closest?.(`[${ROOT_ATTR}]`));
	}

	const isUnsupportedElement = ExtractionApi.isUnsupportedElement;
	const normalizeInlineWhitespace = ExtractionApi.normalizeInlineWhitespace;
	const normalizeSegmentText = ExtractionApi.normalizeSegmentText;

	function getRootCandidates() {
		const candidates = new Set();

		for (const element of document.querySelectorAll(MAIN_CONTENT_SELECTOR)) {
			candidates.add(element);
		}

		if (document.body) {
			candidates.add(document.body);
		}

		return Array.from(candidates);
	}

	function scoreTranslationRoot(element) {
		return ExtractionApi.scoreTranslationRoot(element, {
			document,
			isInsideTranslation,
			isTranslatorOwned,
		});
	}

	const detectContentMode = ExtractionApi.detectContentMode;

	function splitProseContainer(container) {
		if (!container || container.hasAttribute(PROSE_SPLIT_ATTR)) {
			return;
		}

		const originalNodes = Array.from(container.childNodes);
		const output = document.createDocumentFragment();
		let block = document.createElement("span");

		block.setAttribute(PROSE_BLOCK_ATTR, "");

		function flushBlock() {
			if (!normalizeSegmentText(block.textContent || "")) {
				return;
			}

			output.appendChild(block);
			block = document.createElement("span");
			block.setAttribute(PROSE_BLOCK_ATTR, "");
		}

		for (const node of originalNodes) {
			if (node.nodeType !== Node.TEXT_NODE) {
				block.appendChild(node);
				continue;
			}

			for (const part of String(node.textContent || "").split(
				/(\n[ \t]*\n+)/,
			)) {
				if (!part) {
					continue;
				}

				if (/^\n[ \t]*\n+$/u.test(part)) {
					flushBlock();
					output.appendChild(document.createTextNode(part));
					continue;
				}

				block.appendChild(document.createTextNode(part));
			}
		}

		flushBlock();
		container.replaceChildren(output);
		container.setAttribute(PROSE_SPLIT_ATTR, "true");
	}

	function prepareSplitProseContainers() {
		for (const container of document.querySelectorAll(
			SPLIT_PROSE_CONTAINER_SELECTOR,
		)) {
			splitProseContainer(container);
		}
	}

	function getTranslationProfile() {
		const siteRoot = document.querySelector(SITE_ROOT_SELECTOR);
		const requireSiteRoot = ACTIVE_SITE_PROFILE?.requireRoot === true;
		const candidates = siteRoot || requireSiteRoot ? [] : getRootCandidates();
		let root = siteRoot || (requireSiteRoot ? null : document.body);
		let bestScore = Number.NEGATIVE_INFINITY;
		let bestNonBodyRoot = null;
		let bestNonBodyScore = Number.NEGATIVE_INFINITY;

		for (const candidate of candidates) {
			const score = scoreTranslationRoot(candidate);

			if (score > bestScore) {
				bestScore = score;
				root = candidate;
			}

			if (candidate !== document.body && score > bestNonBodyScore) {
				bestNonBodyScore = score;
				bestNonBodyRoot = candidate;
			}
		}

		if (root === document.body && bestNonBodyRoot && bestNonBodyScore > 0) {
			root = bestNonBodyRoot;
			bestScore = bestNonBodyScore;
		}

		const mode = detectContentMode(root);
		const semanticCount = root
			? root.querySelectorAll(SEMANTIC_BLOCK_SELECTOR).length
			: 0;

		console.debug(
			`[OpenAI Translator] Using ${root?.tagName ? root.tagName.toLowerCase() : root ? "body" : "no"} root (${mode})`,
		);

		return {
			root,
			mode,
			allowFallback: semanticCount > 0,
			windowed: SITE_PROFILE_WINDOWED && mode !== "directory",
		};
	}

	function observePageMutations() {
		if (!pageObserver || !document.body) {
			return;
		}

		pageObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class", "style", "hidden", "aria-hidden"],
			childList: true,
			characterData: true,
			subtree: true,
		});
	}

	function withObserverPaused(callback) {
		if (!pageObserver || !document.body) {
			return callback();
		}

		pageObserver.disconnect();

		try {
			return callback();
		} finally {
			observePageMutations();
		}
	}

	function activatePageTranslationSession(sessionId) {
		pageState.pageTranslation.active = true;
		pageState.pageTranslation.sessionId = sessionId || "";
	}

	function isPageTranslationSessionActive() {
		return (
			pageState.pageTranslation.active &&
			Boolean(pageState.pageTranslation.sessionId)
		);
	}

	function shouldTranslateText(text) {
		const normalized = normalizeSegmentText(text).replace(
			PROTECTED_PLACEHOLDER_REGEX,
			" ",
		);
		const meaningfulChars = normalized.replace(/[\s\p{P}\p{S}]/gu, "");
		const minimumLength =
			SubtitleApi.getMeaningfulCharacterMinimum(ACTIVE_SITE_PROFILE);

		return meaningfulChars.length >= minimumLength;
	}

	function getHighestSourceIdCounter() {
		let highest = 0;

		for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
			const match = /^ot-(\d+)$/.exec(element.getAttribute(SOURCE_ATTR) || "");

			if (match) {
				highest = Math.max(highest, Number(match[1]) || 0);
			}
		}

		return highest;
	}

	function initializeSourceIdCounter() {
		if (sourceIdCounter !== null) {
			return;
		}

		sourceIdCounter = getHighestSourceIdCounter();
	}

	function allocateSourceId() {
		initializeSourceIdCounter();
		sourceIdCounter += 1;

		return `ot-${sourceIdCounter}`;
	}

	function resetSourceIdCounterForTest() {
		sourceIdCounter = null;
	}

	function rememberSourceText(element, text) {
		if (element) {
			sourceTextSnapshots.set(element, String(text || ""));
		}
	}

	function hasSourceTextChanged(element) {
		if (!element) {
			return false;
		}

		const previousText = sourceTextSnapshots.get(element);

		if (typeof previousText !== "string") {
			return true;
		}

		return getSegmentContent(element).text !== previousText;
	}

	function resetSourceTextSnapshotsForTest() {
		sourceTextSnapshots = new WeakMap();
	}

	function createProtectedPlaceholder(context, fragment) {
		if (!context || !fragment) {
			return "";
		}

		context.counter += 1;

		const placeholder = `__OT_MATH_${context.counter}__`;

		context.tokens.push({
			placeholder,
			preservePlaceholder: true,
			...fragment,
		});

		return placeholder;
	}

	function extractMathFragment(element) {
		if (!element?.matches) {
			return null;
		}

		const html =
			typeof element.outerHTML === "string" ? element.outerHTML.trim() : "";
		const text = normalizeSegmentText(element.textContent || "");

		if (html) {
			return {
				kind: "math",
				html,
				text,
				value: text,
			};
		}

		const mathChild = !element.matches("math")
			? element.querySelector("math")
			: null;

		if (mathChild?.outerHTML) {
			return {
				kind: "math",
				html: mathChild.outerHTML,
				text,
				value: text,
			};
		}

		for (const attributeName of [
			"data-tex",
			"data-latex",
			"alttext",
			"aria-label",
		]) {
			const attributeValue = normalizeSegmentText(
				element.getAttribute(attributeName) || "",
			);

			if (attributeValue) {
				return {
					kind: "math",
					text: attributeValue,
					value: attributeValue,
				};
			}
		}

		if (text) {
			return {
				kind: "math",
				text,
				value: text,
			};
		}

		return null;
	}

	function isVisible(element) {
		if (!element?.isConnected) {
			return false;
		}

		const style = window.getComputedStyle(element);

		if (style.visibility === "hidden" || style.display === "none") {
			return false;
		}

		const rect = element.getBoundingClientRect();

		return rect.width > 0 && rect.height > 0;
	}

	function getSegmentKind(element) {
		if (SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE)) {
			return SubtitleApi.getSegmentKind(ACTIVE_SITE_PROFILE, "paragraph");
		}

		if (!element) {
			return "paragraph";
		}

		const tag = element.tagName;

		if (isHeadingLikeElement(element)) {
			return "heading";
		}

		if (tag === "LI") {
			return "list_item";
		}

		if (tag === "TD" || tag === "TH") {
			return "table_cell";
		}

		if (tag === "BLOCKQUOTE") {
			return "quote";
		}

		return "paragraph";
	}

	const isHeadingLikeElement = ExtractionApi.isHeadingLikeElement;

	function serializeNode(node, context) {
		if (!node) {
			return "";
		}

		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent || "";
		}

		if (node.nodeType !== Node.ELEMENT_NODE) {
			return "";
		}

		const element = node;

		if (
			element.getAttribute &&
			element.getAttribute("aria-hidden") === "true"
		) {
			return "";
		}

		if (element.matches(MATH_SELECTOR)) {
			const mathFragment = extractMathFragment(element);

			return createProtectedPlaceholder(context, mathFragment);
		}

		if (
			element.closest(SKIP_ANCESTOR_SELECTOR) &&
			!element.matches(INLINE_CODE_SELECTOR)
		) {
			return "";
		}

		if (element.matches("br")) {
			return "\n";
		}

		if (element.matches(INLINE_CODE_SELECTOR)) {
			return `\`${normalizeInlineWhitespace(element.textContent || "")}\``;
		}

		if (element.matches("pre") && !element.matches(PROSE_TEXT_BLOCK_SELECTOR)) {
			return `\`${normalizeInlineWhitespace(element.textContent || "")}\``;
		}

		return Array.from(element.childNodes)
			.map((child) => serializeNode(child, context))
			.join("");
	}

	function getSegmentContent(element) {
		const context = {
			counter: 0,
			tokens: [],
		};

		return {
			text: normalizeSegmentText(serializeNode(element, context)),
			protectedFragments: context.tokens,
		};
	}

	const hasNestedReadableBlocks = ExtractionApi.hasNestedReadableBlocks;
	const isReadableTitleLink = ExtractionApi.isReadableTitleLink;
	const isLikelyUiMetaBlock = ExtractionApi.isLikelyUiMetaBlock;
	const scoreCandidateBlock = ExtractionApi.scoreCandidateBlock;
	const getCandidateElements = ExtractionApi.getCandidateElements;
	const hasSelectedRelative = ExtractionApi.hasSelectedRelative;

	function isTranslatorOwned(element) {
		return Boolean(element?.closest?.(`[${ROOT_ATTR}]`));
	}

	function classifySegment(element, content) {
		const text = content?.text || "";
		const protectedFragments = content?.protectedFragments || [];
		const isMetadata = Boolean(
			element?.matches?.(
				"time, .meta, .metadata, .byline, .timestamp, [itemprop*='date' i]",
			) ||
				element?.closest?.(
					"time, .meta, .metadata, .byline, .timestamp, [itemprop*='date' i]",
				),
		);
		const isUI = Boolean(isLikelyUiMetaBlock(element, text));
		const containsMath = protectedFragments.some(
			(fragment) =>
				fragment?.kind === "math" ||
				String(fragment?.placeholder || "").startsWith("__OT_MATH_"),
		);

		return {
			isUI,
			isMetadata,
			containsMath,
		};
	}

	function classifyCandidateElement(element) {
		if (!element) {
			return { ok: false, reason: "missing element" };
		}

		if (isInsideTranslation(element) || isTranslatorOwned(element)) {
			debugSkip("inside translation", element);
			return { ok: false, reason: "inside translation" };
		}

		if (
			element.getAttribute(PROCESSED_ATTR) === "true" &&
			element.getAttribute(STALE_ATTR) !== "true"
		) {
			debugSkip("already translated", element);
			return { ok: false, reason: "already translated" };
		}

		if (isUnsupportedElement(element)) {
			debugSkip("unsupported element", element);
			return { ok: false, reason: "unsupported element" };
		}

		if (!isVisible(element)) {
			return { ok: false, reason: "not visible" };
		}

		if (element.closest(SKIP_ANCESTOR_SELECTOR)) {
			return { ok: false, reason: "skipped ancestor" };
		}

		if (element.closest(TERMINAL_LIKE_SELECTOR)) {
			return { ok: false, reason: "terminal-like block" };
		}

		if (!element.matches(READABLE_BLOCK_SELECTOR)) {
			return { ok: false, reason: "non-readable block" };
		}

		if (hasNestedReadableBlocks(element)) {
			debugSkip("ancestor block", element);
			return { ok: false, reason: "ancestor block" };
		}

		const content = getSegmentContent(element);
		const classification = classifySegment(element, content);

		if (!shouldTranslateText(content.text)) {
			return {
				ok: false,
				reason: "insufficient content",
				content,
				classification,
			};
		}

		if (classification.isMetadata) {
			debugSkip("metadata block", element);
			return {
				ok: false,
				reason: "metadata block",
				content,
				classification,
			};
		}

		if (classification.isUI) {
			debugSkip("ui/meta block", element);
			return {
				ok: false,
				reason: "ui/meta block",
				content,
				classification,
			};
		}

		const minimumScore =
			isHeadingLikeElement(element) || isReadableTitleLink(element) ? 20 : 40;

		if (scoreCandidateBlock(element, content.text) < minimumScore) {
			debugSkip("ui/meta block", element);
			return {
				ok: false,
				reason: "ui/meta block",
				content,
				classification,
			};
		}

		return {
			ok: true,
			content,
			classification,
		};
	}

	function getExistingNoteForSource(element, id) {
		if (!element) {
			return null;
		}

		const next = element.nextElementSibling;

		if (next && next.getAttribute(NOTE_ATTR) === id) {
			return next;
		}

		for (const note of document.querySelectorAll(`[${ROOT_ATTR}="note"]`)) {
			if (note.getAttribute(NOTE_ATTR) === id) {
				return note;
			}
		}

		return null;
	}

	function markSourceStale(element) {
		if (!element?.getAttribute) {
			return;
		}

		const id = element.getAttribute(SOURCE_ATTR);

		if (!id || !hasSourceTextChanged(element)) {
			return;
		}

		const existingNote = getExistingNoteForSource(element, id);
		let subtitleReset = false;

		withObserverPaused(() => {
			subtitleReset = SubtitleApi.resetChangedSubtitleSource(
				ACTIVE_SITE_PROFILE,
				{
					element,
					note: existingNote,
					processedAttribute: PROCESSED_ATTR,
					queuedAttribute: QUEUED_ATTR,
					sourceAttribute: SOURCE_ATTR,
					staleAttribute: STALE_ATTR,
					translatedAttribute: TRANSLATED_ATTR,
				},
			);
		});

		if (subtitleReset) {
			return;
		}

		element.setAttribute(STALE_ATTR, "true");
		element.setAttribute(TRANSLATED_ATTR, "stale");
		element.removeAttribute(PROCESSED_ATTR);
		setSourceQueued(element, false);
		if (existingNote) {
			existingNote.setAttribute("data-stale", "true");
		}
	}

	function markRelatedSourcesStale(node) {
		if (!node) {
			return;
		}

		const element =
			node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

		if (!element) {
			return;
		}

		if (element.closest(`[${ROOT_ATTR}]`) || isInsideTranslation(element)) {
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

		function flushObserverMutations() {
			observerFlushTimer = null;

			const mutations = pendingObserverMutations.splice(
				0,
				pendingObserverMutations.length,
			);

			for (const mutation of mutations) {
				const targetElement =
					mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE
						? mutation.target
						: mutation.target?.parentElement;

				if (
					targetElement &&
					(targetElement.closest(`[${ROOT_ATTR}]`) ||
						isInsideTranslation(targetElement))
				) {
					continue;
				}

				if (mutation.type === "characterData") {
					markRelatedSourcesStale(mutation.target);
					scheduleVisiblePageTranslation();
					continue;
				}

				if (mutation.type === "attributes") {
					markRelatedSourcesStale(mutation.target);
					scheduleVisiblePageTranslation();
					continue;
				}

				if (mutation.type === "childList") {
					markRelatedSourcesStale(mutation.target);

					for (const node of mutation.removedNodes) {
						withObserverPaused(() => {
							SubtitleApi.removeDetachedSubtitleSources(
								ACTIVE_SITE_PROFILE,
								node,
								{
									findNote: getExistingNoteForSource,
									processedAttribute: PROCESSED_ATTR,
									queuedAttribute: QUEUED_ATTR,
									sourceAttribute: SOURCE_ATTR,
									staleAttribute: STALE_ATTR,
									translatedAttribute: TRANSLATED_ATTR,
								},
							);
						});
					}

					for (const node of mutation.addedNodes) {
						if (
							node.nodeType === Node.ELEMENT_NODE &&
							isInsideTranslation(node)
						) {
							continue;
						}

						markRelatedSourcesStale(node);
					}

					scheduleVisiblePageTranslation();
				}
			}
		}

		pageObserver = new MutationObserver((mutations) => {
			pendingObserverMutations.push(...mutations);

			if (observerFlushTimer) {
				return;
			}

			observerFlushTimer = window.setTimeout(
				flushObserverMutations,
				OBSERVER_DEBOUNCE_MS,
			);
		});

		observePageMutations();

		window.addEventListener(
			"scroll",
			() => {
				scheduleVisiblePageTranslation();
			},
			SCROLL_LISTENER_OPTIONS,
		);
		window.addEventListener("resize", () => {
			scheduleVisiblePageTranslation();
		});

		observerStarted = true;
	}

	function buildSegmentItem(element, analysis) {
		const content = analysis?.content || getSegmentContent(element);
		const classification =
			analysis?.classification || classifySegment(element, content);
		let itemId = element.getAttribute(SOURCE_ATTR);

		if (!itemId) {
			itemId = allocateSourceId();
		}

		element.setAttribute(SOURCE_ATTR, itemId);
		if (!element.hasAttribute(QUEUED_ATTR)) {
			element.setAttribute(QUEUED_ATTR, "false");
		}

		rememberSourceText(element, content.text);

		return {
			id: itemId,
			kind: getSegmentKind(element),
			text: content.text,
			protectedFragments: content.protectedFragments,
			isUI: classification.isUI,
			isMetadata: classification.isMetadata,
			containsMath: classification.containsMath,
		};
	}

	function getViewportWindowOptions() {
		return ViewportApi.normalizeViewportOptions({
			viewportHeight:
				window.innerHeight || document.documentElement.clientHeight || 0,
			prefetchViewports: PREFETCH_VIEWPORTS,
		});
	}

	function shouldQueueElementForTranslation(element, existingId) {
		const stale = element.getAttribute(STALE_ATTR) === "true";
		const translated = element.getAttribute(TRANSLATED_ATTR) === "true";
		const queued = element.getAttribute(QUEUED_ATTR) === "true";
		const hasNote = existingId
			? Boolean(getExistingNoteForSource(element, existingId))
			: false;

		if (stale) {
			return true;
		}

		return !(hasNote || translated || queued);
	}

	function createWindowCandidate(element, item) {
		return {
			element,
			item,
			rect: element.getBoundingClientRect(),
		};
	}

	function collectSemanticItems(profile, options, debugState) {
		const items = [];
		const windowCandidates = [];
		const totalElements = [];
		const selectedElements = [];
		const root = profile?.root;
		const elements = getCandidateElements(root);
		const windowed = Boolean(options?.windowed) && profile?.windowed !== false;
		const viewportOptions = windowed ? getViewportWindowOptions() : null;

		for (const element of elements) {
			const analysis = classifyCandidateElement(element);

			if (!analysis.ok) {
				recordExtractionDebugSkip(debugState, analysis.reason, element);
				continue;
			}

			if (hasSelectedRelative(element, selectedElements)) {
				debugSkip("ancestor block", element);
				recordExtractionDebugSkip(debugState, "ancestor block", element);
				continue;
			}

			totalElements.push(element);

			const existingId = element.getAttribute(SOURCE_ATTR);
			const shouldQueue = shouldQueueElementForTranslation(element, existingId);

			if (!shouldQueue) {
				continue;
			}

			const item = buildSegmentItem(element, analysis);
			selectedElements.push(element);
			debugSelect("leaf block", element);
			recordExtractionDebugSelect(debugState, item);

			if (windowed) {
				windowCandidates.push(createWindowCandidate(element, item));
			} else {
				items.push(item);
			}
		}

		return {
			items: windowed
				? ViewportApi.selectWindowCandidates(
						windowCandidates,
						viewportOptions,
					).map((candidate) => candidate.item)
				: items,
			totalSegments: totalElements.length,
		};
	}

	function collectFallbackItems(profile, options, debugState) {
		const seen = new Set();
		const selectedElements = [];
		const items = [];
		const windowCandidates = [];
		let totalSegments = 0;
		const windowed = Boolean(options?.windowed) && profile?.windowed !== false;
		const viewportOptions = windowed ? getViewportWindowOptions() : null;
		const root = profile?.root;
		const classificationCache = new Map();

		if (!root || !profile?.allowFallback) {
			return {
				items: [],
				totalSegments: 0,
			};
		}

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;

				if (
					!parent ||
					parent.closest(SKIP_ANCESTOR_SELECTOR) ||
					isInsideTranslation(parent)
				) {
					return NodeFilter.FILTER_REJECT;
				}

				if (isUnsupportedElement(parent)) {
					debugSkip("unsupported element", parent);
					return NodeFilter.FILTER_REJECT;
				}

				if (parent.closest(`[${PROCESSED_ATTR}="true"]`)) {
					debugSkip("already translated", parent);
					return NodeFilter.FILTER_REJECT;
				}

				if (!shouldTranslateText(node.textContent || "")) {
					return NodeFilter.FILTER_REJECT;
				}

				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let currentNode = walker.nextNode();

		while (currentNode) {
			const parent = currentNode.parentElement;
			const anchor = parent.closest(READABLE_BLOCK_SELECTOR);
			const analysis = anchor
				? classificationCache.get(anchor) || classifyCandidateElement(anchor)
				: null;

			if (anchor && analysis && !classificationCache.has(anchor)) {
				classificationCache.set(anchor, analysis);
			}

			if (anchor && analysis?.ok && !seen.has(anchor)) {
				if (hasSelectedRelative(anchor, selectedElements)) {
					debugSkip("ancestor block", anchor);
					recordExtractionDebugSkip(debugState, "ancestor block", anchor);
					currentNode = walker.nextNode();
					continue;
				}

				seen.add(anchor);
				totalSegments += 1;

				const existingId = anchor.getAttribute(SOURCE_ATTR);
				const shouldQueue = shouldQueueElementForTranslation(
					anchor,
					existingId,
				);

				if (shouldQueue) {
					const item = buildSegmentItem(anchor, analysis);
					selectedElements.push(anchor);
					debugSelect("leaf block", anchor);
					recordExtractionDebugSelect(debugState, item);

					if (windowed) {
						windowCandidates.push(createWindowCandidate(anchor, item));
					} else {
						items.push(item);
					}
				}
			} else if (anchor && analysis && !analysis.ok && !seen.has(anchor)) {
				recordExtractionDebugSkip(debugState, analysis.reason, anchor);
				seen.add(anchor);
			}

			currentNode = walker.nextNode();
		}

		return {
			items: windowed
				? ViewportApi.selectWindowCandidates(
						windowCandidates,
						viewportOptions,
					).map((candidate) => candidate.item)
				: items,
			totalSegments,
		};
	}

	function collectPageItems(options) {
		prepareSplitProseContainers();
		ensureStyles();
		ensureObserver();

		const profile = getTranslationProfile();
		const debugState = isDebugInfoEnabled()
			? createExtractionDebugState()
			: null;

		const semantic = collectSemanticItems(profile, options, debugState);

		if (semantic.totalSegments > 0) {
			return {
				items: semantic.items,
				totalSegments: semantic.totalSegments,
				pendingSegments: semantic.items.length,
				keepAlive: SubtitleApi.shouldKeepSessionAlive(ACTIVE_SITE_PROFILE),
				profileId: SITE_PROFILE_ID,
				debug: finalizeExtractionDebug(debugState),
			};
		}

		const fallback = collectFallbackItems(profile, options, debugState);

		return {
			items: fallback.items,
			totalSegments: fallback.totalSegments,
			pendingSegments: fallback.items.length,
			keepAlive: SubtitleApi.shouldKeepSessionAlive(ACTIVE_SITE_PROFILE),
			profileId: SITE_PROFILE_ID,
			debug: finalizeExtractionDebug(debugState),
		};
	}

	async function requestVisiblePageTranslationBatch() {
		visibleTranslationFlushTimer = null;

		if (!isPageTranslationSessionActive()) {
			return;
		}

		const extraction = collectPageItems({ windowed: true });

		renderExtractionDebugPanel(extraction.debug);

		if (!extraction.items || extraction.items.length === 0) {
			return;
		}

		try {
			await chrome.runtime.sendMessage(
				window.TranslatorMessages.queuePageTranslationItems({
					sessionId: pageState.pageTranslation.sessionId,
					items: extraction.items,
				}),
			);
		} catch (_error) {
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

	function getNoteElementTagName(sourceElement) {
		if (
			isHeadingLikeElement(sourceElement) ||
			isReadableTitleLink(sourceElement)
		) {
			return "p";
		}

		const tagName = sourceElement?.tagName
			? sourceElement.tagName.toLowerCase()
			: "p";

		if (tagName === "td" || tagName === "th") {
			return "div";
		}

		return tagName === "a" || tagName === "span" ? "p" : tagName;
	}

	function shouldAppendNoteInsideTarget(element) {
		const tagName = element?.tagName ? element.tagName.toLowerCase() : "";

		return tagName === "td" || tagName === "th";
	}

	function insertNoteForTarget(insertionTarget, note) {
		if (shouldAppendNoteInsideTarget(insertionTarget)) {
			insertionTarget.appendChild(note);
			return;
		}

		insertionTarget.insertAdjacentElement("afterend", note);
	}

	function buildNote(sourceElement, id) {
		const tagName = SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE)
			? "div"
			: getNoteElementTagName(sourceElement);
		const note = document.createElement(tagName);
		const label = document.createElement("span");
		const body = document.createElement("span");

		note.classList.add("translation");
		note.setAttribute(ROOT_ATTR, "note");
		note.setAttribute(NOTE_ATTR, id);
		label.setAttribute(ROOT_ATTR, "note-label");
		body.setAttribute(ROOT_ATTR, "note-body");
		body.setAttribute("data-state", "ready");
		note.appendChild(label);
		note.appendChild(body);
		SubtitleApi.prepareSubtitleNote(
			ACTIVE_SITE_PROFILE,
			note,
			sourceElement,
			(element) => window.getComputedStyle(element),
		);

		return note;
	}

	function getDebugPanel() {
		let panel = document.querySelector(`[${ROOT_ATTR}="debug-panel"]`);

		if (panel) {
			return panel;
		}

		panel = document.createElement("aside");
		panel.classList.add("translation");
		panel.setAttribute(ROOT_ATTR, "debug-panel");
		panel.setAttribute("aria-live", "polite");
		panel.setAttribute("aria-label", "Translation debug info");

		withObserverPaused(() => {
			if (document.body) {
				document.body.appendChild(panel);
			}
		});

		return panel;
	}

	function clearDebugPanel() {
		const panel = document.querySelector(`[${ROOT_ATTR}="debug-panel"]`);

		if (!panel) {
			return;
		}

		withObserverPaused(() => {
			panel.remove();
		});
	}

	function getDebugProfileLabel(debugInfo) {
		const profileId = debugInfo?.profileId || SITE_PROFILE_ID || "default";

		return `Profile: ${profileId}`;
	}

	function renderExtractionDebugPanel(debugInfo) {
		if (!isDebugInfoEnabled() || !debugInfo) {
			clearDebugPanel();
			return;
		}

		const panel = getDebugPanel();
		const title = document.createElement("strong");
		const profileLabel = document.createElement("span");
		const selectedTitle = document.createElement("span");
		const selectedList = document.createElement("ul");
		const skippedTitle = document.createElement("span");
		const skippedList = document.createElement("ul");
		const sampleTitle = document.createElement("span");
		const sampleList = document.createElement("ul");

		title.setAttribute(ROOT_ATTR, "debug-title");
		title.textContent = "Translation Debug Info";
		profileLabel.setAttribute(ROOT_ATTR, "debug-profile");
		profileLabel.textContent = getDebugProfileLabel(debugInfo);
		selectedTitle.setAttribute(ROOT_ATTR, "debug-section-title");
		selectedTitle.textContent = `Queued items (${debugInfo.selectedItems.length})`;
		selectedList.setAttribute(ROOT_ATTR, "debug-list");

		for (const item of debugInfo.selectedItems) {
			const entry = document.createElement("li");

			entry.textContent = `${item.id} · ${item.kind} · ~${item.tokenCount} tokens${item.containsMath ? " · math" : ""}`;
			selectedList.appendChild(entry);
		}

		skippedTitle.setAttribute(ROOT_ATTR, "debug-section-title");
		skippedTitle.textContent = "Skipped reasons";
		skippedList.setAttribute(ROOT_ATTR, "debug-list");

		for (const item of debugInfo.skippedByReason || []) {
			const entry = document.createElement("li");

			entry.textContent = `${item.reason}: ${item.count}`;
			skippedList.appendChild(entry);
		}

		sampleTitle.setAttribute(ROOT_ATTR, "debug-section-title");
		sampleTitle.textContent = "Skipped node samples";
		sampleList.setAttribute(ROOT_ATTR, "debug-list");

		for (const item of debugInfo.skippedSamples || []) {
			const entry = document.createElement("li");

			entry.textContent = `${item.reason} · ${item.node}`;
			sampleList.appendChild(entry);
		}

		withObserverPaused(() => {
			panel.replaceChildren();
			panel.appendChild(title);
			panel.appendChild(profileLabel);

			if (selectedList.childNodes.length > 0) {
				panel.appendChild(selectedTitle);
				panel.appendChild(selectedList);
			}

			if (skippedList.childNodes.length > 0) {
				panel.appendChild(skippedTitle);
				panel.appendChild(skippedList);
			}

			if (sampleList.childNodes.length > 0) {
				panel.appendChild(sampleTitle);
				panel.appendChild(sampleList);
			}
		});
	}

	function getNoteInsertionTarget(element, selectors = {}) {
		const readableBlockSelector =
			selectors.READABLE_BLOCK_SELECTOR || READABLE_BLOCK_SELECTOR;
		const directNoteTargetSelector =
			selectors.DIRECT_NOTE_TARGET_SELECTOR || DIRECT_NOTE_TARGET_SELECTOR;
		const siteProfileId = selectors.SITE_PROFILE_ID || SITE_PROFILE_ID;
		let current = element;

		while (current && current !== document.body) {
			const isDirectNoteTarget = current.matches?.(directNoteTargetSelector);

			if (
				current.matches?.(readableBlockSelector) &&
				(!current.matches("article, main, section, div, body") ||
					isDirectNoteTarget) &&
				!hasUnsafeLayoutContext(current, {
					allowAncestorTransforms:
						isDirectNoteTarget &&
						(siteProfileId === "x" ||
							SubtitleApi.shouldAllowAncestorTransforms(ACTIVE_SITE_PROFILE)),
				})
			) {
				return current;
			}

			current = current.parentElement;
		}

		return null;
	}

	function _isSafeNoteInsertionTarget(element, selectors) {
		return Boolean(getNoteInsertionTarget(element, selectors));
	}

	function startPageTranslationSession(payload) {
		ensureStyles(payload?.translationAppearance);
		ensureObserver();
		clearPendingTranslations();
		pageState.debug.enabled = Boolean(payload?.debug?.enabled);
		if (!pageState.debug.enabled) {
			clearDebugPanel();
		}
		activatePageTranslationSession(payload.sessionId);
		if (pageState.youtubeControl.button) {
			applyYoutubeControlState(pageState.youtubeControl.button, "active");
		}

		const extraction = collectPageItems({ windowed: true });

		renderExtractionDebugPanel(extraction.debug);

		return extraction;
	}

	function setNotePending(note, targetLanguage) {
		const label = note.querySelector(`[${ROOT_ATTR}="note-label"]`);
		const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

		note.setAttribute("data-phase", "pending");
		note.setAttribute("data-lang", targetLanguage);
		label.textContent = targetLanguage;
		body.setAttribute("data-state", "pending");
		body.replaceChildren(document.createTextNode(" "));
	}

	function appendProtectedFragment(container, fragment) {
		if (!fragment) {
			return;
		}

		if (fragment.kind === "math" && fragment.html) {
			const template = document.createElement("template");

			template.innerHTML = fragment.html;

			if (template.content.childNodes.length > 0) {
				container.appendChild(template.content.cloneNode(true));
				return;
			}
		}

		container.appendChild(
			document.createTextNode(fragment.text || fragment.value || ""),
		);
	}

	function appendFormattedText(container, text, protectedFragments) {
		const fragmentByPlaceholder = new Map(
			(protectedFragments || []).map((fragment) => [
				fragment.placeholder,
				fragment,
			]),
		);
		const lines = String(text || "").split("\n");

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
			const line = lines[lineIndex];
			const parts = line
				.split(/(__OT_(?:TOKEN|MATH)_\d+__|`[^`\n]+`)/g)
				.filter(Boolean);

			for (const part of parts) {
				const protectedFragment = fragmentByPlaceholder.get(part);

				if (protectedFragment) {
					appendProtectedFragment(container, protectedFragment);
				} else if (/^`[^`\n]+`$/.test(part)) {
					const code = document.createElement("code");

					code.textContent = part.slice(1, -1);
					container.appendChild(code);
				} else {
					container.appendChild(document.createTextNode(part));
				}
			}

			if (lineIndex < lines.length - 1) {
				container.appendChild(document.createElement("br"));
			}
		}
	}

	function upsertNoteForSource(
		element,
		id,
		translation,
		targetLanguage,
		protectedFragments,
	) {
		const insertionTarget = getNoteInsertionTarget(element);

		if (!insertionTarget) {
			return null;
		}

		const existingNote = getExistingNoteForSource(element, id);
		const note = existingNote || buildNote(element, id);
		const label = note.querySelector(`[${ROOT_ATTR}="note-label"]`);
		const body = note.querySelector(`[${ROOT_ATTR}="note-body"]`);

		withObserverPaused(() => {
			note.setAttribute("data-phase", "ready");
			note.setAttribute("data-lang", targetLanguage);
			label.textContent = targetLanguage;
			body.setAttribute("data-state", "ready");
			body.replaceChildren();
			appendFormattedText(body, translation, protectedFragments);
			note.removeAttribute("data-stale");

			if (!existingNote) {
				insertNoteForTarget(insertionTarget, note);
			}

			SubtitleApi.replaceSubtitleSource(
				ACTIVE_SITE_PROFILE,
				insertionTarget,
				true,
			);
		});

		element.removeAttribute(STALE_ATTR);
		setSourceTranslated(element, true);
		setSourceQueued(element, false);

		return note;
	}

	function renderPagePlaceholders(payload) {
		ensureStyles(payload?.translationAppearance);
		ensureObserver();

		const ids = new Set(payload.ids || []);
		let rendered = 0;

		for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
			const id = element.getAttribute(SOURCE_ATTR);
			const insertionTarget = getNoteInsertionTarget(element);

			if (!ids.has(id) || !insertionTarget) {
				continue;
			}

			const note =
				getExistingNoteForSource(element, id) || buildNote(element, id);

			withObserverPaused(() => {
				setNotePending(note, payload.targetLanguage);

				if (!note.isConnected) {
					insertNoteForTarget(insertionTarget, note);
				}
			});
			setSourceQueued(element, true);
			rendered += 1;
		}

		return { rendered };
	}

	function isIdentityTransform(transform) {
		const normalized = String(transform || "").replace(/\s+/g, "");

		return (
			!normalized ||
			normalized === "none" ||
			normalized === "matrix(1,0,0,1,0,0)" ||
			normalized === "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)"
		);
	}

	function hasUnsafeLayoutContext(element, options = {}) {
		let current = element;

		while (current && current !== document.body) {
			if (current.matches?.(TERMINAL_LIKE_SELECTOR)) {
				return true;
			}

			const style = window.getComputedStyle(current);
			const unsafeTransform =
				!isIdentityTransform(style.transform) &&
				!(options.allowAncestorTransforms && current !== element);

			if (
				unsafeTransform ||
				style.filter !== "none" ||
				style.backdropFilter !== "none" ||
				style.mixBlendMode !== "normal"
			) {
				return true;
			}

			current = current.parentElement;
		}

		return false;
	}

	function renderPageTranslations(payload) {
		ensureStyles(payload?.translationAppearance);
		ensureObserver();

		const translationMap = new Map(
			(payload.translations || []).map((item) => [item.id, item]),
		);
		let rendered = 0;

		for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
			const id = element.getAttribute(SOURCE_ATTR);
			const translationItem = translationMap.get(id);
			const translation = translationItem?.translation;

			if (
				!translation ||
				(SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE) &&
					translationItem.sourceText !== getSegmentContent(element).text)
			) {
				continue;
			}

			const note = upsertNoteForSource(
				element,
				id,
				translation,
				payload.targetLanguage,
				translationItem.protectedFragments,
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

		for (const note of document.querySelectorAll(
			`[${ROOT_ATTR}="note"][data-phase="pending"]`,
		)) {
			const id = note.getAttribute(NOTE_ATTR);

			if (!ids.has(id)) {
				continue;
			}

			withObserverPaused(() => {
				note.remove();
			});
			cleared += 1;

			const source = document.querySelector(`[${SOURCE_ATTR}="${id}"]`);

			if (source) {
				setSourceTranslated(source, false);
				source.removeAttribute(STALE_ATTR);
				setSourceQueued(source, false);
			}
		}

		return { cleared };
	}

	const MessageTypes = window.TranslatorMessages.MESSAGE_TYPES;
	const selectionPanelRenderer = window.TranslatorSelectionPanel
		? window.TranslatorSelectionPanel.createSelectionPanelRenderer({
				document,
				window,
				rootAttr: ROOT_ATTR,
				appendFormattedText,
				ensureObserver,
				ensureStyles,
				onRetry(payload) {
					chrome.runtime
						.sendMessage(
							window.TranslatorMessages.retrySelectionTranslation(payload),
						)
						.catch(() => {});
				},
				withObserverPaused,
			})
		: null;

	function renderSelectionError(payload) {
		if (!selectionPanelRenderer) {
			return { rendered: "unavailable" };
		}

		return selectionPanelRenderer.renderError(payload);
	}

	function renderSelectionTranslation(payload) {
		if (!selectionPanelRenderer) {
			return { rendered: "unavailable" };
		}

		return selectionPanelRenderer.renderTranslation(payload);
	}

	function renderSelectionPlaceholder(payload) {
		if (!selectionPanelRenderer) {
			return { rendered: "unavailable" };
		}

		return selectionPanelRenderer.renderPlaceholder(payload);
	}

	function clearSelectionTranslation() {
		if (!selectionPanelRenderer) {
			return { cleared: 0 };
		}

		return selectionPanelRenderer.close();
	}

	function clearPendingTranslations() {
		const notes = Array.from(
			document.querySelectorAll(`[${ROOT_ATTR}="note"][data-phase="pending"]`),
		);

		pageState.pageTranslation.active = false;
		pageState.pageTranslation.sessionId = "";
		if (pageState.youtubeControl.button) {
			applyYoutubeControlState(pageState.youtubeControl.button, "idle");
		}
		if (visibleTranslationFlushTimer) {
			window.clearTimeout(visibleTranslationFlushTimer);
			visibleTranslationFlushTimer = null;
		}

		for (const note of notes) {
			withObserverPaused(() => {
				note.remove();
			});
		}

		for (const source of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
			if (source.getAttribute(TRANSLATED_ATTR) !== "true") {
				source.removeAttribute(PROCESSED_ATTR);
				setSourceQueued(source, false);
			}
		}

		return { cleared: notes.length };
	}

	function getToastLayer() {
		ensureStyles();
		let layer = document.querySelector(`[${ROOT_ATTR}="toast-layer"]`);

		if (!layer) {
			layer = document.createElement("div");
			layer.setAttribute(ROOT_ATTR, "toast-layer");
			if (document.body) {
				document.body.insertAdjacentElement("afterbegin", layer);
			} else {
				document.documentElement.appendChild(layer);
			}
		}

		return layer;
	}

	function showToast(message, level, timeout) {
		const toast = document.createElement("div");
		const layer = getToastLayer();

		toast.setAttribute(ROOT_ATTR, "toast");
		toast.setAttribute("data-level", level || "info");
		toast.textContent = message;
		layer.appendChild(toast);

		window.setTimeout(() => {
			toast.remove();

			if (layer.childElementCount === 0) {
				layer.remove();
			}
		}, timeout || 3200);
	}

	ensureYoutubeControl();

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (!message || typeof message !== "object") {
			sendResponse({ ok: false });
			return;
		}

		if (message.type === MessageTypes.PING) {
			sendResponse({ ok: true });
			return;
		}

		if (message.type === MessageTypes.EXTRACT_PAGE_CONTENT) {
			sendResponse({
				ok: true,
				...collectPageItems(),
			});
			return;
		}

		if (message.type === MessageTypes.GET_SELECTION_ANCHOR) {
			sendResponse({
				ok: true,
				anchorRect: getSelectionAnchorRect(),
			});
			return;
		}

		if (message.type === MessageTypes.START_PAGE_TRANSLATION_SESSION) {
			sendResponse({
				ok: true,
				...startPageTranslationSession(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_PAGE_TRANSLATIONS) {
			sendResponse({
				ok: true,
				...renderPageTranslations(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_PAGE_TRANSLATION_UPDATES) {
			sendResponse({
				ok: true,
				...renderPageTranslations(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_PAGE_PLACEHOLDERS) {
			sendResponse({
				ok: true,
				...renderPagePlaceholders(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_SELECTION_ERROR) {
			sendResponse({
				ok: true,
				...renderSelectionError(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_SELECTION_TRANSLATION) {
			sendResponse({
				ok: true,
				...renderSelectionTranslation(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.RENDER_SELECTION_PLACEHOLDER) {
			sendResponse({
				ok: true,
				...renderSelectionPlaceholder(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.CLEAR_PENDING_TRANSLATIONS) {
			sendResponse({
				ok: true,
				...clearPendingTranslations(),
			});
			return;
		}

		if (message.type === MessageTypes.CLEAR_SELECTION_TRANSLATION) {
			sendResponse({
				ok: true,
				...clearSelectionTranslation(),
			});
			return;
		}

		if (message.type === MessageTypes.CLEAR_PAGE_PLACEHOLDERS) {
			sendResponse({
				ok: true,
				...clearPagePlaceholders(message.payload || {}),
			});
			return;
		}

		if (message.type === MessageTypes.SHOW_TOAST) {
			const payload = message.payload || {};
			showToast(payload.message || "", payload.level || "info");
			sendResponse({ ok: true });
			return;
		}

		sendResponse({ ok: false });
	});

	return {
		__TEST__: {
			detectContentMode,
			ARTICLE_CONTENT_SELECTOR,
			DIRECT_NOTE_TARGET_SELECTOR,
			HEADING_SELECTOR,
			PROSE_TEXT_BLOCK_SELECTOR,
			READABLE_BLOCK_SELECTOR,
			SOCIAL_TEXT_BLOCK_SELECTOR,
			TITLE_LIKE_SELECTOR,
			UNSUPPORTED_ANCESTOR_SELECTOR,
			UNSUPPORTED_ELEMENT_SELECTOR,
			_createExtractionDebugState: createExtractionDebugState,
			_finalizeExtractionDebug: finalizeExtractionDebug,
			_isSafeNoteInsertionTarget,
			_getDebugProfileLabel: getDebugProfileLabel,
			_getHighestSourceIdCounter: getHighestSourceIdCounter,
			_getNoteElementTagName: getNoteElementTagName,
			_allocateSourceId: allocateSourceId,
			_hasSourceTextChanged: hasSourceTextChanged,
			_rememberSourceText: rememberSourceText,
			_resetSourceIdCounterForTest: resetSourceIdCounterForTest,
			_resetSourceTextSnapshotsForTest: resetSourceTextSnapshotsForTest,
			_SCROLL_LISTENER_OPTIONS: SCROLL_LISTENER_OPTIONS,
			_shouldAppendNoteInsideTarget: shouldAppendNoteInsideTarget,
			_splitProseContainer: splitProseContainer,
			getSegmentContent,
			isHeadingLikeElement,
			isInsideTranslation,
			isTranslatorOwned,
			isUnsupportedElement,
			scoreCandidateBlock,
			scoreTranslationRoot,
		},
	};
})();

if (typeof module !== "undefined" && module.exports) {
	module.exports = TranslatorContentModule.__TEST__;
}
