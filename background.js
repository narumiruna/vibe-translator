importScripts('storage.js', 'api.js');

const MENU_TRANSLATE_PAGE = 'translate-page';
const MENU_TRANSLATE_SELECTION = 'translate-selection';
const BADGE_COLOR = '#1f7a4f';
const PAGE_TRANSLATION_CONCURRENCY = 3;

function isSupportedPage(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function isDomainDisabled(url, settings) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const rules = String(settings.disabledDomains || '')
      .split('\n')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return rules.some((rule) => hostname === rule || hostname.endsWith(`.${rule}`));
  } catch (error) {
    return false;
  }
}

function setBadge(tabId, text) {
  if (!tabId) {
    return;
  }

  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId }).catch(() => {});
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
}

async function renderPageTranslationUpdates(tabId, targetLanguage, translations) {
  if (!translations || translations.length === 0) {
    return;
  }

  await chrome.tabs.sendMessage(tabId, {
    type: 'render-page-translation-updates',
    payload: {
      targetLanguage,
      translations
    }
  });
}

async function clearPagePlaceholders(tabId, ids) {
  if (!ids || ids.length === 0) {
    return;
  }

  await chrome.tabs.sendMessage(tabId, {
    type: 'clear-page-placeholders',
    payload: {
      ids
    }
  }).catch(() => {});
}

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: MENU_TRANSLATE_PAGE,
    title: 'Translate entire page',
    contexts: ['page']
  });
  await chrome.contextMenus.create({
    id: MENU_TRANSLATE_SELECTION,
    title: 'Translate selected text',
    contexts: ['selection']
  });
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });

    if (response && response.ok) {
      return;
    }
  } catch (error) {
    // Fall through and inject.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

async function sendToast(tabId, message, level) {
  try {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toast',
      payload: {
        level: level || 'info',
        message
      }
    });
  } catch (error) {
    // Ignore toast failures on unsupported pages.
  }
}

async function ensureApiPermission(settings) {
  const originPattern = TranslatorStorage.getApiPermissionPattern(settings.baseUrl);
  const permissions = { origins: [originPattern] };
  const hasPermission = await chrome.permissions.contains(permissions);

  if (hasPermission) {
    return true;
  }

  return chrome.permissions.request(permissions);
}

async function loadSettingsOrOpenOptions() {
  const settings = await TranslatorStorage.getSettings();

  if (TranslatorStorage.hasCompleteSettings(settings)) {
    return settings;
  }

  await chrome.runtime.openOptionsPage();
  throw new Error('Settings are incomplete. Configure the extension first.');
}

async function translatePage(tab) {
  if (!tab || !tab.id || !isSupportedPage(tab.url)) {
    throw new Error('This page cannot be translated.');
  }

  const settings = await loadSettingsOrOpenOptions();

  if (isDomainDisabled(tab.url, settings)) {
    throw new Error('Translation is disabled for this domain.');
  }

  const hasPermission = await ensureApiPermission(settings);

  if (!hasPermission) {
    throw new Error('Permission to access the configured API origin was denied.');
  }

  await ensureContentScript(tab.id);
  const extraction = await chrome.tabs.sendMessage(tab.id, {
    type: 'extract-page-content'
  });

  if (!extraction || !Array.isArray(extraction.items)) {
    await sendToast(tab.id, 'No translatable text was found on this page.', 'info');
    setBadge(tab.id, '');
    return;
  }

  if (extraction.items.length === 0) {
    const message =
      extraction.totalSegments > 0
        ? 'No new or changed text was found on this page.'
        : 'No translatable text was found on this page.';

    await sendToast(tab.id, message, 'info');
    setBadge(tab.id, '');
    return;
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: 'render-page-placeholders',
    payload: {
      ids: extraction.items.map((item) => item.id),
      targetLanguage: settings.targetLanguage
    }
  });

  const chunkPlan = TranslatorApi.createRecursiveChunkPlan(extraction.items);
  const mergeState = TranslatorApi.createProgressiveMergeState(chunkPlan);
  await TranslatorApi.requestTranslationsBatchedProgressive({
    settings,
    chunks: chunkPlan.chunks,
    concurrency: PAGE_TRANSLATION_CONCURRENCY,
    onChunkResolved: async ({ translations }) => {
      const completedTranslations = TranslatorApi.consumeProgressiveTranslations(
        chunkPlan,
        mergeState,
        translations
      );

      if (completedTranslations.length > 0) {
        await renderPageTranslationUpdates(
          tab.id,
          settings.targetLanguage,
          completedTranslations
        );
        setBadge(tab.id, String(mergeState.completedSegmentIds.size));
      }
    }
  });
  const incompleteSegmentIds = TranslatorApi.getIncompleteSegmentIds(chunkPlan, mergeState);

  await clearPagePlaceholders(tab.id, incompleteSegmentIds);

  const completedCount = mergeState.completedSegmentIds.size;
  const failedCount = incompleteSegmentIds.length;

  if (failedCount > 0) {
    await sendToast(
      tab.id,
      `Translated ${completedCount} blocks, ${failedCount} failed.`,
      completedCount > 0 ? 'info' : 'error'
    );
  } else {
    await sendToast(tab.id, `Translated ${completedCount} page blocks.`, 'success');
  }

  if (completedCount > 0) {
    setBadge(tab.id, 'TR');
  } else {
    setBadge(tab.id, '!');
  }
}

