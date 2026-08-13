export function createContentHelpers(options = {}) {
	const { Api, pageState, siteProfileId: SITE_PROFILE_ID, window } = options;
	function isDebugInfoEnabled() {
		return Boolean(pageState.debug.enabled);
	}

	function estimateTextTokens(text) {
		if (Api && typeof Api.estimateTokenCount === "function") {
			return Api.estimateTokenCount(text);
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

	return {
		createExtractionDebugState,
		finalizeExtractionDebug,
		getDebugNodeLabel,
		getSelectionAnchorRect,
		isDebugInfoEnabled,
		normalizeSelectionAnchorRect,
		recordExtractionDebugSelect,
		recordExtractionDebugSkip,
		serializeDomRect,
	};
}
