import { ExclamationTriangleIcon, ResetIcon } from "@radix-ui/react-icons";
import { Button, Callout, Card, Heading, Text } from "@radix-ui/themes";

import { FormSection, TextAreaInput } from "./components.jsx";

function PromptsSection({ draft, invalidFields, onField, onReset, preview }) {
	return (
		<FormSection id="prompt-section-title" title="Prompt Templates">
			<div className="field-stack">
				<TextAreaInput
					id="system-prompt-template"
					invalid={invalidFields.has("system-prompt-template")}
					label="System Prompt Template"
					name="systemPromptTemplate"
					note={
						<>
							Fully controls the system prompt sent to the model. You can use
							placeholders like <code>{"{{targetLanguage}}"}</code>,{" "}
							<code>{"{{itemCount}}"}</code>, and <code>{"{{itemKind}}"}</code>.
						</>
					}
					onChange={(event) =>
						onField("systemPromptTemplate", event.target.value)
					}
					placeholder="Write the full system prompt template here."
					rows={8}
					value={draft.systemPromptTemplate}
				/>
				<TextAreaInput
					id="user-prompt-template"
					invalid={invalidFields.has("user-prompt-template")}
					label="User Prompt Template"
					name="userPromptTemplate"
					note={
						<>
							Fully controls the user prompt. It must include{" "}
							<code>{"{{sourcePayload}}"}</code> so source items are sent to the
							model.
						</>
					}
					onChange={(event) =>
						onField("userPromptTemplate", event.target.value)
					}
					placeholder="Write the full user prompt template here."
					rows={8}
					value={draft.userPromptTemplate}
				/>
			</div>

			<Card className="prompt-preview" size="3">
				<div className="prompt-preview-header">
					<div>
						<Heading as="h3" id="prompt-preview-title" size="3">
							Actual Prompt Preview
						</Heading>
						<Text as="p" className="field-note" size="1">
							Shows the exact prompts sent to the API, rendered from the
							templates above.
						</Text>
					</div>
					<div className="prompt-preview-actions">
						<Button
							id="reset-system-prompt-button"
							onClick={() => onReset("system")}
							type="button"
							variant="soft"
						>
							<ResetIcon aria-hidden="true" />
							Reset System Template
						</Button>
						<Button
							id="reset-user-prompt-button"
							onClick={() => onReset("user")}
							type="button"
							variant="soft"
						>
							<ResetIcon aria-hidden="true" />
							Reset User Template
						</Button>
					</div>
				</div>

				<Text as="p" className="field-note" id="prompt-preview-stats" size="1">
					Estimated prompt size: ~{preview.totalTokens} tokens (system{" "}
					{preview.systemTokens} + user {preview.userTokens}).
				</Text>
				<Callout.Root
					color="amber"
					hidden={preview.warnings.length === 0}
					id="prompt-lint-status"
					role="status"
					size="1"
				>
					<Callout.Icon>
						<ExclamationTriangleIcon aria-hidden="true" />
					</Callout.Icon>
					<Callout.Text>{preview.warnings.join(" ")}</Callout.Text>
				</Callout.Root>

				<div className="field-stack">
					<TextAreaInput
						id="system-prompt-preview"
						label="System Prompt"
						readOnly
						rows={8}
						value={preview.systemPrompt}
					/>
					<TextAreaInput
						id="user-prompt-preview"
						label="User Prompt"
						readOnly
						rows={8}
						value={preview.userPrompt}
					/>
				</div>
			</Card>
		</FormSection>
	);
}

export { PromptsSection };
export default PromptsSection;
