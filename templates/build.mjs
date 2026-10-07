import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const id = (name) => {
  const hex = createHash('sha256').update(`famulor-n8n-template:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const node = (name, type, typeVersion, position, parameters = {}) => ({
  id: id(name), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters,
});
const link = (to, index = 0) => ({ node: to, type: 'main', index });
const connect = (edges) => Object.fromEntries(Object.entries(edges).map(([from, branches]) => [from, {
  main: branches.map((branch) => branch.map((to) => link(to))),
}]));
const sticky = (name, content, position, width = 450, height = 340, color) => ({
  ...node(name, 'stickyNote', 1, position, { content, width, height, ...(color ? { color } : {}) }),
});
const assignment = (name, value, type) => ({ id: id(`field:${name}`), name, value, type });
const config = (name, position, values) => node(name, 'set', 3.4, position, {
  assignments: { assignments: values.map(([key, value, type]) => assignment(key, value, type)) },
  options: {},
});
const code = (name, position, jsCode) => node(name, 'code', 2, position, { jsCode });
const condition = (name, position, field, operation) => node(name, 'if', 2.2, position, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    combinator: 'and',
    conditions: [{
      id: id(`condition:${name}`),
      leftValue: `={{ $json.${field} }}`,
      rightValue: '',
      operator: { type: 'boolean', operation, singleValue: true },
    }],
  },
  options: {},
});
const readFamulor = (name, position, path, query, credentialScope) => ({
  ...node(name, 'httpRequest', 4.2, position, {
    method: 'GET',
    url: `https://app.famulor.io/api/v1/${path}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [
      ...query,
      { name: 'limit', value: '200' },
      { name: 'offset', value: '0' },
    ] },
    options: {
      response: { response: { responseFormat: 'json' } },
      pagination: { pagination: {
        parameters: { parameters: [{ name: 'offset', value: '={{ $pageCount * 200 }}' }] },
        paginationCompleteWhen: 'other',
        completeExpression: '={{ !Array.isArray($response.body?.data) || $response.body.data.length < 200 || (($pageCount + 1) * 200 >= $response.body?.meta?.pagination?.total) }}',
        limitPagesFetched: true,
        maxRequests: 10,
      } },
      timeout: 30000,
    },
  }),
  notesInFlow: true,
  notes: `Choose an HTTP Header Auth credential: Authorization = Bearer <workspace API key> (${credentialScope}). Verify the credential after import. Do not paste the key into this node.`,
});
const validatePages = String.raw`
const pages = $input.all().map(item => item.json);
if (!pages.length) throw new Error('Famulor returned no response pages.');
const total = pages[0]?.meta?.pagination?.total;
if (!Number.isSafeInteger(total) || total < 0) throw new Error('Missing or invalid Famulor pagination total.');
if (total > 2000) throw new Error('More than 2,000 records. Narrow the workflow scope before running it.');
let offset = 0;
const records = [];
for (const page of pages) {
  const meta = page?.meta?.pagination;
  if (!Array.isArray(page?.data) || !meta || meta.total !== total || meta.offset !== offset || meta.limit !== 200) {
    throw new Error('Incomplete or inconsistent Famulor pagination; no destination was changed.');
  }
  if (page.data.length > 200) throw new Error('Unexpected Famulor page size.');
  records.push(...page.data);
  offset += 200;
}
if (records.length !== total) throw new Error('The Famulor scan was incomplete or changed while paging; no destination was changed.');
const ids = records.map(record => record?.id);
if (ids.some(value => typeof value !== 'string' || !value) || new Set(ids).size !== ids.length) {
  throw new Error('Missing or duplicate record IDs; no destination was changed.');
}
`;

const inventoryDescription = `## Who is this for?
Famulor workspace administrators who want a lightweight weekly inventory of their AI assistants in Google Sheets.

## How it works
The workflow lists all assistants with the workspace API, validates pagination, and keeps only the assistant ID, name, active state, mode, language, tags, creation time and update time. It upserts rows by Assistant ID, so repeated scans refresh the same row instead of creating duplicates. Prompts, voices, tool configuration, credentials and customer data are excluded.

## Setup
1. Create a Famulor workspace API key with assistants:read. Save it in an n8n HTTP Header Auth credential named Authorization with the value Bearer followed by the key. Select it in Read Famulor assistant pages.
2. In Google Sheets, create a tab with these headers: Assistant ID, Name, Active, Mode, Language, Tags, Created at, Updated at, Last seen. Connect the spreadsheet and tab in Upsert assistant rows.
3. Execute manually with Preview only enabled. Inspect the mapped rows, select your Google Sheets credential, switch preview off and activate the weekly schedule.

## Requirements and customization
Uses built-in n8n nodes and a Google Sheets account with edit access. The sheet is an inventory snapshot of seen assistants: deleted assistants are not removed automatically. If your workspace has more than 2,000 assistants, split the scan instead of accepting an incomplete inventory. Restrict access to the destination sheet and n8n execution history. [Famulor API setup](https://docs.famulor.io/automations/n8n).`;

