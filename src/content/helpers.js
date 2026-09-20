export function createContentHelpers(options = {}) {
	const { Api, pageState, siteProfileId: SITE_PROFILE_ID } = options;
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
		isDebugInfoEnabled,
		recordExtractionDebugSelect,
		recordExtractionDebugSkip,
	};
}
