(function () {
  const form = document.getElementById('settings-form');
  const apiKeyInput = document.getElementById('api-key');
  const baseUrlInput = document.getElementById('base-url');
  const modelInput = document.getElementById('model');
  const targetLanguageInput = document.getElementById('target-language');
  const instructionsInput = document.getElementById('instructions');
  const disabledDomainsInput = document.getElementById('disabled-domains');
  const permissionStatus = document.getElementById('permission-status');
  const testStatus = document.getElementById('test-status');
  const formStatus = document.getElementById('form-status');
  const testButton = document.getElementById('test-button');

  function getFormSettings() {
    return {
      apiKey: apiKeyInput.value,
      baseUrl: baseUrlInput.value,
      model: modelInput.value,
      instructions: instructionsInput.value,
      targetLanguage: targetLanguageInput.value,
      disabledDomains: disabledDomainsInput.value
    };
  }

  function showBanner(message, isError) {
    formStatus.hidden = false;
    formStatus.textContent = message;
    formStatus.classList.toggle('is-error', Boolean(isError));
  }

  function clearBanner() {
    formStatus.hidden = true;
    formStatus.textContent = '';
    formStatus.classList.remove('is-error');
  }

  async function updatePermissionStatus(baseUrl) {
    try {
      const originPattern = TranslatorStorage.getApiPermissionPattern(baseUrl);
      const granted = await chrome.permissions.contains({
        origins: [originPattern]
      });

      permissionStatus.textContent = granted
        ? `Granted for ${originPattern}`
        : `Not granted for ${originPattern}`;
    } catch (error) {
      permissionStatus.textContent = 'Base URL is invalid.';
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
    instructionsInput.value = settings.instructions;
    disabledDomainsInput.value = settings.disabledDomains || '';
    await updatePermissionStatus(settings.baseUrl);
  }

  async function handleSave(event) {
    event.preventDefault();
    clearBanner();

    const validation = TranslatorStorage.validateSettings(getFormSettings());

    if (!validation.isValid) {
      showBanner(validation.errors.join(' '), true);
      await updatePermissionStatus(baseUrlInput.value);
      return;
    }

    const permissionGranted = await maybeRequestPermission(validation.settings.baseUrl);
    await TranslatorStorage.saveSettings(validation.settings);
    await updatePermissionStatus(validation.settings.baseUrl);
    showBanner(
      permissionGranted
        ? 'Settings saved and API origin permission granted.'
        : 'Settings saved, but the API origin permission is still not granted.',
      !permissionGranted
    );
  }

  async function handleTestConnection() {
    clearBanner();
    testStatus.textContent = 'Testing connection…';

    const validation = TranslatorStorage.validateSettings(getFormSettings());

    if (!validation.isValid) {
      testStatus.textContent = 'Validation failed.';
      showBanner(validation.errors.join(' '), true);
      return;
    }

    const permissionGranted = await maybeRequestPermission(validation.settings.baseUrl);
    await updatePermissionStatus(validation.settings.baseUrl);

    if (!permissionGranted) {
      testStatus.textContent = 'Permission denied.';
      showBanner('API origin permission is required to test the connection.', true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'test-connection',
      payload: validation.settings
    });

    if (!response || !response.ok) {
      testStatus.textContent = 'Connection test failed.';
      showBanner((response && response.error) || 'Connection test failed.', true);
      return;
    }

    testStatus.textContent = `Sample translation: ${response.translation || '(empty)'}`;
    showBanner('Connection test succeeded.', false);
  }

  form.addEventListener('submit', (event) => {
    handleSave(event).catch((error) => {
      showBanner(error.message, true);
    });
  });

  testButton.addEventListener('click', () => {
    handleTestConnection().catch((error) => {
      testStatus.textContent = 'Connection test failed.';
      showBanner(error.message, true);
    });
  });

  baseUrlInput.addEventListener('blur', () => {
    updatePermissionStatus(baseUrlInput.value).catch(() => {});
  });

  loadSettings().catch((error) => {
    showBanner(error.message, true);
  });
})();
