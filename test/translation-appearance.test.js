const assert = require("node:assert/strict");
const test = require("node:test");

const {
	DEFAULT_TRANSLATION_APPEARANCE,
	FONT_FAMILY_STACKS,
	TRANSLATION_APPEARANCE_PRESETS,
	calculateContrastRatio,
	createTranslationAppearancePreset,
	getContrastingTextColor,
	normalizeTranslationAppearance,
} = require("../src/translation-appearance.js");

test("Calm Reading preserves the current inline and selection appearance", () => {
	assert.deepEqual(DEFAULT_TRANSLATION_APPEARANCE, {
		presetId: "calm-reading",
		inline: {
			fontFamily: "serif",
			fontSizePx: 16,
			fontWeight: 400,
			lineHeight: 1.72,
			maxWidthPx: 832,
			marginTopPx: 16,
			marginBottomPx: 24,
			paddingVerticalPx: 13,
			paddingHorizontalPx: 16,
			borderRadiusPx: 8,
			accentWidthPx: 3,
			showBackground: true,
			showLabel: true,
			enableFadeAnimation: true,
			light: {
				backgroundColor: "#f3f8f5",
				textColor: "#1f2923",
				accentColor: "#4b765c",
				labelColor: "#4b765c",
			},
			dark: {
				backgroundColor: "#17231c",
				textColor: "#eef6f0",
				accentColor: "#78a987",
				labelColor: "#91b99d",
			},
		},
		selection: {
			widthPx: 280,
			fontSizePx: 14,
			lineHeight: 1.45,
			borderRadiusPx: 14,
			surfaceOpacityPercent: 97,
			light: {
				surfaceColor: "#ffffff",
				textColor: "#3a3a3c",
				accentColor: "#007aff",
			},
			dark: {
				surfaceColor: "#1c1c1e",
				textColor: "#d1d1d6",
				accentColor: "#0a84ff",
			},
		},
	});
	assert.equal(FONT_FAMILY_STACKS.inherit, "inherit");
	assert.ok(FONT_FAMILY_STACKS.monospace.includes("monospace"));
});

test("appearance presets return independent complete copies", () => {
	const minimal = createTranslationAppearancePreset("minimal");
	const highContrast = createTranslationAppearancePreset("high-contrast");

	assert.equal(minimal.inline.showBackground, false);
	assert.equal(minimal.inline.showLabel, false);
	assert.equal(minimal.inline.enableFadeAnimation, false);
	assert.equal(minimal.inline.accentWidthPx, 1);
	assert.equal(highContrast.inline.fontSizePx, 17);
	assert.equal(highContrast.inline.accentWidthPx, 4);
	assert.equal(highContrast.inline.light.backgroundColor, "#ffffff");
	assert.deepEqual(Object.keys(TRANSLATION_APPEARANCE_PRESETS), [
		"calm-reading",
		"minimal",
		"high-contrast",
	]);

	minimal.inline.light.textColor = "#000000";
	assert.equal(
		createTranslationAppearancePreset("minimal").inline.light.textColor,
		"#374151",
	);
});

