import Appearance from "../shared/appearance.js";
import Messages from "../shared/messages.js";
import Settings from "../shared/settings.js";
import Api from "../translation/api.js";
import { createAppearanceController } from "./appearance.js";
import "./styles.css";

const form = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key");
const baseUrlInput = document.getElementById("base-url");
const modelInput = document.getElementById("model");
const targetLanguageInput = document.getElementById("target-language");
const systemPromptTemplateInput = document.getElementById(
	"system-prompt-template",
);
const userPromptTemplateInput = document.getElementById("user-prompt-template");
const showTranslationDebugInfoInput = document.getElementById(
	"show-translation-debug-info",
);
const selectionPanelPositionModeInput = document.getElementById(
	"selection-panel-position-mode",
);
const youtubeSubtitleDisplayModeInputs = Array.from(
	document.querySelectorAll('[name="youtubeSubtitleDisplayMode"]'),
);
const disabledDomainsInput = document.getElementById("disabled-domains");
const systemPromptPreview = document.getElementById("system-prompt-preview");
const userPromptPreview = document.getElementById("user-prompt-preview");
const promptPreviewStats = document.getElementById("prompt-preview-stats");
const promptLintStatus = document.getElementById("prompt-lint-status");
const resetSystemPromptButton = document.getElementById(
	"reset-system-prompt-button",
);
const resetUserPromptButton = document.getElementById(
	"reset-user-prompt-button",
);
const permissionStatus = document.getElementById("permission-status");
const testStatus = document.getElementById("test-status");
const testDetails = document.getElementById("test-details");
const formStatus = document.getElementById("form-status");
const saveButton = document.getElementById("save-button");
const saveState = document.getElementById("save-state");
const previewStatus = document.getElementById("appearance-preview-status");
const testButton = document.getElementById("test-button");
let settingsLoaded = false;
const appearanceController = createAppearanceController({
	document,
	appearanceApi: Appearance,
	getTargetLanguage: () => targetLanguageInput.value.trim(),
	onReset: () => {
		markUnsaved();
		showBanner(
			"Appearance reset to Calm Reading. Save settings to apply it.",
			false,
		);
	},
});

function setUnsavedState(hasUnsavedChanges) {
	saveState.classList.toggle("has-unsaved-changes", Boolean(hasUnsavedChanges));
	saveState.textContent = hasUnsavedChanges
		? "Unsaved changes — preview only until saved."
		: "No unsaved changes.";
	previewStatus.textContent = hasUnsavedChanges
		? "Preview only — save settings to apply these changes."
		: "Saved appearance preview.";
}

function markUnsaved() {
	if (settingsLoaded) {
		setUnsavedState(true);
	}
}

function getFormSettings() {
	return {
		apiKey: apiKeyInput.value,
		baseUrl: baseUrlInput.value,
		model: modelInput.value,
		systemPromptTemplate: systemPromptTemplateInput.value,
		userPromptTemplate: userPromptTemplateInput.value,
		translationAppearance: appearanceController.getAppearance(),
		showTranslationDebugInfo: showTranslationDebugInfoInput.checked,
		selectionPanelPositionMode: selectionPanelPositionModeInput.value,
		youtubeSubtitleDisplayMode: youtubeSubtitleDisplayModeInputs.find(
			(input) => input.checked,
		)?.value,
		targetLanguage: targetLanguageInput.value,
		disabledDomains: disabledDomainsInput.value,
	};
}

function showBanner(message, isError) {
	formStatus.hidden = false;
	formStatus.textContent = message;
	formStatus.classList.toggle("is-error", Boolean(isError));
}

function clearBanner() {
	formStatus.hidden = true;
	formStatus.textContent = "";
	formStatus.classList.remove("is-error");
}

function buildPreviewSettings() {
	const formSettings = getFormSettings();

	return {
		systemPromptTemplate:
			formSettings.systemPromptTemplate.trim() ||
			Settings.DEFAULT_SETTINGS.systemPromptTemplate,
		userPromptTemplate:
			formSettings.userPromptTemplate.trim() ||
			Settings.DEFAULT_SETTINGS.userPromptTemplate,
		targetLanguage:
			formSettings.targetLanguage.trim() ||
			Settings.DEFAULT_SETTINGS.targetLanguage,
	};
}

