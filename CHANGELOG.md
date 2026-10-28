# 2.4.0

- Refresh the catalog to 501 API operations. New automation actions: folders (`listAutomationFolders`, `createAutomationFolder`, `updateAutomationFolder`, `deleteAutomationFolder`), keyless export and import (`exportAutomation`, `importAutomation`), share links (`shareAutomation`, `getAutomationShare`, `revokeAutomationShare`, `importSharedAutomation`), built-in templates (`listAutomationTemplates`, `getAutomationTemplate`, `useAutomationTemplate`) and `duplicateAutomation`. `listAutomations` filters by `folder_id`; `createAutomation` and `updateAutomation` accept `folder_id`. Imports, shares and templates always create drafts without keys or connections.
- Pick up current API descriptions and enum values for audience contacts, history, messaging connectors, suppression entries, assistants, team invites and memory settings. Preserve all 487 existing 2.3.1 action routes and input contracts.

# 2.3.1

- Refresh the catalog to 487 API operations, adding Magicline Connect studio discovery (`discoverMagiclineConnectStudios`), Magicline Connect API setup (`connectMagiclineConnect`), multi-studio `studio_ids` support on Magicline Open API connections, `speak_transfer_greeting` on assistant handoff tools, and updated reseller managed-plan shortage policy descriptions. Preserve all 485 existing 2.3.0 action routes and input contracts.

# 2.3.0

- Address the n8n 2.2.0 update review: add a real read-only credential connection test, complete webhook lifecycle methods, use n8n error types throughout utility code, and correct all codex package prefixes/schema versions.
- Add automatic signed webhook subscriptions in new trigger version 4. Saved version-2/3 receivers keep their explicit manual mode; automatic mode manages only its dedicated subscription.
- Refresh the catalog to 485 API operations, adding browser session/recording, Magicline connection, automation connection import and webhook subscription actions. Preserve all 474 saved 2.2.0 action routes and input contracts.
- Return browser recordings as binary video files and preserve exact response bytes.
- Provide themed branded icons and enforce the official strict CLI linter plus source/distribution scanner in CI and publication gates.

# 2.2.0

- Refresh the native action catalog to all 474 current public API operations, adding 51 actions for private AI Avatars, Shopify, assistant fallback voices, saved History views, email setup and workspace management.
- Update AgentMail inbox selection, assistant options and current request/response descriptions.
- Custom email domain connections require the displayed one-time price in `expected_credits`; existing connections remain unchanged. Private avatar creation also requires consent and the current price after the photo has been uploaded.
- Preserve saved custom-domain email address selections when the domain field becomes optional.
- Preserve saved History text filters and resource locators while supporting the current array filters.
- Preserve existing operation IDs, saved version-2 nodes, all 32 polling events and five signed webhook events. No workflows are activated by installing this update.

# 2.1.1

- Keep HTTP status codes from n8n API errors and explain personal credit-warning restrictions for service-account keys without exposing raw transport errors.
- Test the connection through credential self-inspection, so keys without assistant-read scope can connect.
- Show the user-owned credential requirement before personal credit-warning operations.
- Remove the editable Base URL from new connections; retain previously saved hosts and the default Famulor origin.
- Correct signed booking webhook setup and guide call/conversation events to polling when signed delivery is unavailable.
- Correct native action labels and the credential documentation link.

# 2.1.0

- Add 423 native resource/operation actions covering the current Famulor public API, with generated per-operation fields and 13 searchable resource families.
- Add 32 polling events and signed call, conversation and booking webhook events.
- Store new webhook secrets in encrypted n8n credentials; validate events and assistant filters before emitting.
- Preserve saved version-2 action/webhook nodes; new nodes default to version 3.
- Preserve intentionally supplied clears and omit unselected optional fields. Link action results and errors to their input items.
- Restrict new transport to HTTPS Famulor origins, block redirects and avoid automatic write retries.
- Refresh the official Famulor logo, current n8n development types/linter, documentation and release checks.

# Changelog

## 2.0.0

Breaking rebuild for **Famulor Platform 2.0 / API v1**. No Classic 1.0 compatibility mode.

### Breaking

- Default host is `https://app.famulor.io`. `https://app.famulor.de` is rejected (Classic 1.0, no `/api/v1`).
- All requests go to `/api/v1`. Paths such as `/api/user/make_call` and `/api/user/me` are gone.
- Auth is `Authorization: Bearer fam_…`. Workspace is implied by the key. No `X-Workspace-Id` / `X-Tenant`.
- IDs are UUID strings (assistant, call, campaign, phone number). Integer IDs are gone.
- Make Call body is `assistant_id` + `to_number` (E.164), optional `phone_number_id` and `lead`. Removed request fields: `variables`, `phone_number`, `from_number`, `lead_id`.
- Call Completed trigger verifies `X-Famulor-Signature` (`sha256=<hmac_sha256(raw_body, secret).hex>`). Unsigned `assistants.webhook_url` is not the trigger contract.
- Removed Classic resources: AI generate-reply, conversation, SMS, tools, user, integer leads, assistant languages/models/voices helpers, campaign start/stop.

### Added

- Optional credential **Base URL** for verified whitelabel hosts (default `https://app.famulor.io`).
- Call Get / Get Many against `/api/v1/calls`.
- Assistant Get / Get Many / Create against `/api/v1/assistants`.
- Campaign Get Many / Create against `/api/v1/campaigns`.
- Unit tests for HMAC verification and Make Call payload construction.
- Official 2026 Famulor Toggle-Mark as the node, credential, and README icon (cyan `#1FD5FA` rounded toggle). The previous white serif-F is gone.

### Credentials UI

- API key (password), optional Base URL. No workspace ID field.
