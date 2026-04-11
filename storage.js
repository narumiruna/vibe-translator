(function (root) {
  const STORAGE_KEY = 'settings';
  const LEGACY_DEFAULT_INSTRUCTIONS = 'Preserve meaning, tone, and technical accuracy in translation.';

  function createDefaultSystemPromptTemplate(leadInstruction) {
    return [
      String(leadInstruction || LEGACY_DEFAULT_INSTRUCTIONS).trim(),
      'You are rendering bilingual technical reading aids.',
      'Translate only natural-language prose into the target language.',
      'Preserve placeholders like __OT_TOKEN_1__ exactly and do not translate, remove, or reorder them unnecessarily.',
      'Keep structure by item kind. Headings stay headings, list items stay list items, table cells stay table cells.'
    ].join('\n');
  }

  const DEFAULT_SYSTEM_PROMPT_TEMPLATE = createDefaultSystemPromptTemplate();
  const DEFAULT_USER_PROMPT_TEMPLATE = [
    'Translate the provided source items into {{targetLanguage}}.',
    'Preserve meaning, order, and inline structure.',
    'Keep file paths, commands, URLs, code spans, identifiers, and product names in their original form.',
    'Return translations for every source item.',
    '',
    '{{sourcePayload}}'
  ].join('\n');

  const DEFAULT_SETTINGS = Object.freeze({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
    targetLanguage: '繁體中文',
    disabledDomains: ''
  });

  function migrateLegacyPromptSettings(input) {
    const source = input || {};
    const legacyInstructions = String(source.instructions || '').trim();
    const systemPromptTemplate = String(source.systemPromptTemplate || '').trim();
    const userPromptTemplate = String(source.userPromptTemplate || '').trim();

    return {
      ...source,
      systemPromptTemplate: systemPromptTemplate || createDefaultSystemPromptTemplate(legacyInstructions),
      userPromptTemplate: userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE
    };
  }

  function normalizeDisabledDomains(value) {
    return String(value || '')
      .split(/[\n,]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .join('\n');
  }

  function normalizeBaseUrl(value) {
    const trimmed = String(value || '').trim();

    if (!trimmed) {
      return DEFAULT_SETTINGS.baseUrl;
    }

    return trimmed.replace(/\/+$/, '');
  }

  function validateSettings(input) {
    const merged = migrateLegacyPromptSettings({
      ...DEFAULT_SETTINGS,
      ...(input || {})
    });
    const settings = {
      apiKey: String(merged.apiKey || '').trim(),
      baseUrl: normalizeBaseUrl(merged.baseUrl),
      model: String(merged.model || '').trim(),
      systemPromptTemplate: String(merged.systemPromptTemplate || '').trim() || DEFAULT_SETTINGS.systemPromptTemplate,
      userPromptTemplate: String(merged.userPromptTemplate || '').trim() || DEFAULT_SETTINGS.userPromptTemplate,
      targetLanguage: String(merged.targetLanguage || '').trim(),
      disabledDomains: normalizeDisabledDomains(merged.disabledDomains)
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

    if (!settings.systemPromptTemplate) {
      errors.push('System prompt template is required.');
    }

    if (!settings.userPromptTemplate) {
      errors.push('User prompt template is required.');
    } else if (!settings.userPromptTemplate.includes('{{sourcePayload}}')) {
      errors.push('User prompt template must include {{sourcePayload}}.');
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

    return migrateLegacyPromptSettings({
      ...DEFAULT_SETTINGS,
      ...(stored[STORAGE_KEY] || {})
    });
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
    DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    DEFAULT_USER_PROMPT_TEMPLATE,
    LEGACY_DEFAULT_INSTRUCTIONS,
    STORAGE_KEY,
    createDefaultSystemPromptTemplate,
    getApiPermissionPattern,
    getSettings,
    hasCompleteSettings,
    migrateLegacyPromptSettings,
    normalizeBaseUrl,
    normalizeDisabledDomains,
    saveSettings,
    validateSettings
  };

  root.TranslatorStorage = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