test("normalizeTranslationAppearance clamps unsafe and malformed values", () => {
	const normalized = normalizeTranslationAppearance({
		presetId: "unknown",
		inline: {
			fontFamily: "url(javascript:alert(1))",
			fontSizePx: 99,
			fontWeight: 550,
			lineHeight: 0,
			maxWidthPx: "NaN",
			marginTopPx: -10,
			marginBottomPx: 999,
			paddingVerticalPx: null,
			paddingHorizontalPx: 99,
			borderRadiusPx: -1,
			accentWidthPx: 99,
			showBackground: "false",
			showLabel: false,
			enableFadeAnimation: 1,
			light: {
				backgroundColor: "red; } body { display:none",
				textColor: "#ABCDEF",
				accentColor: "#12345",
				labelColor: null,
			},
		},
		selection: {
			widthPx: 999,
			fontSizePx: 1,
			lineHeight: 9,
			borderRadiusPx: 99,
			surfaceOpacityPercent: 2,
			dark: {
				surfaceColor: "#AABBCC",
				textColor: "not-a-color",
				accentColor: "#112233",
			},
		},
	});

	assert.equal(normalized.presetId, "calm-reading");
	assert.deepEqual(
		{
			fontFamily: normalized.inline.fontFamily,
			fontSizePx: normalized.inline.fontSizePx,
			fontWeight: normalized.inline.fontWeight,
			lineHeight: normalized.inline.lineHeight,
			maxWidthPx: normalized.inline.maxWidthPx,
			marginTopPx: normalized.inline.marginTopPx,
			marginBottomPx: normalized.inline.marginBottomPx,
			paddingVerticalPx: normalized.inline.paddingVerticalPx,
			paddingHorizontalPx: normalized.inline.paddingHorizontalPx,
			borderRadiusPx: normalized.inline.borderRadiusPx,
			accentWidthPx: normalized.inline.accentWidthPx,
			showBackground: normalized.inline.showBackground,
			showLabel: normalized.inline.showLabel,
			enableFadeAnimation: normalized.inline.enableFadeAnimation,
		},
		{
			fontFamily: "serif",
			fontSizePx: 24,
			fontWeight: 400,
			lineHeight: 1.3,
			maxWidthPx: 832,
			marginTopPx: 0,
			marginBottomPx: 48,
			paddingVerticalPx: 13,
			paddingHorizontalPx: 32,
			borderRadiusPx: 0,
			accentWidthPx: 8,
			showBackground: true,
			showLabel: false,
			enableFadeAnimation: true,
		},
	);
	assert.deepEqual(normalized.inline.light, {
		backgroundColor: "#f3f8f5",
		textColor: "#abcdef",
		accentColor: "#4b765c",
		labelColor: "#4b765c",
	});
	assert.deepEqual(
		{
			widthPx: normalized.selection.widthPx,
			fontSizePx: normalized.selection.fontSizePx,
			lineHeight: normalized.selection.lineHeight,
			borderRadiusPx: normalized.selection.borderRadiusPx,
			surfaceOpacityPercent: normalized.selection.surfaceOpacityPercent,
		},
		{
			widthPx: 480,
			fontSizePx: 12,
			lineHeight: 1.8,
			borderRadiusPx: 24,
			surfaceOpacityPercent: 85,
		},
	);
	assert.deepEqual(normalized.selection.dark, {
		surfaceColor: "#aabbcc",
		textColor: "#d1d1d6",
		accentColor: "#112233",
	});
});

test("partial custom appearance fills missing nested values without mutating input", () => {
	const input = {
		presetId: "custom",
		inline: { fontFamily: "inherit", fontSizePx: 18 },
		selection: { widthPx: 320 },
	};
	const snapshot = structuredClone(input);
	const normalized = normalizeTranslationAppearance(input);

	assert.deepEqual(input, snapshot);
	assert.equal(normalized.presetId, "custom");
	assert.equal(normalized.inline.fontFamily, "inherit");
	assert.equal(normalized.inline.fontSizePx, 18);
	assert.equal(normalized.inline.lineHeight, 1.72);
	assert.equal(normalized.selection.widthPx, 320);
	assert.equal(normalized.selection.light.surfaceColor, "#ffffff");
});

test("getContrastingTextColor chooses the stronger black or white contrast", () => {
	assert.equal(getContrastingTextColor("#000000"), "#ffffff");
	assert.equal(getContrastingTextColor("#ffffff"), "#000000");
	assert.equal(getContrastingTextColor("#007aff"), "#000000");
	assert.equal(getContrastingTextColor("invalid"), "#000000");
});

test("calculateContrastRatio validates colors and returns WCAG ratios", () => {
	assert.equal(calculateContrastRatio("#000000", "#ffffff"), 21);
	assert.equal(calculateContrastRatio("#ffffff", "#ffffff"), 1);
	assert.equal(calculateContrastRatio(" #000000 ", "#ffffff"), 21);
	assert.equal(calculateContrastRatio("bad", "#ffffff"), null);
	assert.ok(calculateContrastRatio("#1f2923", "#f3f8f5") > 4.5);
});
