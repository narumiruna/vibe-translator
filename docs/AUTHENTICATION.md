# Authentication and Providers

Vibe Translator uses `@earendil-works/pi-ai` for provider catalogs, model metadata, authentication, and text completion. The background service worker owns the runtime; options, content scripts, and web pages never receive credentials.

## Supported provider boundary

The browser build registers all 39 browser-compatible built-in `pi-ai` providers and their text/chat models, plus **Custom OpenAI-compatible**. The bundled catalog currently contains more than 1,200 models and follows the installed `pi-ai` version.

- Every listed provider except OpenAI Codex exposes its browser-safe `pi-ai` API-key flow.
- **OpenAI Codex** exposes account sign-in for ChatGPT Plus/Pro instead of an API-key flow.
- **Radius** loads its model catalog after a Radius API key is saved.
- **Custom OpenAI-compatible** accepts an API key, a Responses API base URL containing `/v1`, and an exact model ID.
- Models may advertise image input, but Vibe Translator sends text only. Image-generation models are not listed.

Amazon Bedrock is intentionally excluded because its adapter requires the Node-only AWS SDK and credential chain. Account OAuth supplied by `pi-ai` for Anthropic, GitHub Copilot, Kimi, OpenRouter, Radius, and xAI is also Node-only. Those providers remain available through API keys. This matches the browser boundary used by `pi-chrome`; the UI does not advertise auth methods that cannot execute safely in a Manifest V3 extension.

## Configure an API-key provider

1. Open **Extension options → Setup**.
2. Select a provider and one of its models.
3. Choose **Add API key**.
4. Complete the provider-owned prompts. Providers such as Cloudflare and Azure request the endpoint fields required by their APIs.
5. Choose **Test Connection** and approve the exact endpoint origin when Chrome asks.
6. Save the settings.

The authentication dialog is the only place a new secret is entered. After it closes, Options shows status only; it never renders the stored key back into a form.

## Sign in to OpenAI Codex

1. Select **OpenAI Codex** and a model.
2. Choose **Sign in with account**.
3. Approve access to `auth.openai.com` and `chatgpt.com` if Chrome asks.
4. Open the sign-in page, enter the displayed one-time code, and finish sign-in.
5. Return to Options and run **Test Connection**.

The background service worker polls the device flow, validates the returned account token, stores its access/refresh data, and refreshes it when needed. **Refresh credential** forces a refresh. **Remove credential** logs out locally. Revoking either OpenAI authentication origin from Chrome also invalidates the stored Codex credential.

## Credential storage and migration

Credentials are keyed by provider in `chrome.storage.local`. Startup restricts that storage area to `TRUSTED_CONTEXTS`; the authentication port also rejects connections from normal web/content contexts. Catalog and status messages contain no token or key values.

Ordinary settings remain in `chrome.storage.sync`, but no credential field is written there. On the first startup after upgrading:

- an existing `apiKey` moves to provider-scoped local credential storage;
- `https://api.openai.com/v1` maps to the built-in OpenAI provider;
- another legacy `baseUrl` maps to **Custom OpenAI-compatible**;
- `apiKey` and `baseUrl` are removed from the synced settings record.

Removing a credential does not remove the provider/model selection. Add a new credential before translating again.

## Host permissions

The manifest declares broad HTTP/HTTPS access as optional, not automatic. Vibe Translator derives exact origin patterns from the selected model and stored non-secret endpoint configuration.

- Authentication requests only provider setup origins needed for that flow.
- **Test Connection** requests the selected model endpoint origin before sending data.
- Page, selection, subtitle, and PDF translation verify the same endpoint permission before each session.
- Radius can require both its configuration origin and the selected gateway/model origin.
- Permission diagnostics include origins, never API keys, tokens, prompts, or translated text.

If endpoint access is denied or later revoked, translation stops and Options reports the missing permission.

## Browser implementation note

`pi-ai` provider definitions use lazy API adapters by default. Manifest V3 service workers cannot execute dynamic `import()` after startup, so Vibe Translator statically registers the nine text API implementations used by the browser provider catalog while retaining `pi-ai` provider, model, auth, request, and response behavior. The production artifact check rejects Node built-in imports and verifies the reviewed size budget.
