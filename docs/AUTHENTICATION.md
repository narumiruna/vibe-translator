# Authentication and Providers

Vibe Translator uses `@earendil-works/pi-ai` for provider catalogs, model metadata, authentication, and text completion. The background service worker owns the runtime; options, content scripts, and web pages never receive credentials.

## Supported provider boundary

The browser build registers all 39 browser-compatible built-in `pi-ai` providers and their text/chat models, plus **Custom OpenAI-compatible**. The bundled catalog currently contains more than 1,200 models and follows the installed `pi-ai` version.

- Every listed provider except OpenAI Codex exposes its browser-safe `pi-ai` API-key flow.
- Anthropic, GitHub Copilot, Kimi For Coding, OpenAI Codex, OpenRouter, Radius, and xAI also expose account OAuth.
- **OpenAI Codex** supports ChatGPT Plus/Pro account sign-in instead of an API-key flow.
- **Radius** loads its model catalog after a Radius API key or account credential is saved.
- **Custom OpenAI-compatible** accepts an API key, a Responses API base URL containing `/v1`, and an exact model ID.
- Models may advertise image input, but Vibe Translator sends text only. Image-generation models are not listed.

Amazon Bedrock is intentionally excluded because its adapter requires the Node-only AWS SDK and credential chain. The extension replaces `pi-ai`'s Node callback servers with Manifest V3-safe device-code or manual callback flows and advertises only OAuth implementations that can run in the background service worker.

## Configure an API-key provider

1. Open **Extension options → Setup**.
2. Search for and select a provider and one of its models.
3. Choose **Configure authentication** or **Change authentication**.
4. At **Select authentication method**, choose **Sign in with an API key**. Providers with only one method continue directly.
5. Complete the provider-owned prompts. Providers such as Cloudflare and Azure request the endpoint fields required by their APIs.
6. Choose **Test Connection** and approve the exact endpoint origin when Chrome asks.
7. Save the settings.

The authentication dialog is the only place a new secret is entered. After it closes, Options shows status only; it never renders the stored key back into a form.

## Sign in with an account

1. Select a provider and model.
2. Choose **Configure authentication** or **Change authentication**.
3. At **Select authentication method**, choose **Sign in with an account**. Providers with only account auth continue directly.
4. Approve the provider's authentication origins if Chrome asks.
5. Complete the provider flow and return to Options.
6. Choose **Test Connection** and approve the selected model endpoint if it was not already granted.

OpenAI Codex, GitHub Copilot, Kimi For Coding, Radius, and xAI use device authorization: open the displayed sign-in page and enter the one-time code. Anthropic and OpenRouter use PKCE with a manual browser handoff because a Manifest V3 service worker cannot listen on pi's localhost callback server. Complete sign-in, copy the final redirect URL or authorization code from the browser, and paste it into the authentication dialog. The failed localhost landing page is expected for that handoff.

The background service worker validates and stores the returned credential and refreshes expiring access tokens when needed. OpenRouter mints a long-lived API key instead. **Refresh credential** forces a refresh, and **Remove credential** logs out locally. Revoking an authentication origin from Chrome invalidates the affected stored OAuth credential.

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
- API-key setup does not request unrelated OAuth origins.
- **Test Connection** requests the selected model endpoint origin before sending data.
- Page, selection, subtitle, and PDF translation verify the same endpoint permission before each session.
- Radius can require both its configuration origin and the selected gateway/model origin.
- Permission diagnostics include origins, never API keys, tokens, prompts, or translated text.

If endpoint access is denied or later revoked, translation stops and Options reports the missing permission.

## Browser implementation note

`pi-ai` provider definitions use lazy API and OAuth adapters by default. Manifest V3 service workers cannot execute Node callback servers or load those adapters dynamically after startup, so Vibe Translator statically registers the nine text APIs and browser-specific OAuth flows used by its provider catalog while retaining `pi-ai` provider, model, credential-refresh, request, and response behavior. The production artifact check rejects Node built-in imports and verifies the reviewed size budget.