function renderPromptPreview() {
	if (!Api || typeof Api.buildTranslationInput !== "function") {
		systemPromptPreview.value = "Prompt preview is unavailable.";
		userPromptPreview.value = "Prompt preview is unavailable.";
		return;
	}

	const settings = buildPreviewSettings();
	const input = Api.buildTranslationInput({
		systemPromptTemplate: settings.systemPromptTemplate,
		userPromptTemplate: settings.userPromptTemplate,
		items: [
			{ id: "preview-1", kind: "paragraph", text: "Sample source text." },
		],
		targetLanguage: settings.targetLanguage,
	});

	systemPromptPreview.value = input[0]?.content ? input[0].content : "";
	userPromptPreview.value = input[1]?.content ? input[1].content : "";
	const promptWarnings = Settings.lintPromptTemplates(getFormSettings());
	const systemTokens = Api.estimateTokenCount(systemPromptPreview.value);
	const userTokens = Api.estimateTokenCount(userPromptPreview.value);

	promptPreviewStats.textContent = `Estimated prompt size: ~${systemTokens + userTokens} tokens (system ${systemTokens} + user ${userTokens}).`;
	promptLintStatus.hidden = promptWarnings.length === 0;
	promptLintStatus.textContent = promptWarnings.join(" ");
}

function resetSystemPrompt() {
	systemPromptTemplateInput.value =
		Settings.DEFAULT_SETTINGS.systemPromptTemplate;
	markUnsaved();
	renderPromptPreview();
	showBanner("System prompt template reset to the default value.", false);
}

function resetUserPrompt() {
	userPromptTemplateInput.value = Settings.DEFAULT_SETTINGS.userPromptTemplate;
	markUnsaved();
	renderPromptPreview();
	showBanner("User prompt template reset to the default value.", false);
}

async function updatePermissionStatus(baseUrl) {
	try {
		const originPattern = Settings.getApiPermissionPattern(baseUrl);
		const granted = await chrome.permissions.contains({
			origins: [originPattern],
		});

		permissionStatus.textContent = granted
			? `Granted for ${originPattern}`
			: `Not granted for ${originPattern}`;
	} catch (_error) {
		permissionStatus.textContent = "Base URL is invalid.";
	}
}

async function maybeRequestPermission(baseUrl) {
	const originPattern = Settings.getApiPermissionPattern(baseUrl);
	const permission = { origins: [originPattern] };
	const alreadyGranted = await chrome.permissions.contains(permission);

	if (alreadyGranted) {
		return true;
	}

	const granted = await chrome.permissions.request(permission);

	return granted;
}

async function loadSettings() {
	const settings = await Settings.getSettings();

	apiKeyInput.value = settings.apiKey;
	baseUrlInput.value = settings.baseUrl;
	modelInput.value = settings.model;
	targetLanguageInput.value = settings.targetLanguage;
	systemPromptTemplateInput.value = settings.systemPromptTemplate;
	userPromptTemplateInput.value = settings.userPromptTemplate;
	appearanceController.setAppearance(settings.translationAppearance);
	showTranslationDebugInfoInput.checked = Boolean(
		settings.showTranslationDebugInfo,
	);
	selectionPanelPositionModeInput.value =
		Settings.normalizeSelectionPanelPositionMode(
			settings.selectionPanelPositionMode,
		);
	const youtubeSubtitleDisplayMode =
		Settings.normalizeYoutubeSubtitleDisplayMode(
			settings.youtubeSubtitleDisplayMode,
		);
	for (const input of youtubeSubtitleDisplayModeInputs) {
		input.checked = input.value === youtubeSubtitleDisplayMode;
	}
	disabledDomainsInput.value = settings.disabledDomains || "";
	renderPromptPreview();
	await updatePermissionStatus(settings.baseUrl);
	settingsLoaded = true;
	setUnsavedState(false);
}

