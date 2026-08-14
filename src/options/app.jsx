import {
	GearIcon,
	GlobeIcon,
	LightningBoltIcon,
	ReloadIcon,
} from "@radix-ui/react-icons";
import { Card, Heading, Spinner, Text, Theme } from "@radix-ui/themes";
import { Tabs } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";

import Settings from "../shared/settings.js";
import { AdvancedSection } from "./advanced-section.jsx";
import { AppearanceSection } from "./appearance-section.jsx";
import { Button, StatusBanner } from "./components.jsx";
import {
	applyAppearancePreset,
	buildPromptPreview,
	createOptionsDraft,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	resetAppearanceDraft,
	updateDraftField,
} from "./model.js";
import { createOptionsApi } from "./options-api.js";
import { PromptsSection } from "./prompts-section.jsx";
import { SetupSection } from "./setup-section.jsx";
import { useSystemTheme } from "./use-system-theme.js";

const optionsApi = createOptionsApi();
const INITIAL_PERMISSION = Object.freeze({
	granted: false,
	message: "Checking permission…",
	originPattern: "",
	status: "checking",
});
const INITIAL_TEST_STATE = Object.freeze({
	details: "Checks both translation and the /models endpoint.",
	status: "Run a test request after saving.",
});

function OptionsApp() {
	const theme = useSystemTheme();
	const [draft, setDraft] = useState(() =>
		createOptionsDraft(Settings.DEFAULT_SETTINGS),
	);
	const [savedSettings, setSavedSettings] = useState(() =>
		createOptionsDraft(Settings.DEFAULT_SETTINGS),
	);
	const [loaded, setLoaded] = useState(false);
	const [loadError, setLoadError] = useState("");
	const [invalidFields, setInvalidFields] = useState(() => new Set());
	const [permission, setPermission] = useState(INITIAL_PERMISSION);
	const [testState, setTestState] = useState(INITIAL_TEST_STATE);
	const [banner, setBanner] = useState(null);
	const [previewTheme, setPreviewTheme] = useState("light");
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const draftRef = useRef(draft);
	const operations = useRef({ save: false, test: false });
	const permissionRequest = useRef(0);

	draftRef.current = draft;

	useEffect(() => {
		let active = true;

		async function load() {
			setLoaded(false);
			setLoadError("");
			setInvalidFields(new Set());
			setBanner(null);

			try {
				const settings = await Settings.getSettings();
				const nextDraft = createOptionsDraft(settings);
				const permissionStatus = await optionsApi.getPermissionStatus(
					nextDraft.baseUrl,
				);

				if (!active) {
					return;
				}

				setDraft(nextDraft);
				setSavedSettings(nextDraft);
				setPermission(permissionStatus);
				setLoaded(true);
			} catch (_error) {
				if (!active) {
					return;
				}

				setLoadError("Settings could not be loaded.");
				setBanner({
					message: "Settings could not be loaded. Retry before editing.",
					tone: "red",
				});
			}
		}

		load();
		return () => {
			active = false;
		};
	}, []);

	const dirty = useMemo(
		() => loaded && isOptionsDraftDirty(draft, savedSettings),
		[draft, loaded, savedSettings],
	);
	const promptPreview = useMemo(() => buildPromptPreview(draft), [draft]);

	async function refreshPermission(baseUrl) {
		const requestId = permissionRequest.current + 1;
		permissionRequest.current = requestId;
		setPermission(INITIAL_PERMISSION);
		const next = await optionsApi.getPermissionStatus(baseUrl);

		if (permissionRequest.current === requestId) {
			setPermission(next);
		}

		return next;
	}

	function onField(path, value) {
		setInvalidFields(new Set());
		setDraft((current) => updateDraftField(current, path, value));
	}

	function onAppearanceField(path, value) {
		onField(["translationAppearance", ...path], value);
	}

	function resetPrompt(kind) {
		const system = kind === "system";
		onField(
			system ? "systemPromptTemplate" : "userPromptTemplate",
			system
				? Settings.DEFAULT_SETTINGS.systemPromptTemplate
				: Settings.DEFAULT_SETTINGS.userPromptTemplate,
		);
		setBanner({
			message: `${system ? "System" : "User"} prompt template reset to the default value.`,
			tone: "green",
		});
	}

	function resetAppearance() {
		setDraft((current) => resetAppearanceDraft(current));
		setBanner({
			message: "Appearance reset to Calm Reading. Save settings to apply it.",
			tone: "green",
		});
	}

	async function handleSave(event) {
		event.preventDefault();
		if (operations.current.save || !loaded) {
			return;
		}

		operations.current.save = true;
		setSaving(true);
		setBanner(null);

		try {
			const validation = Settings.validateSettings(draft);

			if (!validation.isValid) {
				setInvalidFields(new Set(getInvalidFieldIds(validation.errors)));
				setBanner({ message: validation.errors.join(" "), tone: "red" });
				await refreshPermission(draft.baseUrl);
				return;
			}

			const permissionGranted = await optionsApi.requestPermission(
				validation.settings.baseUrl,
			);
			const saved = await Settings.saveSettings(validation.settings);

			setInvalidFields(new Set());
			setSavedSettings(createOptionsDraft(saved));
			await refreshPermission(draftRef.current.baseUrl);
			setBanner({
				message: permissionGranted
					? "Settings saved and API origin permission granted."
					: "Settings saved, but the API origin permission is still not granted.",
				tone: permissionGranted ? "green" : "red",
			});
		} catch (_error) {
			setBanner({
				message:
					"Settings could not be saved. Check permissions and try again.",
				tone: "red",
			});
		} finally {
			operations.current.save = false;
			setSaving(false);
		}
	}

	async function handleTestConnection() {
		if (operations.current.test || !loaded) {
			return;
		}

		operations.current.test = true;
		setTesting(true);
		setBanner(null);
		setTestState({
			details: "Checking translation request and /models availability…",
			status: "Testing connection…",
		});

		try {
			const validation = Settings.validateSettings(draft);

			if (!validation.isValid) {
				setInvalidFields(new Set(getInvalidFieldIds(validation.errors)));
				setTestState({
					details: "Fix the settings errors and try again.",
					status: "Validation failed.",
				});
				setBanner({ message: validation.errors.join(" "), tone: "red" });
				return;
			}

			setInvalidFields(new Set());
			const permissionGranted = await optionsApi.requestPermission(
				validation.settings.baseUrl,
			);
			await refreshPermission(validation.settings.baseUrl);

			if (!permissionGranted) {
				setTestState({
					details: "Grant the API origin permission to continue.",
					status: "Permission denied.",
				});
				setBanner({
					message: "API origin permission is required to test the connection.",
					tone: "red",
				});
				return;
			}

			const response = await optionsApi.testConnection(validation.settings);

			if (!response?.ok) {
				setTestState({
					details: "The extension could not complete the test request.",
					status: "Connection test failed.",
				});
				setBanner({
					message: "Connection test failed. Check the endpoint and model.",
					tone: "red",
				});
				return;
			}

			const draftChanged = isOptionsDraftDirty(
				draftRef.current,
				validation.settings,
			);
			const resultDetails = `Translation latency: ${response.latencyMs || 0} ms · /models: ${
				response.modelsAvailable
					? `${response.modelCount || 0} models in ${response.modelsLatencyMs || 0} ms`
					: response.modelsError || "unavailable"
			}.`;

			setTestState({
				details: draftChanged
					? `Settings changed during the test; these results cover earlier values. ${resultDetails}`
					: resultDetails,
				status: `Sample translation: ${response.translation || "(empty)"}`,
			});
			setBanner(
				draftChanged
					? {
							message:
								"Connection test succeeded for earlier values. Run it again to verify the current draft.",
							tone: "amber",
						}
					: { message: "Connection test succeeded.", tone: "green" },
			);
		} catch (_error) {
			setTestState({
				details: "The extension could not complete the test request.",
				status: "Connection test failed.",
			});
			setBanner({
				message: "Connection test failed. Check the endpoint and try again.",
				tone: "red",
			});
		} finally {
			operations.current.test = false;
			setTesting(false);
		}
	}

	return (
		<Theme
			accentColor="indigo"
			appearance={theme}
			grayColor="slate"
			hasBackground={false}
			radius="large"
			scaling="100%"
		>
			<main className="options-layout">
				<Card className="options-panel" size="4">
					<header className="hero">
						<Text as="p" className="eyebrow" size="1" weight="bold">
							<GlobeIcon aria-hidden="true" />
							Vibe Translator
						</Text>
						<Heading as="h1" size="7">
							Settings
						</Heading>
						<Text as="p" className="subtitle" color="gray" size="2">
							Configure the API endpoint, model, prompt templates, and target
							language used for page and selection translation.
						</Text>
					</header>

					<form
						aria-busy={!loaded}
						className="options-form"
						id="settings-form"
						onSubmit={handleSave}
					>
						<fieldset className="options-fieldset" disabled={!loaded}>
							<Tabs.Root defaultValue="setup">
								<Tabs.List aria-label="Settings sections" className="tab-list">
									<Tabs.Trigger
										className="tab-trigger"
										data-tab="setup"
										value="setup"
									>
										Setup
									</Tabs.Trigger>
									<Tabs.Trigger
										className="tab-trigger"
										data-tab="appearance"
										value="appearance"
									>
										Appearance
									</Tabs.Trigger>
									<Tabs.Trigger
										className="tab-trigger"
										data-tab="prompts"
										value="prompts"
									>
										Prompts
									</Tabs.Trigger>
									<Tabs.Trigger
										className="tab-trigger"
										data-tab="advanced"
										value="advanced"
									>
										Advanced
									</Tabs.Trigger>
								</Tabs.List>

								<Tabs.Content
									className="tab-content"
									data-panel="setup"
									forceMount
									value="setup"
								>
									<SetupSection
										draft={draft}
										invalidFields={invalidFields}
										onBlurBaseUrl={() => refreshPermission(draft.baseUrl)}
										onField={onField}
										permission={permission}
										testState={testState}
									/>
								</Tabs.Content>
								<Tabs.Content
									className="tab-content"
									data-panel="appearance"
									forceMount
									value="appearance"
								>
									<AppearanceSection
										dirty={dirty}
										draft={draft}
										onAppearanceField={onAppearanceField}
										onApplyPreset={(presetId) =>
											setDraft((current) =>
												applyAppearancePreset(current, presetId),
											)
										}
										onField={onField}
										onResetAppearance={resetAppearance}
										previewTheme={previewTheme}
										setPreviewTheme={setPreviewTheme}
									/>
								</Tabs.Content>
								<Tabs.Content
									className="tab-content"
									data-panel="prompts"
									forceMount
									value="prompts"
								>
									<PromptsSection
										draft={draft}
										invalidFields={invalidFields}
										onField={onField}
										onReset={resetPrompt}
										preview={promptPreview}
									/>
								</Tabs.Content>
								<Tabs.Content
									className="tab-content"
									data-panel="advanced"
									forceMount
									value="advanced"
								>
									<AdvancedSection draft={draft} onField={onField} />
								</Tabs.Content>
							</Tabs.Root>
						</fieldset>

						<div className="save-bar">
							<div className="save-summary">
								<Text
									aria-live="polite"
									className="save-state"
									color={dirty ? "amber" : "gray"}
									id="save-state"
									size="1"
									weight="medium"
								>
									{dirty
										? "Unsaved changes — preview only until saved."
										: "No unsaved changes."}
								</Text>
								{!loaded ? (
									<Text as="span" className="loading-state" size="1">
										<Spinner size="1" /> Loading settings…
									</Text>
								) : null}
							</div>
							<div className="save-bar-actions">
								<Button
									disabled={!loaded || saving || testing}
									id="save-button"
									size="3"
									type="submit"
								>
									<GearIcon aria-hidden="true" />
									{saving ? "Saving…" : "Save Settings"}
								</Button>
								<Button
									disabled={!loaded || saving || testing}
									id="test-button"
									onClick={handleTestConnection}
									size="3"
									type="button"
									variant="soft"
								>
									<LightningBoltIcon aria-hidden="true" />
									{testing ? "Testing…" : "Test Connection"}
								</Button>
								{loadError ? (
									<Button
										onClick={() => globalThis.location.reload()}
										type="button"
										variant="soft"
									>
										<ReloadIcon aria-hidden="true" /> Retry loading
									</Button>
								) : null}
							</div>
							<StatusBanner banner={banner} />
						</div>
					</form>
				</Card>
			</main>
		</Theme>
	);
}

export { OptionsApp };
export default OptionsApp;
