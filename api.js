(function (root) {
  const DEFAULT_TEMPERATURE = 0.2;
  const DEFAULT_MAX_BATCH_CHARS = 5000;

  function buildTranslationMessages(options) {
    const items = options.items || [];
    const targetLanguage = options.targetLanguage;
    const instructions = String(options.instructions || '').trim();
    const strictJson = Boolean(options.strictJson);
    const userPayload = {
      targetLanguage,
      items: items.map((item) => ({
        id: item.id,
        text: item.text
      }))
    };
    const systemParts = [
      instructions,
      'Return only valid JSON.',
      'Do not wrap the JSON in markdown fences.',
      'Return an array of objects with this exact shape: [{"id":"...","translation":"..."}].',
      'Use the provided id values unchanged.'
    ];

    if (strictJson) {
      systemParts.push('If you cannot translate an item, still return that item with the original text as translation.');
    }

    return [
      {
        role: 'system',
        content: systemParts.join(' ')
      },
      {
        role: 'user',
        content: [
          `Translate every item into ${targetLanguage}.`,
          'Preserve meaning and formatting where practical.',
          'Reply with JSON only.',
          JSON.stringify(userPayload)
        ].join('\n\n')
      }
    ];
  }

  function buildChatCompletionRequest(settings, items, strictJson) {
    return {
      model: settings.model,
      temperature: DEFAULT_TEMPERATURE,
      stream: false,
      messages: buildTranslationMessages({
        instructions: settings.instructions,
        items,
        strictJson,
        targetLanguage: settings.targetLanguage
      })
    };
  }

  function chunkTranslationItems(items, maxChars) {
    const limit = maxChars || DEFAULT_MAX_BATCH_CHARS;
    const chunks = [];
    let current = [];
    let currentChars = 0;

    for (const item of items) {
      const textLength = (item.text || '').length;

      if (current.length > 0 && currentChars + textLength > limit) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }

      current.push(item);
      currentChars += textLength;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  function extractAssistantText(payload) {
    const content = payload &&
      payload.choices &&
      payload.choices[0] &&
      payload.choices[0].message &&
      payload.choices[0].message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n');
    }

    throw new Error('Unexpected API response shape.');
  }

  function stripCodeFences(text) {
    return String(text || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
  }

  function parseTranslationResponse(text) {
    const cleaned = stripCodeFences(text);
    const startIndex = cleaned.indexOf('[');
    const endIndex = cleaned.lastIndexOf(']');
    const candidate = startIndex >= 0 && endIndex >= startIndex
      ? cleaned.slice(startIndex, endIndex + 1)
      : cleaned;
    const parsed = JSON.parse(candidate);

    if (!Array.isArray(parsed)) {
      throw new Error('Response JSON is not an array.');
    }

    return parsed.map((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.translation !== 'string') {
        throw new Error('Response item is missing id or translation.');
      }

      return {
        id: item.id,
        translation: item.translation
      };
    });
  }

  async function callChatCompletions(settings, items, fetchImpl, strictJson) {
    const requestPayload = buildChatCompletionRequest(settings, items, strictJson);
    const response = await fetchImpl(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    const rawText = typeof response.text === 'function' ? await response.text() : '';
    let payload;

    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      payload = { error: { message: rawText || 'Invalid JSON response.' } };
    }

    if (!response.ok) {
      const message =
        payload &&
        payload.error &&
        typeof payload.error.message === 'string' &&
        payload.error.message.trim();

      throw new Error(message || `Translation request failed with status ${response.status}.`);
    }

    return parseTranslationResponse(extractAssistantText(payload));
  }

  async function requestTranslations(options) {
    const settings = options.settings;
    const items = options.items || [];
    const fetchImpl = options.fetchImpl || root.fetch;

    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch is not available.');
    }

    try {
      return await callChatCompletions(settings, items, fetchImpl, false);
    } catch (error) {
      if (error instanceof SyntaxError || /Response JSON|Unexpected token|missing id/i.test(error.message)) {
        return callChatCompletions(settings, items, fetchImpl, true);
      }

      throw error;
    }
  }

  const api = {
    DEFAULT_MAX_BATCH_CHARS,
    buildChatCompletionRequest,
    buildTranslationMessages,
    chunkTranslationItems,
    extractAssistantText,
    parseTranslationResponse,
    requestTranslations,
    stripCodeFences
  };

  root.TranslatorApi = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
