((root) => {
	const INLINE_FIELDS = Object.freeze({
		fontFamily: ["inline-font-family", "value"],
		fontSizePx: ["inline-font-size", "number"],
		fontWeight: ["inline-font-weight", "number"],
		lineHeight: ["inline-line-height", "number"],
		maxWidthPx: ["inline-max-width", "number"],
		marginTopPx: ["inline-margin-top", "number"],
		marginBottomPx: ["inline-margin-bottom", "number"],
		paddingVerticalPx: ["inline-padding-vertical", "number"],
		paddingHorizontalPx: ["inline-padding-horizontal", "number"],
		borderRadiusPx: ["inline-border-radius", "number"],
		accentWidthPx: ["inline-accent-width", "number"],
		showBackground: ["inline-show-background", "checked"],
		showLabel: ["inline-show-label", "checked"],
		enableFadeAnimation: ["inline-enable-fade", "checked"],
	});
	const INLINE_THEME_FIELDS = Object.freeze({
		light: Object.freeze({
			backgroundColor: "inline-light-background",
			textColor: "inline-light-text",
			accentColor: "inline-light-accent",
			labelColor: "inline-light-label",
		}),
		dark: Object.freeze({
			backgroundColor: "inline-dark-background",
			textColor: "inline-dark-text",
			accentColor: "inline-dark-accent",
			labelColor: "inline-dark-label",
		}),
	});
	const SELECTION_FIELDS = Object.freeze({
		widthPx: ["selection-width", "number"],
		fontSizePx: ["selection-font-size", "number"],
		lineHeight: ["selection-line-height", "number"],
		borderRadiusPx: ["selection-border-radius", "number"],
		surfaceOpacityPercent: ["selection-surface-opacity", "number"],
	});
	const SELECTION_THEME_FIELDS = Object.freeze({
		light: Object.freeze({
			surfaceColor: "selection-light-surface",
			textColor: "selection-light-text",
			accentColor: "selection-light-accent",
		}),
		dark: Object.freeze({
			surfaceColor: "selection-dark-surface",
			textColor: "selection-dark-text",
			accentColor: "selection-dark-accent",
		}),
	});

	function createAppearanceController(options = {}) {
		const doc = options.document || root.document;
		const appearanceApi = options.appearanceApi || root.TranslatorAppearance;

		if (!doc || !appearanceApi) {
			throw new Error("Appearance controller requires document and API.");
		}

		const presetInput = doc.getElementById("translation-appearance-preset");
		const preview = doc.getElementById("reading-preview");
		const previewTranslation = doc.getElementById(
			"reading-preview-translation",
		);
		const previewLabel = doc.getElementById("reading-preview-label");
		const contrastStatus = doc.getElementById("appearance-contrast-status");
		const selectionPreview = doc.getElementById("selection-appearance-preview");
		const selectionPreviewTitle = doc.getElementById("selection-preview-title");
		const resetButton = doc.getElementById("reset-appearance-button");
		const themeButtons = Array.from(
			doc.querySelectorAll("[data-appearance-theme]"),
		);
		const controlledInputs = [];
		let previewTheme = "light";
		let settingValues = false;

		function getElement(id) {
			const element = doc.getElementById(id);

			if (!element) {
				throw new Error(`Missing appearance control: ${id}`);
			}

			return element;
		}

		function readField([id, type]) {
			const input = getElement(id);

			if (type === "checked") {
				return input.checked;
			}

			if (type === "number") {
				return input.value === "" ? undefined : Number(input.value);
			}

			return input.value;
		}

		function writeField([id, type], value) {
			const input = getElement(id);

			if (type === "checked") {
				input.checked = Boolean(value);
				return;
			}

			input.value = String(value);
		}

		function readTheme(fieldMap) {
			return Object.fromEntries(
				Object.entries(fieldMap).map(([key, id]) => [
					key,
					getElement(id).value,
				]),
			);
		}

		function writeTheme(fieldMap, values) {
			for (const [key, id] of Object.entries(fieldMap)) {
				getElement(id).value = values[key];
			}
		}

		function getRawAppearance() {
			return {
				presetId: presetInput.value,
				inline: {
					...Object.fromEntries(
						Object.entries(INLINE_FIELDS).map(([key, descriptor]) => [
							key,
							readField(descriptor),
						]),
					),
					light: readTheme(INLINE_THEME_FIELDS.light),
					dark: readTheme(INLINE_THEME_FIELDS.dark),
				},
				selection: {
					...Object.fromEntries(
						Object.entries(SELECTION_FIELDS).map(([key, descriptor]) => [
							key,
							readField(descriptor),
						]),
					),
					light: readTheme(SELECTION_THEME_FIELDS.light),
					dark: readTheme(SELECTION_THEME_FIELDS.dark),
				},
			};
		}

		function getAppearance() {
			return appearanceApi.normalizeTranslationAppearance(getRawAppearance());
		}

		function setAppearance(value) {
			const appearance = appearanceApi.normalizeTranslationAppearance(value);

			settingValues = true;
			presetInput.value = appearance.presetId;
			for (const [key, descriptor] of Object.entries(INLINE_FIELDS)) {
				writeField(descriptor, appearance.inline[key]);
			}
			writeTheme(INLINE_THEME_FIELDS.light, appearance.inline.light);
			writeTheme(INLINE_THEME_FIELDS.dark, appearance.inline.dark);
			for (const [key, descriptor] of Object.entries(SELECTION_FIELDS)) {
				writeField(descriptor, appearance.selection[key]);
			}
			writeTheme(SELECTION_THEME_FIELDS.light, appearance.selection.light);
			writeTheme(SELECTION_THEME_FIELDS.dark, appearance.selection.dark);
			settingValues = false;
			renderPreview();
		}

		function setPreviewTheme(theme) {
			previewTheme = theme === "dark" ? "dark" : "light";
			for (const button of themeButtons) {
				const active = button.dataset.appearanceTheme === previewTheme;

				button.classList.toggle("active", active);
				button.setAttribute("aria-pressed", active ? "true" : "false");
			}
			renderPreview();
		}

		function renderContrast(appearance) {
			if (!appearance.inline.showBackground) {
				contrastStatus.classList.remove("is-warning");
				contrastStatus.textContent = `${previewTheme === "dark" ? "Dark" : "Light"} contrast cannot be verified because the translation background is disabled.`;
				return;
			}

			const colors = appearance.inline[previewTheme];
			const ratio = appearanceApi.calculateContrastRatio(
				colors.textColor,
				colors.backgroundColor,
			);
			const passes = ratio !== null && ratio >= 4.5;

			contrastStatus.classList.toggle("is-warning", !passes);
			contrastStatus.textContent = `${previewTheme === "dark" ? "Dark" : "Light"} text contrast: ${ratio?.toFixed(2) || "unknown"}:1 · ${passes ? "WCAG AA" : "Below WCAG AA (4.5:1)"}`;
		}

		function renderPreview() {
			const appearance = getAppearance();
			const inline = appearance.inline;
			const inlineColors = inline[previewTheme];
			const selection = appearance.selection;
			const selectionColors = selection[previewTheme];
			const targetLanguage =
				typeof options.getTargetLanguage === "function"
					? options.getTargetLanguage()
					: "";

			preview.dataset.previewTheme = previewTheme;
			previewTranslation.style.width = "100%";
			previewTranslation.style.maxWidth = `${inline.maxWidthPx}px`;
			previewTranslation.style.marginTop = `${inline.marginTopPx}px`;
			previewTranslation.style.marginBottom = `${inline.marginBottomPx}px`;
			previewTranslation.style.padding = `${inline.paddingVerticalPx}px ${inline.paddingHorizontalPx}px`;
			previewTranslation.style.borderLeft = `${inline.accentWidthPx}px solid ${inlineColors.accentColor}`;
			previewTranslation.style.borderRadius = `0 ${inline.borderRadiusPx}px ${inline.borderRadiusPx}px 0`;
			previewTranslation.style.background = inline.showBackground
				? inlineColors.backgroundColor
				: "transparent";
			previewTranslation.style.color = inlineColors.textColor;
			previewTranslation.style.fontFamily =
				appearanceApi.FONT_FAMILY_STACKS[inline.fontFamily];
			previewTranslation.style.fontSize = `${inline.fontSizePx}px`;
			previewTranslation.style.fontWeight = String(inline.fontWeight);
			previewTranslation.style.lineHeight = String(inline.lineHeight);
			previewTranslation.classList.toggle(
				"has-fade",
				inline.enableFadeAnimation,
			);
			previewLabel.hidden = !inline.showLabel;
			previewLabel.textContent = targetLanguage || "Target language";
			previewLabel.style.color = inlineColors.labelColor;

			selectionPreview.style.width = `${selection.widthPx}px`;
			selectionPreview.style.maxWidth = "100%";
			selectionPreview.style.borderRadius = `${selection.borderRadiusPx}px`;
			selectionPreview.style.background = appearanceApi.hexToRgbaColor(
				selectionColors.surfaceColor,
				selection.surfaceOpacityPercent,
			);
			selectionPreview.style.color = selectionColors.textColor;
			selectionPreview.style.fontSize = `${selection.fontSizePx}px`;
			selectionPreview.style.lineHeight = String(selection.lineHeight);
			selectionPreviewTitle.style.color = selectionColors.accentColor;
			selectionPreviewTitle.textContent = `Selected Text Translation · ${targetLanguage || "Target language"}`;
			renderContrast(appearance);
		}

		function markCustomAndRender() {
			if (!settingValues) {
				presetInput.value = "custom";
			}
			renderPreview();
		}

		function applyPreset(presetId) {
			if (presetId === "custom") {
				renderPreview();
				return;
			}

			const current = getAppearance();
			const preset = appearanceApi.createTranslationAppearancePreset(presetId);

			preset.selection = current.selection;
			setAppearance(preset);
		}

		function resetAppearance() {
			setAppearance(
				appearanceApi.createTranslationAppearancePreset("calm-reading"),
			);
		}

		function connect() {
			for (const descriptor of [
				...Object.values(INLINE_FIELDS),
				...Object.values(SELECTION_FIELDS),
			]) {
				controlledInputs.push(getElement(descriptor[0]));
			}
			for (const fieldMap of [
				...Object.values(INLINE_THEME_FIELDS),
				...Object.values(SELECTION_THEME_FIELDS),
			]) {
				for (const id of Object.values(fieldMap)) {
					controlledInputs.push(getElement(id));
				}
			}

			presetInput.addEventListener("change", () => {
				applyPreset(presetInput.value);
			});
			for (const input of controlledInputs) {
				input.addEventListener("input", markCustomAndRender);
				input.addEventListener("change", markCustomAndRender);
			}
			for (const button of themeButtons) {
				button.addEventListener("click", () => {
					setPreviewTheme(button.dataset.appearanceTheme);
				});
			}
			resetButton.addEventListener("click", () => {
				resetAppearance();
				if (typeof options.onReset === "function") {
					options.onReset();
				}
			});
		}

		connect();
		resetAppearance();

		return {
			applyPreset,
			getAppearance,
			renderPreview,
			resetAppearance,
			setAppearance,
			setPreviewTheme,
		};
	}

	const api = { createAppearanceController };

	root.TranslatorOptionsAppearance = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
