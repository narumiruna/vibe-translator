import {
	GlobeIcon,
	LightningBoltIcon,
	LockClosedIcon,
	VideoIcon,
} from "@radix-ui/react-icons";
import { Text } from "@radix-ui/themes";

import {
	FormSection,
	PasswordInput,
	StatusCard,
	TextInput,
} from "./components.jsx";

function SetupSection({
	draft,
	invalidFields,
	onBlurBaseUrl,
	onField,
	permission,
	testState,
}) {
	return (
		<div className="setup-grid">
			<FormSection
				id="api-section-title"
				icon={LightningBoltIcon}
				title="API Connection"
				description="Bring your own model. Connect once, read anywhere."
			>
				<div className="field-stack">
					<PasswordInput
						autoComplete="off"
						id="api-key"
						invalid={invalidFields.has("api-key")}
						label="API Key"
						name="apiKey"
						note="Use a key from your API provider."
						onChange={(event) => onField("apiKey", event.target.value)}
						placeholder="Enter your API key"
						required
						spellCheck={false}
						value={draft.apiKey}
					/>
					<TextInput
						autoCapitalize="none"
						id="base-url"
						inputMode="url"
						invalid={invalidFields.has("base-url")}
						label="Base URL"
						name="baseUrl"
						note={
							<>
								Your OpenAI-compatible endpoint, including <code>/v1</code>.
							</>
						}
						onBlur={onBlurBaseUrl}
						onChange={(event) => onField("baseUrl", event.target.value)}
						placeholder="https://api.openai.com/v1"
						required
						spellCheck={false}
						type="url"
						value={draft.baseUrl}
					/>
					<TextInput
						autoCapitalize="none"
						id="model"
						invalid={invalidFields.has("model")}
						label="Model"
						name="model"
						note="Use the exact model name from your provider."
						onChange={(event) => onField("model", event.target.value)}
						placeholder="gpt-4.1-mini"
						required
						spellCheck={false}
						value={draft.model}
					/>
				</div>
				<div className="privacy-note">
					<LockClosedIcon aria-hidden="true" />
					<Text as="p" size="1">
						API access is limited to your configured origin. Save or test to
						grant permission.
					</Text>
				</div>
			</FormSection>

			<div className="setup-preferences">
				<FormSection
					id="language-section-title"
					icon={GlobeIcon}
					title="Language"
				>
					<TextInput
						id="target-language"
						invalid={invalidFields.has("target-language")}
						label="Target Language"
						name="targetLanguage"
						note="Translate pages and selected text into this language."
						onChange={(event) => onField("targetLanguage", event.target.value)}
						placeholder="台灣正體中文"
						required
						value={draft.targetLanguage}
					/>
				</FormSection>

				<FormSection
					id="youtube-subtitles-section-title"
					icon={VideoIcon}
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
							Choose how translated captions appear in the player.
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
								<small>Keep the original above its translation.</small>
							</span>
						</label>
						<label className="choice-option">
							<input
								checked={
									draft.youtubeSubtitleDisplayMode === "translation-only"
								}
								name="youtubeSubtitleDisplayMode"
								onChange={(event) =>
									onField("youtubeSubtitleDisplayMode", event.target.value)
								}
								type="radio"
								value="translation-only"
							/>
							<span>
								<strong>Translation only</strong>
								<small>Hide the original when its translation is ready.</small>
							</span>
						</label>
					</fieldset>
				</FormSection>
			</div>

			<section className="status-grid" aria-label="Connection status">
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
			</section>
		</div>
	);
}

export { SetupSection };
export default SetupSection;
