((root) => {
	const form = document.getElementById("settings-form");
	const apiKeyInput = document.getElementById("api-key");
	const baseUrlInput = document.getElementById("base-url");
	const modelInput = document.getElementById("model");
	const targetLanguageInput = document.getElementById("target-language");
	const systemPromptTemplateInput = document.getElementById(
		"system-prompt-template",
	);
	const userPromptTemplateInput = document.getElementById(
		"user-prompt-template",
	);
	const translationUnderlineColorInput = document.getElementById(
		"translation-underline-color",
	);
	const translationUnderlineStyleInput = document.getElementById(
		"translation-underline-style",
	);
	const translationUnderlineThicknessInput = document.getElementById(
		"translation-underline-thickness",
	);
	const translationUnderlineOffsetInput = document.getElementById(
		"translation-underline-offset",
	);
	const showTranslationDebugInfoInput = document.getElementById(
		"show-translation-debug-info",
	);
	const selectionPanelPositionModeInput = document.getElementById(
		"selection-panel-position-mode",
	);
	const translationAppearancePreview = document.getElementById(
		"translation-appearance-preview",
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
	const testButton = document.getElementById("test-button");

	function getFormSettings() {
		return {
			apiKey: apiKeyInput.value,
			baseUrl: baseUrlInput.value,
			model: modelInput.value,
			systemPromptTemplate: systemPromptTemplateInput.value,
			userPromptTemplate: userPromptTemplateInput.value,
			translationUnderlineColor: translationUnderlineColorInput.value,
			translationUnderlineStyle: translationUnderlineStyleInput.value,
			translationUnderlineThickness: translationUnderlineThicknessInput.value,
			translationUnderlineOffset: translationUnderlineOffsetInput.value,
			showTranslationDebugInfo: showTranslationDebugInfoInput.checked,
			selectionPanelPositionMode: selectionPanelPositionModeInput.value,
			targetLanguage: targetLanguageInput.value,
			disabledDomains: disabledDomainsInput.value,
		};
	}

	function renderAppearancePreview() {
		const appearance = TranslatorStorage.normalizeTranslationAppearance(
			getFormSettings(),
		);

		translationAppearancePreview.style.textDecorationColor =
			appearance.translationUnderlineColor;
		translationAppearancePreview.style.textDecorationStyle =
			appearance.translationUnderlineStyle;
		translationAppearancePreview.style.textDecorationThickness = `${appearance.translationUnderlineThickness}px`;
		translationAppearancePreview.style.textUnderlineOffset = `${appearance.translationUnderlineOffset}px`;
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
				TranslatorStorage.DEFAULT_SETTINGS.systemPromptTemplate,
			userPromptTemplate:
				formSettings.userPromptTemplate.trim() ||
				TranslatorStorage.DEFAULT_SETTINGS.userPromptTemplate,
			targetLanguage:
				formSettings.targetLanguage.trim() ||
				TranslatorStorage.DEFAULT_SETTINGS.targetLanguage,
		};
	}

	function renderPromptPreview() {
		if (
			!root.TranslatorApi ||
			typeof root.TranslatorApi.buildTranslationInput !== "function"
		) {
			systemPromptPreview.value = "Prompt preview is unavailable.";
			userPromptPreview.value = "Prompt preview is unavailable.";
			return;
		}

		const settings = buildPreviewSettings();
		const input = root.TranslatorApi.buildTranslationInput({
			systemPromptTemplate: settings.systemPromptTemplate,
			userPromptTemplate: settings.userPromptTemplate,
			items: [
				{ id: "preview-1", kind: "paragraph", text: "Sample source text." },
			],
			targetLanguage: settings.targetLanguage,
		});

		systemPromptPreview.value = input[0]?.content ? input[0].content : "";
		userPromptPreview.value = input[1]?.content ? input[1].content : "";
		const promptWarnings = TranslatorStorage.lintPromptTemplates(
			getFormSettings(),
		);
		const systemTokens = root.TranslatorApi.estimateTokenCount(
			systemPromptPreview.value,
		);
		const userTokens = root.TranslatorApi.estimateTokenCount(
			userPromptPreview.value,
		);

		promptPreviewStats.textContent = `Estimated prompt size: ~${systemTokens + userTokens} tokens (system ${systemTokens} + user ${userTokens}).`;
		promptLintStatus.hidden = promptWarnings.length === 0;
		promptLintStatus.textContent = promptWarnings.join(" ");
		renderAppearancePreview();
	}

	function resetSystemPrompt() {
		systemPromptTemplateInput.value =
			TranslatorStorage.DEFAULT_SETTINGS.systemPromptTemplate;
		renderPromptPreview();
		showBanner("System prompt template reset to the default value.", false);
	}

	function resetUserPrompt() {
		userPromptTemplateInput.value =
			TranslatorStorage.DEFAULT_SETTINGS.userPromptTemplate;
		renderPromptPreview();
		showBanner("User prompt template reset to the default value.", false);
	}

	async function updatePermissionStatus(baseUrl) {
		try {
			const originPattern = TranslatorStorage.getApiPermissionPattern(baseUrl);
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
		const originPattern = TranslatorStorage.getApiPermissionPattern(baseUrl);
		const permission = { origins: [originPattern] };
		const alreadyGranted = await chrome.permissions.contains(permission);

		if (alreadyGranted) {
			return true;
		}

		const granted = await chrome.permissions.request(permission);

		return granted;
	}

	async function loadSettings() {
		const settings = await TranslatorStorage.getSettings();

		apiKeyInput.value = settings.apiKey;
		baseUrlInput.value = settings.baseUrl;
		modelInput.value = settings.model;
		targetLanguageInput.value = settings.targetLanguage;
		systemPromptTemplateInput.value = settings.systemPromptTemplate;
		userPromptTemplateInput.value = settings.userPromptTemplate;
		translationUnderlineColorInput.value = settings.translationUnderlineColor;
		translationUnderlineStyleInput.value = settings.translationUnderlineStyle;
		translationUnderlineThicknessInput.value = String(
			settings.translationUnderlineThickness,
		);
		translationUnderlineOffsetInput.value = String(
			settings.translationUnderlineOffset,
		);
		showTranslationDebugInfoInput.checked = Boolean(
			settings.showTranslationDebugInfo,
		);
		selectionPanelPositionModeInput.value =
			TranslatorStorage.normalizeSelectionPanelPositionMode(
				settings.selectionPanelPositionMode,
			);
		disabledDomainsInput.value = settings.disabledDomains || "";
		renderPromptPreview();
		await updatePermissionStatus(settings.baseUrl);
	}

	async function handleSave(event) {
		event.preventDefault();
		clearBanner();

		const validation = TranslatorStorage.validateSettings(getFormSettings());

		if (!validation.isValid) {
			showBanner(validation.errors.join(" "), true);
			await updatePermissionStatus(baseUrlInput.value);
			return;
		}

		const permissionGranted = await maybeRequestPermission(
			validation.settings.baseUrl,
		);
		await TranslatorStorage.saveSettings(validation.settings);
		await updatePermissionStatus(validation.settings.baseUrl);
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

		const validation = TranslatorStorage.validateSettings(getFormSettings());

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

		const response = await chrome.runtime.sendMessage({
			type: "test-connection",
			payload: validation.settings,
		});

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

	form.addEventListener("submit", (event) => {
		handleSave(event).catch((error) => {
			showBanner(error.message, true);
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

	targetLanguageInput.addEventListener("input", renderPromptPreview);
	systemPromptTemplateInput.addEventListener("input", renderPromptPreview);
	userPromptTemplateInput.addEventListener("input", renderPromptPreview);
	showTranslationDebugInfoInput.addEventListener("input", renderPromptPreview);
	translationUnderlineColorInput.addEventListener(
		"input",
		renderAppearancePreview,
	);
	translationUnderlineStyleInput.addEventListener(
		"input",
		renderAppearancePreview,
	);
	translationUnderlineThicknessInput.addEventListener(
		"input",
		renderAppearancePreview,
	);
	translationUnderlineOffsetInput.addEventListener(
		"input",
		renderAppearancePreview,
	);
	resetSystemPromptButton.addEventListener("click", resetSystemPrompt);
	resetUserPromptButton.addEventListener("click", resetUserPrompt);

	loadSettings().catch((error) => {
		showBanner(error.message, true);
	});
})(typeof globalThis !== "undefined" ? globalThis : this);
