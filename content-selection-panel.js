((root) => {
	const SELECTION_PANEL_POSITION_MODES = Object.freeze([
		"near-selection",
		"bottom-right",
	]);
	const SELECTION_PANEL_MARGIN = 12;
	const SELECTION_PANEL_GAP = 12;
	const SELECTION_PANEL_COMPACT_WIDTH = 280;
	const SELECTION_PANEL_EXPANDED_WIDTH = 420;
	const SELECTION_PANEL_MAX_WIDTH = 420;
	const SELECTION_PANEL_COMPACT_MAX_BODY_HEIGHT = 132;
	const SELECTION_PANEL_EXPANDED_MAX_BODY_HEIGHT = 320;
	const SELECTION_PANEL_MOBILE_BREAKPOINT = 640;

	function normalizeSelectionPanelPositionMode(value) {
		const normalized = String(value || "")
			.trim()
			.toLowerCase();

		return SELECTION_PANEL_POSITION_MODES.includes(normalized)
			? normalized
			: "near-selection";
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

	function clampSelectionPanelValue(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function getSelectionPanelWidth(viewportWidth, expanded) {
		const preferredWidth = expanded
			? SELECTION_PANEL_EXPANDED_WIDTH
			: SELECTION_PANEL_COMPACT_WIDTH;

		return Math.min(
			preferredWidth,
			Math.max(0, viewportWidth - SELECTION_PANEL_MARGIN * 2),
		);
	}

	function shouldCloseSelectionPanelOnKey(event) {
		return Boolean(
			event &&
				event.key === "Escape" &&
				!event.defaultPrevented &&
				!event.isComposing,
		);
	}

	function createSelectionPanelRenderer(options = {}) {
		const rootAttr = options.rootAttr || "data-ot-role";
		const doc = options.document || root.document;
		const win = options.window || root.window || root;
		const ensureStyles =
			typeof options.ensureStyles === "function"
				? options.ensureStyles
				: () => {};
		const ensureObserver =
			typeof options.ensureObserver === "function"
				? options.ensureObserver
				: () => {};
		const withObserverPaused =
			typeof options.withObserverPaused === "function"
				? options.withObserverPaused
				: (callback) => callback();
		const appendFormattedText =
			typeof options.appendFormattedText === "function"
				? options.appendFormattedText
				: (container, text) => {
						container.appendChild(doc.createTextNode(String(text || "")));
					};
		const state = {
			positionMode: "near-selection",
			anchorRect: null,
			expanded: false,
			keyboardHandlerInstalled: false,
		};

		function isExpanded() {
			return Boolean(state.expanded);
		}

		function updateLayoutState(panel, body, expandButton, pending) {
			if (!panel || !body || !expandButton) {
				return;
			}

			const normalizedText = String(body.textContent || "")
				.replace(/\s+/g, " ")
				.trim();
			const lineBreakCount = body.querySelectorAll("br").length;
			const canExpand =
				!pending &&
				(normalizedText.length > 140 ||
					lineBreakCount >= 3 ||
					body.scrollHeight > body.clientHeight + 1 ||
					body.scrollWidth > body.clientWidth + 1);

			if (!canExpand && isExpanded()) {
				state.expanded = false;
			}

			panel.setAttribute("data-expanded", isExpanded() ? "true" : "false");
			expandButton.hidden = !canExpand;
			expandButton.textContent = isExpanded() ? "Collapse" : "Expand";
			expandButton.setAttribute(
				"aria-label",
				isExpanded() ? "Collapse translation" : "Expand translation",
			);
			expandButton.setAttribute(
				"aria-expanded",
				isExpanded() ? "true" : "false",
			);
		}

		function applyPosition(panel) {
			if (!panel) {
				return;
			}

			const viewportWidth = Math.max(
				win.innerWidth || 0,
				doc.documentElement?.clientWidth || 0,
			);
			const viewportHeight = Math.max(
				win.innerHeight || 0,
				doc.documentElement?.clientHeight || 0,
			);

			panel.style.left = "";
			panel.style.right = "";
			panel.style.top = "";
			panel.style.bottom = "";
			panel.style.width = "";
			panel.style.maxWidth = "";

			if (viewportWidth > SELECTION_PANEL_MOBILE_BREAKPOINT) {
				const targetWidth = getSelectionPanelWidth(viewportWidth, isExpanded());

				panel.style.width = `${targetWidth}px`;
				panel.style.maxWidth = `${targetWidth}px`;
			}

			if (
				viewportWidth <= SELECTION_PANEL_MOBILE_BREAKPOINT ||
				state.positionMode !== "near-selection" ||
				!state.anchorRect
			) {
				return;
			}

			const maxPanelWidth = Math.max(
				0,
				viewportWidth - SELECTION_PANEL_MARGIN * 2,
			);
			const measuredWidth = panel.offsetWidth || SELECTION_PANEL_MAX_WIDTH;
			const measuredHeight = panel.offsetHeight || 0;
			const panelWidth = Math.min(
				SELECTION_PANEL_MAX_WIDTH,
				maxPanelWidth,
				measuredWidth,
			);
			const minLeft = SELECTION_PANEL_MARGIN;
			const maxLeft = Math.max(minLeft, viewportWidth - panelWidth - minLeft);
			const preferredLeft = Math.min(
				state.anchorRect.left,
				state.anchorRect.right - panelWidth,
			);
			const left = clampSelectionPanelValue(preferredLeft, minLeft, maxLeft);
			const belowTop = state.anchorRect.bottom + SELECTION_PANEL_GAP;
			const aboveTop =
				state.anchorRect.top - measuredHeight - SELECTION_PANEL_GAP;
			const fitsBelow =
				belowTop + measuredHeight <= viewportHeight - SELECTION_PANEL_MARGIN;
			const fitsAbove = aboveTop >= SELECTION_PANEL_MARGIN;
			let top = belowTop;

			if (!fitsBelow && fitsAbove) {
				top = aboveTop;
			}

			top = clampSelectionPanelValue(
				top,
				SELECTION_PANEL_MARGIN,
				Math.max(
					SELECTION_PANEL_MARGIN,
					viewportHeight - measuredHeight - SELECTION_PANEL_MARGIN,
				),
			);

			panel.style.right = "auto";
			panel.style.bottom = "auto";
			panel.style.left = `${left}px`;
			panel.style.top = `${top}px`;
			panel.style.width = `${panelWidth}px`;
			panel.style.maxWidth = `${panelWidth}px`;
		}

		function close() {
			const panel = doc.querySelector(`[${rootAttr}="selection-panel"]`);

			if (panel) {
				withObserverPaused(() => {
					panel.remove();
				});
			}
		}

		function ensureKeyboardHandler() {
			if (
				state.keyboardHandlerInstalled ||
				typeof doc.addEventListener !== "function"
			) {
				return;
			}

			doc.addEventListener("keydown", (event) => {
				if (shouldCloseSelectionPanelOnKey(event)) {
					close();
				}
			});
			state.keyboardHandlerInstalled = true;
		}

		function getPanel() {
			ensureStyles();
			ensureKeyboardHandler();
			let panel = doc.querySelector(`[${rootAttr}="selection-panel"]`);

			if (panel) {
				return panel;
			}

			panel = doc.createElement("aside");
			const header = doc.createElement("div");
			const title = doc.createElement("p");
			const actions = doc.createElement("div");
			const expandButton = doc.createElement("button");
			const closeButton = doc.createElement("button");
			const body = doc.createElement("div");

			panel.classList.add("translation");
			panel.setAttribute(rootAttr, "selection-panel");
			panel.setAttribute("data-expanded", "false");
			panel.setAttribute("aria-live", "polite");
			panel.setAttribute("aria-label", "Selected text translation");
			header.setAttribute(rootAttr, "selection-panel-header");
			title.setAttribute(rootAttr, "selection-panel-title");
			actions.setAttribute(rootAttr, "selection-panel-actions");
			expandButton.setAttribute(rootAttr, "selection-panel-expand");
			expandButton.setAttribute("type", "button");
			expandButton.setAttribute("aria-label", "Expand translation");
			expandButton.setAttribute("aria-expanded", "false");
			expandButton.hidden = true;
			expandButton.textContent = "Expand";
			expandButton.addEventListener("click", () => {
				state.expanded = !state.expanded;
				updateLayoutState(panel, body, expandButton, false);
				applyPosition(panel);
			});
			closeButton.setAttribute(rootAttr, "selection-panel-close");
			closeButton.setAttribute("type", "button");
			closeButton.setAttribute("aria-label", "Close translation");
			closeButton.textContent = "×";
			closeButton.addEventListener("click", () => {
				close();
			});
			body.setAttribute(rootAttr, "selection-panel-body");
			body.setAttribute("data-state", "ready");
			title.textContent = "Selected Text Translation";

			header.appendChild(title);
			actions.appendChild(expandButton);
			actions.appendChild(closeButton);
			header.appendChild(actions);
			panel.appendChild(header);
			panel.appendChild(body);

			withObserverPaused(() => {
				if (doc.body) {
					doc.body.appendChild(panel);
				} else {
					doc.documentElement.appendChild(panel);
				}
			});

			return panel;
		}

		function update(payload) {
			state.positionMode = normalizeSelectionPanelPositionMode(
				payload.selectionPanelPositionMode,
			);
			state.anchorRect = normalizeSelectionAnchorRect(payload.selectionAnchor);
			state.expanded = false;

			const panel = getPanel();
			const title = panel.querySelector(
				`[${rootAttr}="selection-panel-title"]`,
			);
			const body = panel.querySelector(`[${rootAttr}="selection-panel-body"]`);
			const expandButton = panel.querySelector(
				`[${rootAttr}="selection-panel-expand"]`,
			);

			if (title) {
				title.textContent = payload.targetLanguage
					? `Selected Text Translation · ${payload.targetLanguage}`
					: "Selected Text Translation";
			}

			if (!body) {
				return panel;
			}

			withObserverPaused(() => {
				body.setAttribute("data-state", payload.pending ? "pending" : "ready");
				body.replaceChildren();

				if (payload.pending) {
					body.appendChild(doc.createTextNode(" "));
					return;
				}

				appendFormattedText(
					body,
					payload.translation || "",
					payload.protectedFragments,
				);
			});

			updateLayoutState(panel, body, expandButton, Boolean(payload.pending));
			applyPosition(panel);

			return panel;
		}

		function renderTranslation(payload) {
			ensureStyles(payload?.translationAppearance);
			ensureObserver();

			update({
				pending: false,
				targetLanguage: payload.targetLanguage,
				selectionPanelPositionMode: payload.selectionPanelPositionMode,
				selectionAnchor: payload.selectionAnchor,
				translation: payload.translation,
				protectedFragments: payload.protectedFragments,
			});

			return { rendered: "floating" };
		}

		function renderPlaceholder(payload) {
			ensureStyles(payload?.translationAppearance);
			ensureObserver();

			update({
				pending: true,
				targetLanguage: payload.targetLanguage,
				selectionPanelPositionMode: payload.selectionPanelPositionMode,
				selectionAnchor: payload.selectionAnchor,
			});

			return { rendered: "floating" };
		}

		return {
			applyPosition,
			close,
			renderPlaceholder,
			renderTranslation,
			update,
		};
	}

	const api = {
		SELECTION_PANEL_COMPACT_MAX_BODY_HEIGHT,
		SELECTION_PANEL_COMPACT_WIDTH,
		SELECTION_PANEL_EXPANDED_MAX_BODY_HEIGHT,
		SELECTION_PANEL_EXPANDED_WIDTH,
		SELECTION_PANEL_MAX_WIDTH,
		SELECTION_PANEL_MOBILE_BREAKPOINT,
		createSelectionPanelRenderer,
		getSelectionPanelWidth,
		normalizeSelectionAnchorRect,
		normalizeSelectionPanelPositionMode,
		shouldCloseSelectionPanelOnKey,
	};

	root.TranslatorSelectionPanel = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
