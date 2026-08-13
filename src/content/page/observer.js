function isSubtitleRelatedMutation(mutation, options = {}) {
	const { Node, selector } = options;

	function containsSubtitleSegment(node, includeDescendants) {
		const element =
			node?.nodeType === Node?.ELEMENT_NODE ? node : node?.parentElement;

		return Boolean(
			element &&
				(element.matches?.(selector) ||
					element.closest?.(selector) ||
					(includeDescendants && element.querySelector?.(selector))),
		);
	}

	return (
		containsSubtitleSegment(mutation?.target, false) ||
		[...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])].some(
			(node) => containsSubtitleSegment(node, true),
		)
	);
}

export function createPageObserver(options = {}) {
	const {
		document,
		Node,
		MutationObserver,
		window,
		rootAttr,
		sourceAttr,
		queuedAttr,
		staleAttr,
		translatedAttr,
		processedAttr,
		activeSiteProfile,
		SubtitleApi,
		isInsideTranslation,
		hasSourceTextChanged,
		setSourceQueued,
		getExistingNoteForSource,
		onScheduleVisibleTranslation,
		contentLifecycle,
		observerDebounceMs = 200,
	} = options;
	let observer = null;
	let observerFlushTimer = null;
	let staleFlushTimer = null;
	const pendingStaleSources = new Set();
	const pendingObserverMutations = [];

	function observePageMutations() {
		if (!observer || !document.body) return;
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class", "style", "hidden", "aria-hidden"],
			childList: true,
			characterData: true,
			subtree: true,
		});
	}

	function withObserverPaused(callback) {
		if (!observer || !document.body) return callback();
		observer.disconnect();
		try {
			return callback();
		} finally {
			observePageMutations();
		}
	}

	function markSourceStale(element) {
		if (!element?.getAttribute) return;
		const id = element.getAttribute(sourceAttr);
		if (!id || !hasSourceTextChanged(element)) return;
		const existingNote = getExistingNoteForSource(element, id);
		let subtitleReset = false;
		withObserverPaused(() => {
			subtitleReset = SubtitleApi.resetChangedSubtitleSource(
				activeSiteProfile,
				{
					element,
					note: existingNote,
					processedAttribute: processedAttr,
					queuedAttribute: queuedAttr,
					sourceAttribute: sourceAttr,
					staleAttribute: staleAttr,
					translatedAttribute: translatedAttr,
				},
			);
		});
		if (subtitleReset) return;
		element.setAttribute(staleAttr, "true");
		element.setAttribute(translatedAttr, "stale");
		element.removeAttribute(processedAttr);
		setSourceQueued(element, false);
		existingNote?.setAttribute("data-stale", "true");
	}

	function flushPendingStaleSources() {
		staleFlushTimer = null;
		for (const element of pendingStaleSources) markSourceStale(element);
		pendingStaleSources.clear();
	}

	function scheduleStaleFlush() {
		if (!staleFlushTimer) {
			staleFlushTimer = window.setTimeout(flushPendingStaleSources, 120);
		}
	}

	function markRelatedSourcesStale(node) {
		if (!node) return;
		const element =
			node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
		if (
			!element ||
			element.closest(`[${rootAttr}]`) ||
			isInsideTranslation(element)
		)
			return;
		const directSource = element.closest(`[${sourceAttr}]`);
		if (!directSource) return;
		if (SubtitleApi.isSubtitleProfile(activeSiteProfile)) {
			markSourceStale(directSource);
			return;
		}
		pendingStaleSources.add(directSource);
		scheduleStaleFlush();
	}

	function flushObserverMutations() {
		observerFlushTimer = null;
		const mutations = pendingObserverMutations.splice(0);
		let shouldScheduleTranslation = false;

		for (const mutation of mutations) {
			const targetElement =
				mutation.target?.nodeType === Node.ELEMENT_NODE
					? mutation.target
					: mutation.target?.parentElement;
			if (
				targetElement &&
				(targetElement.closest(`[${rootAttr}]`) ||
					isInsideTranslation(targetElement))
			)
				continue;
			if (mutation.type === "characterData" || mutation.type === "attributes") {
				markRelatedSourcesStale(mutation.target);
				shouldScheduleTranslation = true;
				continue;
			}
			if (mutation.type !== "childList") continue;
			markRelatedSourcesStale(mutation.target);
			for (const node of mutation.removedNodes) {
				withObserverPaused(() => {
					SubtitleApi.removeDetachedSubtitleSources(activeSiteProfile, node, {
						findNote: getExistingNoteForSource,
						processedAttribute: processedAttr,
						queuedAttribute: queuedAttr,
						sourceAttribute: sourceAttr,
						staleAttribute: staleAttr,
						translatedAttribute: translatedAttr,
					});
				});
			}
			for (const node of mutation.addedNodes) {
				if (node.nodeType !== Node.ELEMENT_NODE || !isInsideTranslation(node)) {
					markRelatedSourcesStale(node);
				}
			}
			shouldScheduleTranslation = true;
		}

		if (shouldScheduleTranslation) {
			onScheduleVisibleTranslation();
		}
	}

	function ensureObserver() {
		if (observer || !document.body) return;
		observer = new MutationObserver((mutations) => {
			const relevantMutations = SubtitleApi.isSubtitleProfile(activeSiteProfile)
				? mutations.filter((mutation) =>
						isSubtitleRelatedMutation(mutation, {
							Node,
							selector: SubtitleApi.YOUTUBE_CAPTION_SEGMENT_SELECTOR,
						}),
					)
				: mutations;

			if (relevantMutations.length === 0) {
				return;
			}

			pendingObserverMutations.push(...relevantMutations);
			if (observerDebounceMs <= 0) {
				flushObserverMutations();
				return;
			}
			if (!observerFlushTimer) {
				observerFlushTimer = window.setTimeout(
					flushObserverMutations,
					observerDebounceMs,
				);
			}
		});
		observePageMutations();
		contentLifecycle.start();
	}

	function cleanup() {
		observer?.disconnect();
		observer = null;
		contentLifecycle.cleanup();
		for (const timer of [observerFlushTimer, staleFlushTimer]) {
			if (timer) window.clearTimeout(timer);
		}
		observerFlushTimer = null;
		staleFlushTimer = null;
		pendingObserverMutations.length = 0;
		pendingStaleSources.clear();
	}

	return { cleanup, ensureObserver, withObserverPaused };
}

export { isSubtitleRelatedMutation };
export default { createPageObserver, isSubtitleRelatedMutation };
