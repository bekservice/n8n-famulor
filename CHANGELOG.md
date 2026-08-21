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

### Credentials UI

- API key (password), optional Base URL. No workspace ID field.
