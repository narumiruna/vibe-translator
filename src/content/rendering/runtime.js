export function createContentRenderer(options = {}) {
	const {
		document,
		window,
		chrome,
		pageState,
		activeSiteProfile: ACTIVE_SITE_PROFILE,
		siteProfileId: SITE_PROFILE_ID,
		sourceAttr: SOURCE_ATTR,
		noteAttr: NOTE_ATTR,
		staleAttr: STALE_ATTR,
		translatedAttr: TRANSLATED_ATTR,
		processedAttr: PROCESSED_ATTR,
		queuedAttr: QUEUED_ATTR,
		rootAttr: ROOT_ATTR,
		siteRootSelector: SITE_ROOT_SELECTOR,
		directNoteTargetSelector: DIRECT_NOTE_TARGET_SELECTOR,
		readableBlockSelector: READABLE_BLOCK_SELECTOR,
		terminalLikeSelector: TERMINAL_LIKE_SELECTOR,
		SelectionPanelApi,
		SubtitleApi,
		Messages,
		isHeadingLikeElement,
		isReadableTitleLink,
		withObserverPaused,
		ensureStyles,
		ensureObserver,
		getExistingNoteForSource,
		getSegmentContent,
		rememberSourceText,
		setSourceTranslated,
		setSourceQueued,
		collectPageItems,
		activatePageTranslationSession,
		applyYoutubeControlState,
		recordYoutubeDiagnostic,
		isDebugInfoEnabled,
	} = options;
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
		pageState.pageTranslation.targetLanguage = payload.targetLanguage || "";
		pageState.youtubeSubtitleTranslations?.clear?.();
		if (pageState.youtubeControl.button) {
			applyYoutubeControlState(pageState.youtubeControl.button, "active");
		}

		const extraction = collectPageItems({ windowed: true });

		renderExtractionDebugPanel(extraction.debug);
		if (SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE)) {
			recordYoutubeDiagnostic(
				"initial-extraction",
				`Found ${extraction.totalSegments} caption source(s); ${extraction.items?.length || 0} pending item(s)`,
			);
		}

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
		const cachedSubtitleCount = SubtitleApi.cacheSubtitleTranslations(
			pageState.youtubeSubtitleTranslations,
			payload.translations,
		);

		const translationMap = new Map(
			(payload.translations || []).map((item) => [item.id, item]),
		);
		const reboundSources = new Set();
		let rendered = 0;
		let rebound = 0;
		let stale = 0;
		let missingTarget = 0;

		if (SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE)) {
			const captionRoot = document.querySelector(SITE_ROOT_SELECTOR);
			const captionSources = Array.from(
				captionRoot?.querySelectorAll(DIRECT_NOTE_TARGET_SELECTOR) || [],
			);

			for (const translationItem of payload.translations || []) {
				if (
					document.querySelector(`[${SOURCE_ATTR}="${translationItem.id}"]`)
				) {
					continue;
				}

				const matchingSource = SubtitleApi.findMatchingSubtitleSource(
					ACTIVE_SITE_PROFILE,
					captionSources,
					translationItem.sourceText,
					(source) => getSegmentContent(source).text,
					reboundSources,
				);

				if (!matchingSource) {
					missingTarget += 1;
					continue;
				}

				matchingSource.setAttribute(SOURCE_ATTR, translationItem.id);
				matchingSource.setAttribute(QUEUED_ATTR, "true");
				rememberSourceText(matchingSource, translationItem.sourceText);
				reboundSources.add(matchingSource);
				rebound += 1;
			}
		}

		for (const element of document.querySelectorAll(`[${SOURCE_ATTR}]`)) {
			const id = element.getAttribute(SOURCE_ATTR);
			const translationItem = translationMap.get(id);
			const translation = translationItem?.translation;

			if (!translation) {
				continue;
			}

			if (
				SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE) &&
				translationItem.sourceText !== getSegmentContent(element).text
			) {
				stale += 1;
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
			} else {
				missingTarget += 1;
			}
		}

		if (SubtitleApi.isSubtitleProfile(ACTIVE_SITE_PROFILE)) {
			recordYoutubeDiagnostic(
				"render",
				`Received ${translationMap.size} translation(s); rendered ${rendered}; rebound ${rebound}; stale ${stale}; missing target ${missingTarget}`,
				{ show: stale > 0 || (missingTarget > 0 && cachedSubtitleCount === 0) },
			);
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

	const selectionPanelRenderer = SelectionPanelApi
		? SelectionPanelApi.createSelectionPanelRenderer({
				document,
				window,
				rootAttr: ROOT_ATTR,
				appendFormattedText,
				ensureObserver,
				ensureStyles,
				onRetry(payload) {
					chrome.runtime
						.sendMessage(Messages.retrySelectionTranslation(payload))
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

	function cleanupRendering() {
		selectionPanelRenderer?.cleanup();
		for (const element of document.querySelectorAll(
			`[${ROOT_ATTR}="toast-layer"], [${ROOT_ATTR}="debug-panel"]`,
		)) {
			element.remove();
		}
	}
	return {
		clearPagePlaceholders,
		clearPendingTranslations,
		clearSelectionTranslation,
		cleanupRendering,
		getDebugProfileLabel,
		getNoteElementTagName,
		isSafeNoteInsertionTarget: _isSafeNoteInsertionTarget,
		renderExtractionDebugPanel,
		renderPagePlaceholders,
		renderPageTranslations,
		renderSelectionError,
		renderSelectionPlaceholder,
		renderSelectionTranslation,
		showToast,
		startPageTranslationSession,
		shouldAppendNoteInsideTarget,
	};
}