async function translateSelection(tabId, selectionText) {
  if (!tabId) {
    throw new Error('Missing tab id.');
  }

  const text = String(selectionText || '').trim();

  if (!text) {
    throw new Error('No selected text to translate.');
  }

  const settings = await loadSettingsOrOpenOptions();
  const tab = await chrome.tabs.get(tabId);

  if (tab && isDomainDisabled(tab.url, settings)) {
    throw new Error('Translation is disabled for this domain.');
  }

  const hasPermission = await ensureApiPermission(settings);

  if (!hasPermission) {
    throw new Error('Permission to access the configured API origin was denied.');
  }

  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, {
    type: 'render-selection-placeholder',
    payload: {
      targetLanguage: settings.targetLanguage
    }
  });

  const chunkPlan = TranslatorApi.createRecursiveChunkPlan([
    { id: 'selection', kind: 'selection', text }
  ]);
  const partialTranslations = await TranslatorApi.requestTranslationsBatched({
    settings,
    chunks: chunkPlan.chunks,
    concurrency: 1
  });
  const translations = TranslatorApi.mergeRecursiveTranslations(chunkPlan, partialTranslations);
  const translation = translations[0] && translations[0].translation;

  if (!translation) {
    throw new Error('The API did not return a translation.');
  }

  await chrome.tabs.sendMessage(tabId, {
    type: 'render-selection-translation',
    payload: {
      sourceText: text,
      targetLanguage: settings.targetLanguage,
      translation
    }
  });
  await sendToast(tabId, 'Selected text translated.', 'success');
  setBadge(tabId, 'TR');
}

async function handleRuntimeMessage(message) {
  if (!message || typeof message !== 'object') {
    return { ok: false };
  }

  if (message.type === 'test-connection') {
    const validation = TranslatorStorage.validateSettings(message.payload);

    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    const translations = await TranslatorApi.requestTranslations({
      settings: validation.settings,
      items: [{ id: 'sample', kind: 'paragraph', text: 'Hello world.' }]
    });

    return {
      ok: true,
      translation: translations[0] ? translations[0].translation : ''
    };
  }

  return { ok: false };
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus().catch((error) => {
    console.error('Failed to set up context menus:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus().catch((error) => {
    console.error('Failed to set up context menus:', error);
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await translatePage(tab);
  } catch (error) {
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'clear-pending-translations'
      }).catch(() => {});
      await sendToast(tab.id, error.message, 'error');
      setBadge(tab.id, '!');
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === MENU_TRANSLATE_PAGE) {
      await translatePage(tab);
      return;
    }

    if (info.menuItemId === MENU_TRANSLATE_SELECTION && tab && tab.id) {
      await translateSelection(tab.id, info.selectionText);
    }
  } catch (error) {
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'clear-pending-translations'
      }).catch(() => {});
      await sendToast(tab.id, error.message, 'error');
      setBadge(tab.id, '!');
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    setBadge(tabId, '');
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
