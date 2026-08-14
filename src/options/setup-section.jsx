import { Text } from "@radix-ui/themes";

import { FormSection, StatusCard, TextInput } from "./components.jsx";

function SetupSection({
	draft,
	invalidFields,
	onBlurBaseUrl,
	onField,
	permission,
	testState,
}) {
	return (
		<>
			<FormSection id="language-section-title" title="Language">
				<TextInput
					id="target-language"
					invalid={invalidFields.has("target-language")}
					label="Target Language"
					name="targetLanguage"
					note="The language that pages and selected text will be translated into."
					onChange={(event) => onField("targetLanguage", event.target.value)}
					placeholder="台灣正體中文"
					required
					value={draft.targetLanguage}
				/>
			</FormSection>

			<FormSection
				id="youtube-subtitles-section-title"
				title="YouTube Subtitles"
			>
				<fieldset
					className="choice-group"
					aria-describedby="youtube-subtitle-display-note"
				>
					<legend>Display Mode</legend>
					<Text
						as="p"
						className="field-note"
						id="youtube-subtitle-display-note"
						size="1"
					>
						Choose whether translated YouTube captions keep the matching
						original line visible.
					</Text>
					<label className="choice-option">
						<input
							checked={draft.youtubeSubtitleDisplayMode === "bilingual"}
							name="youtubeSubtitleDisplayMode"
							onChange={(event) =>
								onField("youtubeSubtitleDisplayMode", event.target.value)
							}
							type="radio"
							value="bilingual"
						/>
						<span>
							<strong>Original and translation</strong>
							<small>
								Keep the native caption visible above its translation.
							</small>
						</span>
					</label>
					<label className="choice-option">
						<input
							checked={draft.youtubeSubtitleDisplayMode === "translation-only"}
							name="youtubeSubtitleDisplayMode"
							onChange={(event) =>
								onField("youtubeSubtitleDisplayMode", event.target.value)
							}
							type="radio"
							value="translation-only"
						/>
						<span>
							<strong>Translation only</strong>
							<small>
								Hide a native caption after its matching translation is ready.
							</small>
						</span>
					</label>
				</fieldset>
			</FormSection>

			<FormSection id="api-section-title" title="API Connection">
				<div className="field-stack">
					<TextInput
						autoComplete="off"
						id="api-key"
						invalid={invalidFields.has("api-key")}
						label="API Key"
						name="apiKey"
						onChange={(event) => onField("apiKey", event.target.value)}
						required
						type="password"
						value={draft.apiKey}
					/>
					<TextInput
						id="base-url"
						inputMode="url"
						invalid={invalidFields.has("base-url")}
						label="Base URL"
						name="baseUrl"
						onBlur={onBlurBaseUrl}
						onChange={(event) => onField("baseUrl", event.target.value)}
						placeholder="https://api.openai.com/v1"
						required
						type="url"
						value={draft.baseUrl}
					/>
					<TextInput
						id="model"
						invalid={invalidFields.has("model")}
						label="Model"
						name="model"
						onChange={(event) => onField("model", event.target.value)}
						placeholder="gpt-4.1-mini"
						required
						value={draft.model}
					/>
				</div>
			</FormSection>

			<FormSection id="status-section-title" title="Status">
				<div className="status-grid">
					<StatusCard title="API Origin Permission">
						<Text
							as="p"
							aria-live="polite"
							className="status-text"
							data-status={permission.status}
							id="permission-status"
							size="2"
						>
							{permission.message}
						</Text>
					</StatusCard>
					<StatusCard title="Connection Test">
						<Text
							as="p"
							aria-live="polite"
							className="status-text"
							id="test-status"
							size="2"
						>
							{testState.status}
						</Text>
						<Text
							as="p"
							className="field-note status-detail"
							id="test-details"
							size="1"
						>
							{testState.details}
						</Text>
					</StatusCard>
				</div>
			</FormSection>
		</>
	);
}

export { SetupSection };
export default SetupSection;
