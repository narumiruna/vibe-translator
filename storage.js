(function (root) {
  const STORAGE_KEY = 'settings';
  const DEFAULT_SETTINGS = Object.freeze({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    instructions:
      'You are a translation engine. Preserve meaning and tone. Output only the requested translation JSON with no explanations.',
    targetLanguage: '繁體中文'
  });

  function normalizeBaseUrl(value) {
    const trimmed = String(value || '').trim();

    if (!trimmed) {
      return DEFAULT_SETTINGS.baseUrl;
    }

    return trimmed.replace(/\/+$/, '');
  }

  function validateSettings(input) {
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(input || {})
    };
    const settings = {
      apiKey: String(merged.apiKey || '').trim(),
      baseUrl: normalizeBaseUrl(merged.baseUrl),
      model: String(merged.model || '').trim(),
      instructions: String(merged.instructions || '').trim() || DEFAULT_SETTINGS.instructions,
      targetLanguage: String(merged.targetLanguage || '').trim()
    };
    const errors = [];

    if (!settings.apiKey) {
      errors.push('API Key is required.');
    }

    if (!settings.model) {
      errors.push('Model is required.');
    }

    if (!settings.targetLanguage) {
      errors.push('Target language is required.');
    }

    try {
      const parsed = new URL(settings.baseUrl);

      if (!/^https?:$/.test(parsed.protocol)) {
        errors.push('Base URL must use HTTP or HTTPS.');
      }
    } catch (error) {
      errors.push('Base URL must be a valid URL.');
    }

    return {
      settings,
      errors,
      isValid: errors.length === 0
    };
  }

  function hasCompleteSettings(settings) {
    return validateSettings(settings).isValid;
  }

  function getApiPermissionPattern(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    const origin = new URL(normalized).origin;

    return `${origin}/*`;
  }

  async function getSettings() {
    if (!root.chrome || !chrome.storage || !chrome.storage.sync) {
      return { ...DEFAULT_SETTINGS };
    }

    const stored = await chrome.storage.sync.get(STORAGE_KEY);

    return {
      ...DEFAULT_SETTINGS,
      ...(stored[STORAGE_KEY] || {})
    };
  }

  async function saveSettings(input) {
    const result = validateSettings(input);

    if (!result.isValid) {
      throw new Error(result.errors.join(' '));
    }

    if (!root.chrome || !chrome.storage || !chrome.storage.sync) {
      return result.settings;
    }

    await chrome.storage.sync.set({
      [STORAGE_KEY]: result.settings
    });

    return result.settings;
  }

  const api = {
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    getApiPermissionPattern,
    getSettings,
    hasCompleteSettings,
    normalizeBaseUrl,
    saveSettings,
    validateSettings
  };

  root.TranslatorStorage = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
