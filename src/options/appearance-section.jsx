import { ChevronDownIcon, ResetIcon } from "@radix-ui/react-icons";
import { Button, Card, Heading, Text } from "@radix-ui/themes";
import { Accordion, ToggleGroup } from "radix-ui";
import {
	ReadingAppearancePreview,
	SelectionAppearancePreview,
} from "./appearance-preview.jsx";
import {
	CheckboxField,
	FieldLabel,
	FormSection,
	NativeSelect,
	NumberInput,
} from "./components.jsx";

const TYPOGRAPHY_FIELDS = [
	{
		id: "inline-font-size",
		key: "fontSizePx",
		label: "Font Size (px)",
		max: 24,
		min: 14,
		step: 1,
	},
	{
		id: "inline-line-height",
		key: "lineHeight",
		label: "Line Height",
		max: 2.2,
		min: 1.3,
		step: 0.01,
	},
];
const LAYOUT_FIELDS = [
	["inline-max-width", "maxWidthPx", "Maximum Width (px)", 480, 1000],
	["inline-margin-top", "marginTopPx", "Top Spacing (px)", 0, 48],
	["inline-margin-bottom", "marginBottomPx", "Bottom Spacing (px)", 0, 48],
	[
		"inline-padding-vertical",
		"paddingVerticalPx",
		"Vertical Padding (px)",
		0,
		32,
	],
	[
		"inline-padding-horizontal",
		"paddingHorizontalPx",
		"Horizontal Padding (px)",
		0,
		32,
	],
	["inline-border-radius", "borderRadiusPx", "Corner Radius (px)", 0, 24],
	["inline-accent-width", "accentWidthPx", "Accent Width (px)", 0, 8],
];
const SELECTION_FIELDS = [
	["selection-width", "widthPx", "Width (px)", 240, 480, 1],
	["selection-font-size", "fontSizePx", "Font Size (px)", 12, 20, 1],
	["selection-line-height", "lineHeight", "Line Height", 1.3, 1.8, 0.01],
	["selection-border-radius", "borderRadiusPx", "Corner Radius (px)", 0, 24, 1],
	[
		"selection-surface-opacity",
		"surfaceOpacityPercent",
		"Surface Opacity (%)",
		85,
		100,
		1,
	],
];
const INLINE_COLORS = [
	["backgroundColor", "Background"],
	["textColor", "Text"],
	["accentColor", "Accent"],
	["labelColor", "Label"],
];
const SELECTION_COLORS = [
	["surfaceColor", "Surface"],
	["textColor", "Text"],
	["accentColor", "Accent"],
];

function numberValue(event) {
	return event.target.value === "" ? "" : Number(event.target.value);
}

function AppearanceNumber({ descriptor, onChange, value }) {
	const [id, _key, label, min, max, step = 1] = descriptor;

	return (
		<NumberInput
			id={id}
			label={label}
			max={max}
			min={min}
			onChange={(event) => onChange(numberValue(event))}
			step={step}
			value={value}
		/>
	);
}

