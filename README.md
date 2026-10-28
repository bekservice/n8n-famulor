# Famulor for n8n

Official community package for the [Famulor workspace API](https://docs.famulor.io/api-reference/introduction): **501 native actions**, **32 polling events** and **five signed webhook events**.

Package: `n8n-nodes-famulor` · Maintained by **BEK Service GmbH (@bekservice)** · [Famulor](https://app.famulor.io) · [Integration guide](https://docs.famulor.io/automations/n8n)

## Ready-to-use workflow templates

The [workflow templates](templates/README.md) cover a daily booking agenda in Slack, a daily aggregate call report in Slack, and a weekly assistant inventory in Google Sheets. They use built-in n8n nodes, contain no saved credentials, and start inactive with preview mode enabled. The Creator Portal reviews these submissions separately from this repository.

## Install and connect

1. Install `n8n-nodes-famulor` through **Settings → Community Nodes** in your n8n instance. See the [n8n installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation/).
2. Create a Famulor API key in the workspace you want to automate. Give it only the read/write scopes needed by your workflow.
3. Add **Famulor API** credentials in n8n, paste the workspace API key. New connections use `https://app.famulor.io` automatically; there is no editable Base URL field. Previously saved connection hosts are retained. The workspace comes from the key.
4. Add **Famulor**, choose a resource and operation, and fill the required fields. Add optional fields only when you want to send them.

Minimum Node.js is 20.15. The package is compiled and checked against current `n8n-workflow` types and retains the saved version-2 nodes. Classic `.de` keys and `/api/user/*` endpoints are unsupported.

## Native actions

Every operation in the pinned public OpenAPI contract has a native **Resource → Operation** choice and its own input fields. There is no custom-request or operation-JSON step to construct first. Actions cover:

- Assistants, calls, campaigns, contacts, segments, suppression and phone numbers
- SMS, conversations, email, WhatsApp, history and messaging connectors
- Knowledge bases, files, reusable tools, automations and missions
- Bookings, event types, available slots and scheduled callbacks
- Voices, widgets, simulations, QA, translations, versions and catalog
- Account, API keys, settings, integrations, billing, dashboards and workspaces
- Loop, carrier connections, SIP trunks, caller IDs and whitelabel administration

**Personal settings:** low-credit warning preferences and other user-specific operations require user-owned credentials. A service-account workspace key has no associated user; granting additional scopes does not change that. Manage personal warnings in Famulor Settings when using a service-account key.

Famulor enforces workspace scopes, permissions, plan entitlements, feature access and credits. An action being available in n8n does not grant additional access. Billable actions such as calls and SMS consume the normal workspace credits.

### Input and output behavior

- Optional fields stay absent until added to **Optional Fields**. Updating a label does not implicitly change unrelated boolean settings.
- Explicit `false`, `0`, empty arrays, empty strings and supported `null` values are preserved. **Additional Body Fields** accepts documented JSON fields; a selected named field takes precedence.
- Assistant, campaign, call, contact, number, knowledge, booking, event-type, tool, automation, segment, callback and mission references support a searchable workspace list or **By ID** mode. UUIDs can be mapped from previous nodes.
- Lists return one n8n item per record. A nested object response remains one item; scalar or empty responses use a `value` field. Audio previews return n8n binary data.
- Pagination inputs use the public endpoint's limit/offset contract. Actions send one request per input item; they do not silently fetch all pages or retry writes.
- Upload actions accept the API's documented URL/base64 JSON alternatives. The node does not read files from the host filesystem.
- Requests stay within the configured HTTPS Famulor origin and `/api/v1`. Redirects are not followed, credentials are not echoed in errors, and action output is linked to its input item.

Example read-only action: **Account → Get current credential** (`getMe`). Example outbound call: **Calls → Start an outbound call**, select an assistant and provide `to_number` in E.164 format. Create/sending/purchase operations perform real writes when you execute them.

## Private AI Avatars

Use **Avatars → Check custom avatar creation** to read the current price and image limits. A user-owned workspace API key is required to create or delete avatars; service-account keys cannot manage them.

Prepare the photo with **Prepare custom avatar upload**, then upload the photo to the returned signed `upload_url` using an n8n HTTP Request node: PUT, multipart/form-data with an unnamed binary file field and `cacheControl` set to `0`, header `x-upsert: false`, and **no Famulor credentials**. Let n8n generate the multipart Content-Type boundary; do not set an image Content-Type on the whole request. Submit the same prepared ID with explicit consent and the returned `creation_credits` as `expected_credits`. The image defines the appearance; the style field does not transform it. Creation uses a one-time credit charge and may use a saved automatic top-up rule. Read the same avatar ID after an uncertain response instead of preparing another paid creation. Only a ready avatar can be assigned to a widget; ongoing avatar usage is billed separately.

Private avatars stay in their workspace. Photo upload or webcam capture is also available in the Famulor widget editor.

## Polling events

Add **Famulor Polling Trigger**, select an event and the polling schedule. Campaign-lead events also require the campaign UUID.

The 32 events include new inbound/outbound/web calls, call completion/failure/no-answer, new assistants/contacts/campaigns, campaign start/pause/completion and lead addition/completion, conversation/email/WhatsApp activity, new numbers/knowledge/tools/automations/missions/segments/suppression entries, bookings and booking cancellation/completion/event types, and callback creation/completion.

- The first active poll establishes a baseline and emits no historical events. Existing assignments and statuses are skipped.
- A call created before activation can still emit completion when it ends after activation. Reanalysis does not emit another completion.
- Conversation activity can emit again when its last-activity timestamp changes. Snapshot/status events emit the first observed occurrence per resource ID; re-adding a lead or repeating a status does not create another occurrence.
- Snapshot sources require full pagination because the API has no reliable change cursor. Transitions entirely between polls can be missed. Large workspaces have a higher read cost.
- Timestamp sources re-read a ten-minute window and deduplicate IDs and timestamps to catch delayed visibility. Records becoming visible more than ten minutes behind the newest observed timestamp may be missed. Timestamp dedupe entries expire outside that window; first-occurrence/status sources retain their observed IDs.
- Invalid data, failed later pages, API-capped results or scans beyond 50,000 records fail before updating state. Stored state is bounded to 50,000 resource IDs. A different event, campaign or credential establishes a new baseline.
- Manual tests return recent samples without changing active polling state. State uses n8n's workflow static data; persistence and retries follow the host's execution lifecycle. This is not an exactly-once guarantee. Make downstream writes idempotent where necessary.
- No Famulor webhook destinations are overwritten by the polling node.

## Signed webhooks

New **Famulor Trigger version 4** nodes use automatic registration for `call.completed`, `conversation.ended`, `booking.created`, `booking.cancelled` and `booking.rescheduled`.

1. Create **Famulor Webhook API** credentials with the workspace API key and a strong signing secret of 16–256 characters. Connection testing uses read-only `GET /api/v1/me`; an existing remote signing secret cannot be compared through that endpoint.
2. The key needs **Settings: Read**, **Settings: Write**, and **Calls: Read** for call/conversation events or **Bookings: Read** for booking events. The credential must have workspace admin authority.
3. Choose one event and activate the workflow. n8n registers a dedicated signed subscription at `POST /api/v1/webhooks`. Deactivation deletes only its own subscription. A stable subscription UUID makes repeated registration safe after an ambiguous response.
4. Use the optional assistant filter for call/conversation events. Other webhook destinations and unrelated workflows remain unchanged.

The receiver verifies `X-Famulor-Signature: sha256=<HMAC-SHA256(raw_body, secret)>` before emitting. Missing or incorrect signatures return HTTP 401. Signatures do not prevent replay; deduplicate by event/resource ID before downstream writes. No live event is sent by registration or connection testing.

Saved version-2 and version-3 receivers keep **Existing Manual Destination** mode and their credential/parameter keys. They do not register or remove a remote destination unless you explicitly switch to **Automatic Subscription**. For a manual booking receiver, keep the signing secret generated by the booking event type. Unsigned assistant and messaging connector URLs require polling instead of the signed receiver.

Deactivate a managed receiver before changing its connection or Famulor origin. Cleanup uses the saved subscription UUID, so rotating the API key or signing secret within the same connection does not prevent deletion. Reactivation with changed callback settings removes the previous owned subscription before creating its replacement. The API key and signing secret stay in encrypted credentials; workflow state stores only the subscription UUID and non-secret callback metadata.

Full setup: [signed webhook subscriptions](https://docs.famulor.io/automations/webhook-subscriptions).

## Upgrade from 2.0.0

This release is additive at the package level. Saved workflows using **Famulor version 2** or **Famulor Trigger version 2** keep their previous node definitions and parameters. New action nodes default to version 3; new webhook nodes default to version 4. The polling node is new.

To upgrade an existing action node, select version 3, choose the native resource/operation, and map the new fields. To upgrade a webhook node, select its event and move the old node's secret to **Famulor Webhook API** credentials. Test the workflow before activating it. Do not remove the old credentials until all dependent workflows have been updated.

## Shopify theme widget choices

Use **Shopify → Read Shopify widget choices** with a linked store ID to read named choices and synchronization status. Public name publication is disabled by default. **Shopify → Synchronize Shopify widget choices** explicitly enables publication and publishes current eligible names as public Shopify storefront data. No extra Shopify permission request is required. Subsequent background updates preserve this opt-in. To disable publication, use the Shopify capabilities configuration through the HTTP/API workflow documented in the [Famulor Shopify app guide](https://docs.famulor.io/automations/shopify-app). Both need workspace owner/admin access and Assistants: Read; reading also needs Integrations: Read, synchronization Integrations: Write. Select the named widget and save the theme in Shopify. The store dropdown also requires Integrations: Read; use By ID when the credential only has write access to integrations. These operations do not activate a theme or modify a customer's order.

## Development and release

```sh
npm ci
npm run build
npm run lint
npm run scan
npm test
node scripts/generate-catalog.mjs path/to/openapi.json --check
npm pack --dry-run
```

The catalog is pinned to the [public specification](https://docs.famulor.io/api-reference/openapi.json), with its SHA-256 and operation count stored in generated metadata. To refresh it, run the same generator without `--check` and review the resulting inputs and endpoint changes.

For a scoped addition that preserves every previously released descriptor, use:

```sh
node scripts/generate-catalog.mjs path/to/openapi.json --add-operations newOperationId --check
```

Replace `newOperationId` with an operation not already in this catalog, and omit `--check` to add it. Additive mode rejects unknown or duplicate IDs and any replacement of an existing operation. Metadata keeps the original full-catalog SHA and records the source SHA plus operation IDs for each additive selection; it does not claim the entire latest specification was imported.

Tests execute all 501 registered native choices with actual n8n builder defaults, every polling event's baseline/emission/deduplication path, all signed webhook event choices, selectors, pagination failures, optional-input behavior and saved-node version routing against mocked HTTP. These tests do not start real calls, send messages, purchase resources or alter customer workspaces.

Release by pushing the reviewed commit and a matching version tag. The existing **Publish** GitHub Actions workflow installs the lockfile, builds, lints, tests, and publishes the package with npm provenance. npm publication and n8n Creator Portal verification are separate outcomes.

The linter uses the unmodified official `@n8n/node-cli` strict configuration. The official scanner checks both shipped source and compiled output before publication. The CommonJS test harness uses `.cts` files and is compiled/executed separately; it is not part of the Cloud node runtime. Build scripts invoke the package’s pinned TypeScript compiler directly so scanner tooling cannot replace it through a conflicting `tsc` binary.
