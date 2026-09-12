import { Theme } from "@radix-ui/themes";
import { Tabs } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";

import Settings from "../shared/settings.js";
import { AdvancedSection } from "./advanced-section.jsx";
import { AppearanceSection } from "./appearance-section.jsx";
import {
	applyAppearancePreset,
	buildPromptPreview,
	clearEditedFieldError,
	createOptionsDraft,
	getConnectionErrorMessage,
	getInvalidFieldIds,
	isOptionsDraftDirty,
	resetAppearanceDraft,
	updateDraftField,
} from "./model.js";
import { createOptionsApi } from "./options-api.js";
import {
	OptionsHeader,
	SaveBar,
	SettingsNavigation,
} from "./options-shell.jsx";
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
	status: "Ready to test your connection.",
});

function OptionsApp() {
	const theme = useSystemTheme();
	const [draft, setDraft] = useState(() =>
		createOptionsDraft(Settings.DEFAULT_SETTINGS),
	);
	const [savedSettings, setSavedSettings] = useState(() =>
		createOptionsDraft(Settings.DEFAULT_SETTINGS),
	);
	const [activeTab, setActiveTab] = useState("setup");
	const [focusTarget, setFocusTarget] = useState("");
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

	useEffect(() => {
		if (focusTarget) {
			document.getElementById(focusTarget)?.focus();
			setFocusTarget("");
		}
	}, [focusTarget]);

	function revealInvalidField(id) {
		const field = document.getElementById(id);
		const panel = field?.closest("[data-panel]");
		if (panel) {
			field
				.closest(".appearance-disclosure")
				?.querySelector('.appearance-disclosure-trigger[data-state="closed"]')
				?.click();
			setActiveTab(panel.dataset.panel);
			setFocusTarget(id);
		}
	}

	function showValidationErrors(validation) {
		const ids = getInvalidFieldIds(validation.errors);
		setInvalidFields(new Set(ids));
		setBanner({ message: validation.errors.join(" "), tone: "red" });
		revealInvalidField(ids[0]);
	}

	function handleInvalid(event) {
		event.preventDefault();
		const fields = [
			...event.currentTarget.querySelectorAll(
				"input:invalid, select:invalid, textarea:invalid",
			),
		];
		if (event.target !== fields[0]) {
			return;
		}
		setInvalidFields(new Set(fields.map((field) => field.id)));
		setBanner({
			message: `${event.target.labels?.[0]?.textContent || "Invalid value"}: ${event.target.validationMessage}`,
			tone: "red",
		});
		revealInvalidField(event.target.id);
	}

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
		setInvalidFields((current) => clearEditedFieldError(current, path));
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
				showValidationErrors(validation);
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
				showValidationErrors(validation);
				setTestState({
					details: "Fix the settings errors and try again.",
					status: "Validation failed.",
				});
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
					message: getConnectionErrorMessage(
						response?.error,
						validation.settings.apiKey,
					),
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
			accentColor="teal"
			appearance={theme}
			grayColor="sage"
			hasBackground={false}
			radius="large"
			scaling="100%"
		>
			<main className="options-layout">
				<OptionsHeader />

				<form
					aria-busy={!loaded}
					className="options-form"
					data-validation-attempted={invalidFields.size > 0}
					id="settings-form"
					onInvalid={handleInvalid}
					onSubmit={handleSave}
				>
					<fieldset className="options-fieldset" disabled={!loaded}>
						<Tabs.Root value={activeTab} onValueChange={setActiveTab}>
							<SettingsNavigation />

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

					<SaveBar
						banner={banner}
						dirty={dirty}
						loaded={loaded}
						loadError={loadError}
						onTest={handleTestConnection}
						saving={saving}
						testing={testing}
					/>
				</form>
			</main>
		</Theme>
	);
}

export { OptionsApp };
export default OptionsApp;