function ColorFields({ colors, fields, idPrefix, onChange }) {
	return (
		<div className="appearance-color-grid">
			{fields.map(([key, label]) => {
				const id = `${idPrefix}-${key
					.replace("Color", "")
					.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;

				return (
					<FieldLabel id={id} key={key} label={label}>
						{() => (
							<input
								id={id}
								onChange={(event) => onChange(key, event.target.value)}
								type="color"
								value={colors[key]}
							/>
						)}
					</FieldLabel>
				);
			})}
		</div>
	);
}

function DisclosureGroup({ children, label, value }) {
	return (
		<Accordion.Item className="appearance-disclosure" value={value}>
			<Accordion.Header className="appearance-disclosure-header">
				<Accordion.Trigger className="appearance-disclosure-trigger">
					{label}
					<ChevronDownIcon aria-hidden="true" />
				</Accordion.Trigger>
			</Accordion.Header>
			<Accordion.Content className="appearance-disclosure-content" forceMount>
				{children}
			</Accordion.Content>
		</Accordion.Item>
	);
}

function AppearanceSection({
	dirty,
	draft,
	onAppearanceField,
	onApplyPreset,
	onField,
	onResetAppearance,
	previewTheme,
	setPreviewTheme,
}) {
	const appearance = draft.translationAppearance;
	const inline = appearance.inline;
	const selection = appearance.selection;

	return (
		<FormSection id="appearance-section-title" title="Appearance">
			<Card
				className="appearance-panel"
				size="3"
				aria-labelledby="reading-style-title"
			>
				<div className="appearance-panel-header appearance-heading-row">
					<div>
						<Heading as="h3" id="reading-style-title" size="3">
							Bilingual Reading
						</Heading>
						<Text as="p" className="field-note" size="1">
							Customize extension-owned translations without changing the
							original page text.
						</Text>
					</div>
					<Button
						id="reset-appearance-button"
						onClick={onResetAppearance}
						type="button"
						variant="soft"
					>
						<ResetIcon aria-hidden="true" />
						Reset Appearance
					</Button>
				</div>

				<NativeSelect
					id="translation-appearance-preset"
					label="Style Preset"
					name="translationAppearancePreset"
					onChange={(event) => onApplyPreset(event.target.value)}
					value={appearance.presetId}
				>
					<option value="calm-reading">Calm Reading</option>
					<option value="minimal">Minimal</option>
					<option value="high-contrast">High Contrast</option>
					<option value="custom">Custom</option>
				</NativeSelect>

				<ToggleGroup.Root
					aria-label="Preview color scheme"
					className="preview-toolbar"
					onValueChange={(value) => value && setPreviewTheme(value)}
					type="single"
					value={previewTheme}
				>
					<ToggleGroup.Item
						className="preview-theme-button"
						data-appearance-theme="light"
						value="light"
					>
						Light
					</ToggleGroup.Item>
					<ToggleGroup.Item
						className="preview-theme-button"
						data-appearance-theme="dark"
						value="dark"
					>
						Dark
					</ToggleGroup.Item>
				</ToggleGroup.Root>

				<ReadingAppearancePreview
					appearance={appearance}
					previewTheme={previewTheme}
					targetLanguage={draft.targetLanguage}
				/>

				<Accordion.Root className="appearance-disclosures" type="multiple">
					<DisclosureGroup label="Typography" value="inline-typography">
						<div className="appearance-control-grid">
							<NativeSelect
								id="inline-font-family"
								label="Font Family"
								onChange={(event) =>
									onAppearanceField(
										["inline", "fontFamily"],
										event.target.value,
									)
								}
								value={inline.fontFamily}
							>
								<option value="serif">Serif</option>
								<option value="sans-serif">Sans Serif</option>
								<option value="monospace">Monospace</option>
								<option value="inherit">Inherit from page</option>
							</NativeSelect>
							{TYPOGRAPHY_FIELDS.map((field) => (
								<NumberInput
									id={field.id}
									key={field.key}
									label={field.label}
									max={field.max}
									min={field.min}
									onChange={(event) =>
										onAppearanceField(["inline", field.key], numberValue(event))
									}
									step={field.step}
									value={inline[field.key]}
								/>
							))}
							<NativeSelect
								id="inline-font-weight"
								label="Font Weight"
								onChange={(event) =>
									onAppearanceField(
										["inline", "fontWeight"],
										Number(event.target.value),
									)
								}
								value={inline.fontWeight}
							>
								<option value="400">Regular · 400</option>
								<option value="500">Medium · 500</option>
								<option value="600">Semibold · 600</option>
							</NativeSelect>
						</div>
					</DisclosureGroup>

					<DisclosureGroup label="Layout" value="inline-layout">
						<div className="appearance-control-grid">
							{LAYOUT_FIELDS.map((field) => (
								<AppearanceNumber
									descriptor={field}
									key={field[1]}
									onChange={(value) =>
										onAppearanceField(["inline", field[1]], value)
									}
									value={inline[field[1]]}
								/>
							))}
						</div>
						<div className="appearance-toggle-grid">
							<CheckboxField
								checked={inline.showBackground}
								id="inline-show-background"
								label="Show background"
								onChange={(event) =>
									onAppearanceField(
										["inline", "showBackground"],
										event.target.checked,
									)
								}
							/>
							<CheckboxField
								checked={inline.showLabel}
								id="inline-show-label"
								label="Show language label"
								onChange={(event) =>
									onAppearanceField(
										["inline", "showLabel"],
										event.target.checked,
									)
								}
							/>
							<CheckboxField
								checked={inline.enableFadeAnimation}
								id="inline-enable-fade"
								label="Fade in completed translations"
								onChange={(event) =>
									onAppearanceField(
										["inline", "enableFadeAnimation"],
										event.target.checked,
									)
								}
							/>
						</div>
					</DisclosureGroup>

					{["light", "dark"].map((theme) => (
						<DisclosureGroup
							key={`inline-${theme}`}
							label={`${theme === "light" ? "Light" : "Dark"} Colors`}
							value={`inline-${theme}-colors`}
						>
							<ColorFields
								colors={inline[theme]}
								fields={INLINE_COLORS}
								idPrefix={`inline-${theme}`}
								onChange={(key, value) =>
									onAppearanceField(["inline", theme, key], value)
								}
							/>
						</DisclosureGroup>
					))}
				</Accordion.Root>
			</Card>

			<Card
				className="appearance-panel"
				size="3"
				aria-labelledby="selection-panel-title"
			>
				<div className="appearance-panel-header">
					<Heading as="h3" id="selection-panel-title" size="3">
						Selection Panel
					</Heading>
					<Text as="p" className="field-note" size="1">
						These compact-panel controls stay independent from page translation
						cards.
					</Text>
				</div>

				<div className="appearance-control-grid selection-controls">
					<NativeSelect
						id="selection-panel-position-mode"
						label="Panel Position"
						name="selectionPanelPositionMode"
						onChange={(event) =>
							onField("selectionPanelPositionMode", event.target.value)
						}
						value={draft.selectionPanelPositionMode}
					>
						<option value="near-selection">Near selected text</option>
						<option value="bottom-right">Bottom-right corner</option>
					</NativeSelect>
					{SELECTION_FIELDS.map((field) => (
						<AppearanceNumber
							descriptor={field}
							key={field[1]}
							onChange={(value) =>
								onAppearanceField(["selection", field[1]], value)
							}
							value={selection[field[1]]}
						/>
					))}
				</div>

				<Accordion.Root className="appearance-disclosures" type="multiple">
					{["light", "dark"].map((theme) => (
						<DisclosureGroup
							key={`selection-${theme}`}
							label={`${theme === "light" ? "Light" : "Dark"} Colors`}
							value={`selection-${theme}-colors`}
						>
							<ColorFields
								colors={selection[theme]}
								fields={SELECTION_COLORS}
								idPrefix={`selection-${theme}`}
								onChange={(key, value) =>
									onAppearanceField(["selection", theme, key], value)
								}
							/>
						</DisclosureGroup>
					))}
				</Accordion.Root>

				<SelectionAppearancePreview
					appearance={appearance}
					previewTheme={previewTheme}
					targetLanguage={draft.targetLanguage}
				/>
				<Text
					as="p"
					className="field-note preview-only-note"
					id="appearance-preview-status"
					size="1"
				>
					{dirty
						? "Preview only — save settings to apply these changes."
						: "Saved appearance preview."}
				</Text>
			</Card>
		</FormSection>
	);
}

export { AppearanceSection };
export default AppearanceSection;
