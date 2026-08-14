import { CheckboxField, FormSection, TextAreaInput } from "./components.jsx";

function AdvancedSection({ draft, onField }) {
	return (
		<FormSection id="advanced-section-title" title="Advanced">
			<div className="field-stack">
				<CheckboxField
					checked={draft.showTranslationDebugInfo}
					id="show-translation-debug-info"
					label="Show translation debug info on translated pages"
					note="Shows queued item ids, estimated token counts, and skipped extraction reasons in a page overlay."
					onChange={(event) =>
						onField("showTranslationDebugInfo", event.target.checked)
					}
				/>
				<TextAreaInput
					id="disabled-domains"
					label="Disabled Domains"
					name="disabledDomains"
					note="One domain per line. Translation is skipped on these sites."
					onChange={(event) => onField("disabledDomains", event.target.value)}
					placeholder={"chat.openai.com\nexample.com"}
					rows={4}
					value={draft.disabledDomains}
				/>
			</div>
		</FormSection>
	);
}

export { AdvancedSection };
export default AdvancedSection;