async function handleSave(event) {
	event.preventDefault();
	clearBanner();

	const validation = Settings.validateSettings(getFormSettings());

	if (!validation.isValid) {
		showBanner(validation.errors.join(" "), true);
		await updatePermissionStatus(baseUrlInput.value);
		return;
	}

	const permissionGranted = await maybeRequestPermission(
		validation.settings.baseUrl,
	);
	await Settings.saveSettings(validation.settings);
	await updatePermissionStatus(validation.settings.baseUrl);
	setUnsavedState(false);
	showBanner(
		permissionGranted
			? "Settings saved and API origin permission granted."
			: "Settings saved, but the API origin permission is still not granted.",
		!permissionGranted,
	);
}

async function handleTestConnection() {
	clearBanner();
	testStatus.textContent = "Testing connection…";
	testDetails.textContent =
		"Checking translation request and /models availability…";

	const validation = Settings.validateSettings(getFormSettings());

	if (!validation.isValid) {
		testStatus.textContent = "Validation failed.";
		testDetails.textContent = "Fix the settings errors and try again.";
		showBanner(validation.errors.join(" "), true);
		return;
	}

	const permissionGranted = await maybeRequestPermission(
		validation.settings.baseUrl,
	);
	await updatePermissionStatus(validation.settings.baseUrl);

	if (!permissionGranted) {
		testStatus.textContent = "Permission denied.";
		testDetails.textContent = "Grant the API origin permission to continue.";
		showBanner(
			"API origin permission is required to test the connection.",
			true,
		);
		return;
	}

	const response = await chrome.runtime.sendMessage(
		Messages.createMessage(
			Messages.MESSAGE_TYPES.TEST_CONNECTION,
			validation.settings,
		),
	);

	if (!response?.ok) {
		testStatus.textContent = "Connection test failed.";
		testDetails.textContent =
			"The extension could not complete the test request.";
		showBanner(response?.error || "Connection test failed.", true);
		return;
	}

	testStatus.textContent = `Sample translation: ${response.translation || "(empty)"}`;
	testDetails.textContent = `Translation latency: ${response.latencyMs || 0} ms · /models: ${
		response.modelsAvailable
			? `${response.modelCount || 0} models in ${response.modelsLatencyMs || 0} ms`
			: response.modelsError || "unavailable"
	}.`;
	showBanner("Connection test succeeded.", false);
}

form.addEventListener("input", markUnsaved);
form.addEventListener("change", markUnsaved);
form.addEventListener("submit", (event) => {
	saveButton.disabled = true;
	saveButton.textContent = "Saving…";
	handleSave(event)
		.catch((error) => {
			showBanner(error.message, true);
		})
		.finally(() => {
			saveButton.disabled = false;
			saveButton.textContent = "Save Settings";
		});
});

testButton.addEventListener("click", () => {
	handleTestConnection().catch((error) => {
		testStatus.textContent = "Connection test failed.";
		showBanner(error.message, true);
	});
});

baseUrlInput.addEventListener("blur", () => {
	updatePermissionStatus(baseUrlInput.value).catch(() => {});
});

targetLanguageInput.addEventListener("input", () => {
	renderPromptPreview();
	appearanceController.renderPreview();
});
systemPromptTemplateInput.addEventListener("input", renderPromptPreview);
userPromptTemplateInput.addEventListener("input", renderPromptPreview);
showTranslationDebugInfoInput.addEventListener("input", renderPromptPreview);
resetSystemPromptButton.addEventListener("click", resetSystemPrompt);
resetUserPromptButton.addEventListener("click", resetUserPrompt);

// Tab switching
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		const target = btn.dataset.tab;
		tabBtns.forEach((b) => {
			b.classList.toggle("active", b === btn);
		});
		tabPanels.forEach((p) => {
			p.classList.toggle("active", p.dataset.panel === target);
		});
	});
});

loadSettings().catch((error) => {
	showBanner(error.message, true);
});
