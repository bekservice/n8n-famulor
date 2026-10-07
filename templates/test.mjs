import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, name), 'utf8'));
const inventory = load('famulor-assistant-inventory-google-sheets.json');
const agenda = load('famulor-booking-agenda-slack.json');
const performance = load('famulor-call-performance-slack.json');
const getNode = (workflow, name) => workflow.nodes.find((node) => node.name === name);
const runCode = (source, items, refs = {}) => {
  const input = { all: () => items.map((json) => ({ json })), first: () => ({ json: items[0] }) };
  const ref = (name) => ({ first: () => ({ json: refs[name] }) });
  return new Function('$input', '$', source)(input, ref);
};

for (const workflow of [inventory, agenda, performance]) {
  assert.equal(workflow.active, false);
  const names = workflow.nodes.map((node) => node.name);
  assert.equal(new Set(names).size, names.length);
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.set'));
  assert(workflow.nodes.every((node) => !node.credentials));
  for (const [source, branches] of Object.entries(workflow.connections)) {
    assert(names.includes(source), `Unknown source: ${source}`);
    for (const branch of branches.main) {
      for (const edge of branch) assert(names.includes(edge.node), `Unknown target: ${edge.node}`);
    }
  }
  const apiNode = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest');
  assert.equal(apiNode.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(apiNode.parameters.options.pagination.pagination.maxRequests, 10);
  assert(!/fam_[A-Za-z0-9]{20}|Test123|@famulor\.de/.test(JSON.stringify(workflow)));
}

const agendaCode = getNode(agenda, 'Validate and prepare').parameters.jsCode;
const booking = { id: 'booking-1', status: 'confirmed', start_at: '2026-10-07T10:00:00Z', event_type_name: 'Consultation', invitee_name: 'Private Guest', notes: 'Private details', invitee_email: 'private@example.test' };
const agendaRefs = { 'Build date window': { windowStart: '2026-10-07T00:00:00Z', windowEnd: '2026-10-08T00:00:00Z', businessTimezone: 'UTC', includeNames: false } };
const agendaPage = { data: [booking], meta: { pagination: { limit: 200, offset: 0, total: 1 } } };
const agendaResult = runCode(agendaCode, [agendaPage], agendaRefs);
assert.match(agendaResult[0].json.text, /Consultation/);
assert(!agendaResult[0].json.text.includes('Private Guest'));
assert(!agendaResult[0].json.text.includes('Private details'));
assert(!agendaResult[0].json.text.includes('private@example.test'));
assert.throws(() => runCode(agendaCode, [{ ...agendaPage, meta: { pagination: { limit: 200, offset: 0, total: 2 } } }], agendaRefs), /incomplete/i);
assert.throws(() => runCode(agendaCode, [{ ...agendaPage, data: [booking, booking], meta: { pagination: { limit: 200, offset: 0, total: 2 } } }], agendaRefs), /duplicate/i);

const performanceCode = getNode(performance, 'Validate and prepare').parameters.jsCode;
const performanceRefs = { 'Build date window': { windowStart: '2026-10-07T00:00:00Z', windowEnd: '2026-10-08T00:00:00Z' } };
const performancePage = { data: [{ id: 'call-1', created_at: '2026-10-07T10:00:00Z', status: 'completed', duration_sec: 120, sentiment: 'negative', success: false, from_number: '+49123456789', transcript: 'Private conversation' }], meta: { pagination: { limit: 200, offset: 0, total: 1 } } };
const performanceResult = runCode(performanceCode, [performancePage], performanceRefs);
assert.equal(performanceResult[0].json.totalCalls, 1);
assert(!performanceResult[0].json.text.includes('+49123456789'));
assert(!performanceResult[0].json.text.includes('Private conversation'));

const inventoryCode = getNode(inventory, 'Validate and prepare assistant rows').parameters.jsCode;
const assistant = { id: 'assistant-1', name: 'Demo assistant', is_active: true, mode: 'pipeline', stt_language: 'en', tags: ['demo'], system_prompt: 'Private instructions', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' };
const assistantPage = { data: [assistant], meta: { pagination: { limit: 200, offset: 0, total: 1 } } };
const rows = runCode(inventoryCode, [assistantPage], { 'Configure inventory': { previewOnly: true } });
assert.equal(rows[0].json['Assistant ID'], 'assistant-1');
assert.equal(rows[0].json.hasRows, true);
assert(!JSON.stringify(rows).includes('Private instructions'));
const empty = runCode(inventoryCode, [{ data: [], meta: { pagination: { limit: 200, offset: 0, total: 0 } } }], { 'Configure inventory': { previewOnly: true } });
assert.equal(empty[0].json.hasRows, false);

console.log('Famulor n8n templates passed structure, pagination, privacy and sample-output checks.');
