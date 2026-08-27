# Famulor for n8n

<div align="center">

<img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" alt="n8n" width="280">

<img src="nodes/Famulor/famulor.svg" alt="Famulor Toggle-Mark" width="96" height="96">

</div>

Official n8n community node for **Famulor Platform 2.0** (`API v1`).

[![npm version](https://badge.fury.io/js/n8n-nodes-famulor.svg)](https://www.npmjs.com/package/n8n-nodes-famulor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](#english) • [Deutsch](#deutsch) • [Installation](#installation)

This is a **breaking 2.x** package. It talks only to Platform v1. It does **not** support Famulor Classic 1.0 (`https://app.famulor.de`, integer IDs, `/api/user/*`).

---

## English

### Why this 2.x node?

New Famulor tenants live on Platform 2.0. Keys are **not interchangeable**: a Classic `.de` key against `.io` returns `401`.

| | Classic 1.0 (removed) | Platform 2.0 (this package) |
| --- | --- | --- |
| Host | `https://app.famulor.de` | `https://app.famulor.io` (or a verified whitelabel domain) |
| REST prefix | `/api/user/*` | `/api/v1` |
| Auth | Legacy account key | `Authorization: Bearer fam_…` |
| IDs | Integers | UUIDs |
| Make call | `phone_number` + `variables` | `to_number` (E.164) + optional `lead` |
| Trigger | Unsigned `assistants.webhook_url` | Workspace webhook `call.completed` + `X-Famulor-Signature` |

There is **no** `/api/v1` on `app.famulor.de` (404). This node hard-targets v1 and has no 1.0 compatibility mode.

### Credentials

1. Open [https://app.famulor.io/](https://app.famulor.io/) and create a service-account API key (`fam_…`).
2. In n8n, create credentials of type **Famulor API**.
3. Paste the API key.
4. Leave **Base URL** as `https://app.famulor.io`, or set a verified custom domain for whitelabel. Tenant is in the key, not the host. Do not use `app.famulor.de`. Do not send `X-Workspace-Id` / `X-Tenant` headers.

### Operations

**Call**

- **Make** — `POST /api/v1/calls`. Required: assistant UUID + `to_number` (E.164). Optional: `phone_number_id`, `lead` (JSON object). The node does **not** send `variables`, `from_number`, or `lead_id`.
- **Get** — `GET /api/v1/calls/{id}` (transcript + analysis).
- **Get Many** — `GET /api/v1/calls` with optional filters (`assistant_id`, `campaign_id`, `status`, `direction`, time range, search).

**Assistant**

- **Get Many** — `GET /api/v1/assistants`
- **Get** — `GET /api/v1/assistants/{id}`
- **Create** — `POST /api/v1/assistants` (`name`, optional `system_prompt` / `first_message`)

**Campaign**

- **Get Many** — `GET /api/v1/campaigns`
- **Create** — `POST /api/v1/campaigns` (`name`, optional `assistant_id`)

### Call Completed trigger

The trigger is a **signed workspace webhook**, not an unsigned assistant URL.

1. Add **Famulor Trigger** and copy its Production URL.
2. In Famulor go to **Settings → Webhooks**, create a webhook for event `call.completed`, and paste the n8n URL.
3. Paste the workspace webhook secret into the trigger **Webhook Secret** field.
4. Incoming POSTs must include `X-Famulor-Signature: sha256=<hmac_sha256(raw_body, secret).hex>`. The MAC covers the **raw body only** (no timestamp). Invalid signatures are rejected with HTTP 401.

Optional: pick an assistant to ignore events from other assistants.

### Installation

Follow the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

Package name: `n8n-nodes-famulor` (2.x).

### Compatibility

- Minimum Node.js: 20.15
- n8n: current community-node hosts (n8n 1.x)

### Breaking changes from 1.x

- Default host is `https://app.famulor.io`. `app.famulor.de` is rejected.
- All IDs are UUID strings.
- Make Call uses `to_number` + optional `lead`. Classic `variables` / `phone_number` / `from_number` / `lead_id` are gone.
- Trigger requires HMAC verification. Pasting the n8n URL into `assistants.webhook_url` is not supported.
- Classic resources (SMS, tools, user, AI generate-reply, conversations, integer leads) are removed.

---

## Deutsch

### Warum dieser 2.x-Node?

Neue Famulor-Mandanten laufen auf Platform 2.0. Schlüssel sind **nicht austauschbar**: ein Classic-`.de`-Key gegen `.io` liefert `401`.

| | Classic 1.0 (entfernt) | Platform 2.0 (dieses Paket) |
| --- | --- | --- |
| Host | `https://app.famulor.de` | `https://app.famulor.io` (oder verifizierte Whitelabel-Domain) |
| REST-Prefix | `/api/user/*` | `/api/v1` |
| Auth | Legacy-Account-Key | `Authorization: Bearer fam_…` |
| IDs | Integer | UUIDs |
| Anruf starten | `phone_number` + `variables` | `to_number` (E.164) + optionales `lead` |
| Trigger | Unsignierte `assistants.webhook_url` | Workspace-Webhook `call.completed` + `X-Famulor-Signature` |

Auf `app.famulor.de` gibt es **kein** `/api/v1` (404). Dieser Node spricht nur v1, ohne 1.0-Kompatibilitätsmodus.

### Anmeldedaten

1. Unter [https://app.famulor.io/](https://app.famulor.io/) einen Service-Account-API-Key (`fam_…`) erzeugen.
2. In n8n Anmeldedaten vom Typ **Famulor API** anlegen.
3. Den API-Key einfügen.
4. **Base URL** auf `https://app.famulor.io` lassen oder eine verifizierte Custom Domain für Whitelabel setzen. Der Mandant steckt im Key, nicht im Host. Nicht `app.famulor.de` verwenden. Keine Header `X-Workspace-Id` / `X-Tenant`.

### Operationen

**Call**

- **Make** — `POST /api/v1/calls`. Pflicht: Assistenten-UUID + `to_number` (E.164). Optional: `phone_number_id`, `lead` (JSON-Objekt). Der Node sendet **keine** Felder `variables`, `from_number` oder `lead_id`.
- **Get** — `GET /api/v1/calls/{id}` (Transkript + Analyse).
- **Get Many** — `GET /api/v1/calls` mit optionalen Filtern.

**Assistant**

- **Get Many** / **Get** / **Create** gegen `/api/v1/assistants`.

**Campaign**

- **Get Many** / **Create** gegen `/api/v1/campaigns`.

### Trigger „Call completed“

Der Trigger ist ein **signierter Workspace-Webhook**, keine unsignierte Assistenten-URL.

1. **Famulor Trigger** hinzufügen und die Production-URL kopieren.
2. In Famulor unter **Settings → Webhooks** einen Webhook für `call.completed` anlegen und die n8n-URL eintragen.
3. Das Workspace-Webhook-Secret im Feld **Webhook Secret** hinterlegen.
4. Eingehende POSTs müssen `X-Famulor-Signature: sha256=<hmac_sha256(raw_body, secret).hex>` senden. Die Signatur gilt nur für den **Raw Body** (kein Timestamp). Ungültige Signaturen werden mit HTTP 401 abgelehnt.

### Installation

Siehe die [n8n-Community-Nodes-Installationsanleitung](https://docs.n8n.io/integrations/community-nodes/installation/).

Paketname: `n8n-nodes-famulor` (2.x).

---

## Resources

- [Famulor Platform](https://app.famulor.io/)
- [Famulor website](https://www.famulor.io/)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

Classic 1.0 docs on `docs.famulor.io` / `docs.famulor.de` still describe the old API. This package follows Platform 2.0 / API v1.
