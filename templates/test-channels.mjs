import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keys = ['famulor-whatsapp-freshdesk-review', 'famulor-crm-consented-sms', 'famulor-email-hubspot-follow-up', 'famulor-webchat-outcomes-sheets'];
const load = key => JSON.parse(readFileSync(join(here, key + '.json')));
const get = (w, name) => w.nodes.find(n => n.name === name);
const run = (w, name, items, refs = {}) => new Function('$input', '$', get(w, name).parameters.jsCode)(
	{ all: () => items.map(json => ({ json })), first: () => ({ json: items[0] }) },
	name => ({ first: () => ({ json: refs[name] }) }),
);
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const window = { windowStart: '2026-11-01T00:00:00.000Z', windowEnd: '2026-11-02T00:00:00.000Z', runAt: '2026-11-02T08:00:00.000Z', previewOnly: true, pendingMinutes: 30, maxTasks: 20 };
const row = (channel, extra = {}) => ({ id: uuid(1), thread_id: uuid(1), assistant_id: uuid(9), channel, status: 'completed', last_activity_at: '2026-11-01T12:00:00Z', duration_sec: 120, contact: 'private@example.test', body_preview: 'private-body', summary: 'private-summary', ...extra });
const page = (data, total = data.length, offset = 0) => ({ data, meta: { pagination: { total, limit: 200, offset } } });
const refs = { 'Build scan window': window };

for (const key of keys) {
	const w = load(key), names = w.nodes.map(n => n.name);
	assert.equal(w.active, false); assert.deepEqual(w.pinData, {});
	assert.equal(w.settings.timezone, 'UTC'); assert.equal(new Set(names).size, names.length);
	assert(w.nodes.every(n => n.type.startsWith('n8n-nodes-base.') && !n.credentials));
	assert(w.nodes.filter(n => n.type.endsWith('stickyNote')).length >= 4);
	const config = w.nodes.find(n => n.type.endsWith('.set'));
	assert.equal(config.parameters.assignments.assignments.find(x => x.name === 'previewOnly').value, true);
	for (const [source, branches] of Object.entries(w.connections)) {
		assert(names.includes(source));
		for (const branch of branches.main) for (const edge of branch) assert(names.includes(edge.node));
	}
	for (const http of w.nodes.filter(n => n.type.endsWith('.httpRequest'))) {
		assert(http.parameters.url.startsWith('https://app.famulor.io/api/v1/'));
		assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth');
		assert.equal(http.parameters.options.redirect.redirect.followRedirects, false);
		assert(!http.parameters.headerParameters && !http.parameters.url.includes('?'));
		if (http.parameters.method === 'GET') assert.equal(http.parameters.options.pagination.pagination.maxRequests, 10);
	}
}

{
	const w = load(keys[0]), name = 'Prepare triage references', data = row('whatsapp');
	const out = run(w, name, [page([data])], refs)[0].json;
	assert.equal(out.previewOnly, true); assert.equal(out.caseCount, 1);
	for (const text of ['private@example.test', 'private-body', 'private-summary']) assert(!JSON.stringify(out).includes(text));
	assert.equal(run(w, name, [page([])], refs).length, 0);
	assert.equal(run(w, name, [page([row('whatsapp', { last_activity_at: window.windowEnd })])], refs).length, 0);
	for (const bad of [page([data], 2), page([data, data]), page([], 2001), page([row('sms')]), page([row('whatsapp', { status: 'in_progress' })]), page([row('whatsapp', { assistant_id: '=IMPORTXML("x")' })])]) assert.throws(() => run(w, name, [bad], refs));
	assert.equal(run(w, name, [page([data])], { 'Build scan window': { ...window, previewOnly: undefined } })[0].json.previewOnly, true);
	const many = run(w, name, [page(Array.from({ length: 51 }, (_, i) => row('whatsapp', { id: uuid(i + 1) })))], refs)[0].json;
	assert(many.description.includes('Showing 50 of 51'));
	for (const id of ['', '-1', 'not-an-id', '9007199254740993']) assert.throws(() => run(w, 'Validate existing requester', [out], { 'Configure workflow': { requesterId: id } }));
	assert.equal(run(w, 'Validate existing requester', [out], { 'Configure workflow': { requesterId: '12345' } }).length, 1);
}

