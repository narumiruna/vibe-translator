import { Cross2Icon, ReaderIcon } from "@radix-ui/react-icons";

import Appearance from "../shared/appearance.js";

function ReadingAppearancePreview({
	appearance: value,
	previewTheme,
	targetLanguage,
}) {
	const appearance = Appearance.normalizeTranslationAppearance(value);
	const inline = appearance.inline;
	const colors = inline[previewTheme];
	const ratio = inline.showBackground
		? Appearance.calculateContrastRatio(
				colors.textColor,
				colors.backgroundColor,
			)
		: null;
	const passes = ratio !== null && ratio >= 4.5;
	const language = targetLanguage.trim() || "Target language";
	const contrastText = inline.showBackground
		? `${previewTheme === "dark" ? "Dark" : "Light"} text contrast: ${ratio?.toFixed(2) || "unknown"}:1 · ${passes ? "WCAG AA" : "Below WCAG AA (4.5:1)"}`
		: `${previewTheme === "dark" ? "Dark" : "Light"} contrast cannot be verified because the translation background is disabled.`;

	return (
		<>
			<div
				className="reading-preview"
				data-preview-theme={previewTheme}
				id="reading-preview"
			>
				<div className="reading-preview-source">
					<span className="reading-preview-source-label">Original</span>
					<p>Why do I keep announcing how future programming will change?</p>
				</div>
				<div
					className={`reading-preview-translation${inline.enableFadeAnimation ? " has-fade" : ""}`}
					id="reading-preview-translation"
					style={{
						background: inline.showBackground
							? colors.backgroundColor
							: "transparent",
						borderLeft: `${inline.accentWidthPx}px solid ${colors.accentColor}`,
						borderRadius: `0 ${inline.borderRadiusPx}px ${inline.borderRadiusPx}px 0`,
						color: colors.textColor,
						fontFamily: Appearance.FONT_FAMILY_STACKS[inline.fontFamily],
						fontSize: `${inline.fontSizePx}px`,
						fontWeight: inline.fontWeight,
						lineHeight: inline.lineHeight,
						marginBottom: `${inline.marginBottomPx}px`,
						marginTop: `${inline.marginTopPx}px`,
						maxWidth: `${inline.maxWidthPx}px`,
						padding: `${inline.paddingVerticalPx}px ${inline.paddingHorizontalPx}px`,
						width: "100%",
					}}
				>
					{inline.showLabel ? (
						<span
							className="reading-preview-label"
							id="reading-preview-label"
							style={{ color: colors.labelColor }}
						>
							{language}
						</span>
					) : null}
					<p>我為什麼不斷談論未來的程式設計將如何改變？</p>
				</div>
			</div>
			<p
				aria-live="polite"
				className={`contrast-status${inline.showBackground && !passes ? " is-warning" : ""}`}
				id="appearance-contrast-status"
			>
				{contrastText}
			</p>
		</>
	);
}

function SelectionAppearancePreview({
	appearance: value,
	previewTheme,
	targetLanguage,
}) {
	const appearance = Appearance.normalizeTranslationAppearance(value);
	const selection = appearance.selection;
	const colors = selection[previewTheme];
	const language = targetLanguage.trim() || "Target language";

	return (
		<div
			aria-label="Selection translation panel preview"
			className="selection-appearance-preview"
			id="selection-appearance-preview"
			role="img"
			style={{
				background: Appearance.hexToRgbaColor(
					colors.surfaceColor,
					selection.surfaceOpacityPercent,
				),
				borderRadius: `${selection.borderRadiusPx}px`,
				color: colors.textColor,
				fontSize: `${selection.fontSizePx}px`,
				lineHeight: selection.lineHeight,
				maxWidth: "100%",
				width: `min(${selection.widthPx}px, 100%)`,
			}}
		>
			<div className="selection-preview-header">
				<div className="selection-preview-identity">
					<span
						aria-hidden="true"
						className="selection-preview-icon"
						style={{
							background: Appearance.hexToRgbaColor(
								colors.accentColor,
								previewTheme === "dark" ? 16 : 10,
							),
							color: colors.accentColor,
						}}
					>
						<ReaderIcon />
					</span>
					<strong id="selection-preview-title">Translation</strong>
					<span
						className="selection-preview-language"
						id="selection-preview-language"
						style={{ color: colors.textColor }}
					>
						{language}
					</span>
				</div>
				<span aria-hidden="true" className="selection-preview-close">
					<Cross2Icon />
				</span>
			</div>
			<p>這是一段簡短的選取文字翻譯預覽。</p>
		</div>
	);
}

export { ReadingAppearancePreview, SelectionAppearancePreview };
export default { ReadingAppearancePreview, SelectionAppearancePreview };