const inventory = {
  name: 'Upsert a Famulor AI assistant inventory to Google Sheets',
  active: false,
  settings: { executionOrder: 'v1', timezone: 'Europe/Berlin' },
  nodes: [
    node('Run an inventory preview', 'manualTrigger', 1, [0, 300]),
    node('Every Monday at 09:00', 'scheduleTrigger', 1.2, [0, 460], { rule: { interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 9, triggerAtMinute: 0 }] } }),
    config('Configure inventory', [220, 300], [['previewOnly', true, 'boolean']]),
    readFamulor('Read Famulor assistant pages', [440, 300], 'assistants', [], 'assistants:read'),
    code('Validate and prepare assistant rows', [660, 300], String.raw`${validatePages}
const seenAt = new Date().toISOString();
const rows = records.map(assistant => ({
  'Assistant ID': assistant.id,
  'Name': typeof assistant.name === 'string' ? assistant.name : '',
  'Active': assistant.is_active === true ? 'Yes' : 'No',
  'Mode': typeof assistant.mode === 'string' ? assistant.mode : '',
  'Language': typeof assistant.stt_language === 'string' ? assistant.stt_language : '',
  'Tags': Array.isArray(assistant.tags) ? assistant.tags.filter(x => typeof x === 'string').join(', ') : '',
  'Created at': typeof assistant.created_at === 'string' ? assistant.created_at : '',
  'Updated at': typeof assistant.updated_at === 'string' ? assistant.updated_at : '',
  'Last seen': seenAt,
}));
return (rows.length ? rows : [{ _empty: true }]).map(row => ({ json: { ...row, hasRows: rows.length > 0, previewOnly: $('Configure inventory').first().json.previewOnly } }));
`),
    condition('Preview only inventory?', [880, 300], 'previewOnly', 'true'),
    code('Preview assistant rows', [1100, 180], 'return $input.all();'),
    condition('Has assistant rows?', [1100, 420], 'hasRows', 'true'),
    node('Upsert assistant rows', 'googleSheets', 4.7, [1320, 420], {
      operation: 'appendOrUpdate',
      documentId: { __rl: true, value: '', mode: 'list' },
      sheetName: { __rl: true, value: '', mode: 'list' },
      columns: {
        mappingMode: 'defineBelow',
        value: Object.fromEntries(['Assistant ID', 'Name', 'Active', 'Mode', 'Language', 'Tags', 'Created at', 'Updated at', 'Last seen'].map(key => [key, `={{ $json['${key}'] }}`])),
        matchingColumns: ['Assistant ID'],
        schema: ['Assistant ID', 'Name', 'Active', 'Mode', 'Language', 'Tags', 'Created at', 'Updated at', 'Last seen'].map(key => ({
          id: key, displayName: key, required: false, defaultMatch: false, display: true,
          type: 'string', canBeUsedToMatch: true, ...(key === 'Assistant ID' ? { removed: false } : {}),
        })),
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: {},
    }),
    sticky('About this inventory', inventoryDescription, [-20, -360], 690, 590, 4),
    sticky('1. Connect Famulor', 'Create an assistants:read workspace key. Use an n8n Header Auth credential, not a key pasted into the HTTP node. Verify the credential selected after import.', [410, 520], 420, 190),
    sticky('2. Review the mapped fields', 'The Code node selects only inventory fields. It excludes system prompts and tool details. Incomplete scans fail before any sheet write.', [640, 730], 430, 170),
    sticky('3. Connect the sheet', 'Create the exact headers shown in the description. Select spreadsheet, tab and credential in Google Sheets. Upsert matches on Assistant ID. Preview only starts enabled.', [1110, 600], 480, 210),
  ],
  connections: connect({
    'Run an inventory preview': [['Configure inventory']],
    'Every Monday at 09:00': [['Configure inventory']],
    'Configure inventory': [['Read Famulor assistant pages']],
    'Read Famulor assistant pages': [['Validate and prepare assistant rows']],
    'Validate and prepare assistant rows': [['Preview only inventory?']],
    'Preview only inventory?': [['Preview assistant rows'], ['Has assistant rows?']],
    'Has assistant rows?': [['Upsert assistant rows'], []],
  }),
  pinData: {},
};

mkdirSync(here, { recursive: true });
for (const [filename, workflow] of [
  ['famulor-assistant-inventory-google-sheets.json', inventory],
]) {
  writeFileSync(join(here, filename), JSON.stringify(workflow, null, 2) + '\n');
}
console.log('Built the Famulor assistant-inventory n8n template.');