{
	const w = load(keys[1]);
	const input = { previewOnly: true, fromNumberId: '', messageText: 'Thanks for contacting us.', external_id: 'crm-event-1', phone: '+15550100000', consent_sms: true };
	const check = (items) => run(w, 'Check consent and normalize leads', items).map(i => i.json);
	const [out] = check([input]); assert.equal(out.eligible, true); assert.equal(out.previewOnly, true);
	assert.deepEqual(out.reasons, []); assert.equal(out.to, input.phone);
	for (const bad of [{ consent_sms: 'true' }, { consent_sms: false }, { phone: 'not-a-number' }, { external_id: '' }, { messageText: '' }, { messageText: 'x'.repeat(1601) }]) assert.equal(check([{ ...input, ...bad }])[0].eligible, false);
	assert.equal(check([input, input])[1].eligible, false);
	assert.equal(check([{ ...input, previewOnly: false, sampleInput: true }])[0].previewOnly, true);
	const [hook] = check([{ previewOnly: true, fromNumberId: '', messageText: input.messageText, body: { external_id: 'hook-event', phone: input.phone, consent_sms: true, messageText: 'untrusted replacement' } }]);
	assert.equal(hook.eligible, true); assert.equal(hook.body, input.messageText);
	assert.throws(() => run(w, 'Validate configured sender', [out]), /sender|number/i);
	assert.equal(run(w, 'Validate configured sender', [{ ...out, from_number_id: uuid(5) }]).length, 1);
	assert.equal(get(w, 'Authenticated CRM event').parameters.authentication, 'headerAuth');
	assert.equal(get(w, 'Send authorized SMS').parameters.url, 'https://app.famulor.io/api/v1/sms/send');
	assert.equal(w.connections['Preview or sample?'].main[0][0].node, 'Inspect SMS preview');
	assert.equal(w.connections['Eligible for SMS?'].main[1][0].node, 'Inspect rejected lead');
}

{
	const w = load(keys[2]), name = 'Select reply failures and overdue threads';
	const cases = [row('email', { reply_status: 'failed', reply_error: 'private-delivery-error' }), row('email', { id: uuid(2), reply_status: 'pending' }), row('email', { id: uuid(3), reply_status: 'replied' })];
	const out = run(w, name, [page(cases)], refs).map(i => i.json);
	assert.equal(out.length, 2); assert(out.every(i => i.previewOnly));
	for (const text of ['private@example.test', 'private-body', 'private-summary', 'private-delivery-error']) assert(!JSON.stringify(out).includes(text));
	assert.equal(run(w, name, [page([])], refs).length, 0);
	assert.throws(() => run(w, name, [page(cases)], { 'Build scan window': { ...window, maxTasks: 1 } }), /cap/);
	assert.throws(() => run(w, name, [page([row('gmail')])], refs), /scope/);
	assert.throws(() => run(w, name, [page(cases)], { 'Build scan window': { ...window, pendingMinutes: 0 } }));
	const fresh = { ...window, runAt: '2026-11-01T12:10:00Z' };
	assert.equal(run(w, name, [page([row('email', { reply_status: 'pending' })])], { 'Build scan window': fresh }).length, 0);
	const task = get(w, 'Create HubSpot follow-up task');
	assert.equal(task.typeVersion, 2.2); assert.equal(task.parameters.type, 'task'); assert.equal(task.parameters.authentication, 'appToken'); assert(task.parameters.dueDate);
}

{
	const w = load(keys[3]);
	const all = [row('live_chat'), row('live_chat', { id: uuid(2), duration_sec: null })];
	const data = run(w, 'Validate completed web chat window', [page(all)], refs)[0].json;
	const refs2 = { 'Validate completed web chat window': data };
	const out = run(w, 'Build assistant outcome rows', [page([all[0]])], refs2)[0].json;
	assert.equal(out['Completed chats'], 2); assert.equal(out['Unsuccessful chats'], 1);
	assert.equal(out['Measured chats'], 1); assert.equal(out['Average seconds'], 120);
	assert.equal(out['Report key'], '2026-11-01:' + uuid(9));
	for (const text of ['private@example.test', 'private-body', 'private-summary']) assert(!JSON.stringify(out).includes(text));
	assert.throws(() => run(w, 'Build assistant outcome rows', [page([row('live_chat', { id: uuid(3) })])], refs2), /between scans/);
	assert.throws(() => run(w, 'Build assistant outcome rows', [page([row('live_chat', { status: 'in_progress' })])], refs2), /between scans/);
	assert.throws(() => run(w, 'Validate completed web chat window', [page([row('avatar')])], refs), /scope/);
	const bad = { ...data, completed: [{ id: uuid(1), assistant_id: uuid(9), duration_sec: Infinity }] };
	assert.throws(() => run(w, 'Build assistant outcome rows', [page([])], { 'Validate completed web chat window': bad }), /duration/);
	const sheet = get(w, 'Upsert weekly assistant report'); assert.equal(sheet.parameters.operation, 'appendOrUpdate');
	assert.deepEqual(sheet.parameters.columns.matchingColumns, ['Report key']); assert.equal(sheet.parameters.documentId.value, ''); assert.equal(sheet.parameters.sheetName.value, '');
}

console.log('Four channel exports passed synthetic branch, consent, pagination, scope, privacy, preview and repeat-key checks. No external requests or destination writes were executed.');
