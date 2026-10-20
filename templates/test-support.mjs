import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const run = (source, items, refs = {}) =>
	new Function('$input', '$', source)(
		{ all: () => items.map((json) => ({ json })), first: () => ({ json: items[0] }) },
		(name) => ({ first: () => ({ json: refs[name] }) }),
	);
const page = (data, total = data.length, offset = 0) => ({
	data,
	meta: { pagination: { total, limit: 200, offset } },
});
const window = {
	windowStart: '2026-10-19T00:00:00.000Z',
	windowEnd: '2026-10-20T00:00:00.000Z',
	previewOnly: true,
	includeSummary: false,
};
for (const key of ['freshdesk', 'zendesk', 'jira']) {
	const workflow = JSON.parse(
		readFileSync(join(here, `famulor-${key}-support-triage.json`), 'utf8'),
	);
	const names = workflow.nodes.map((node) => node.name),
		get = (name) => workflow.nodes.find((node) => node.name === name);
	assert.equal(workflow.active, false);
	assert.equal(workflow.settings.timezone, 'UTC');
	assert.equal(new Set(names).size, names.length);
	assert(
		workflow.nodes.every((node) => node.type.startsWith('n8n-nodes-base.') && !node.credentials),
	);
	assert.deepEqual(workflow.pinData, {});
	assert(workflow.nodes.filter((node) => node.type.endsWith('stickyNote')).length >= 4);
	assert.equal(
		get('Configure triage').parameters.assignments.assignments.find((x) => x.name === 'previewOnly')
			.value,
		true,
	);
	for (const [name, branches] of Object.entries(workflow.connections)) {
		assert(names.includes(name));
		for (const branch of branches.main)
			for (const item of branch) assert(names.includes(item.node));
	}
	const http = get('Read matching Famulor calls');
	assert.equal(http.parameters.method, 'GET');
	assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth');
	assert.equal(http.parameters.options.redirect.redirect.followRedirects, false);
	assert.equal(http.parameters.options.pagination.pagination.maxRequests, 10);
	const code = get('Validate pages and prepare draft').parameters.jsCode;
	const call = {
		id: 'call-fixture',
		created_at: '2026-10-19T12:00:00Z',
		status: key === 'jira' ? 'failed' : 'completed',
		sentiment: 'negative',
		success: false,
		duration_sec: 120,
		summary: '<script>private-summary</script>',
		transcript: 'private-transcript',
		from_number: '+49123456789',
		email: 'private@example.test',
	};
	const refs = { 'Build previous UTC day': window };
	const out = run(code, [page([call])], refs)[0].json;
	assert.equal(out.caseCount, 1);
	assert.equal(out.previewOnly, true);
	assert.equal(out.hasCases, true);
	assert(!JSON.stringify(out).includes('private-summary'));
	assert(!JSON.stringify(out).includes('private-transcript'));
	assert(!JSON.stringify(out).includes('+49123456789'));
	assert(!JSON.stringify(out).includes('private@example.test'));
	assert.equal(run(code, [page([])], refs)[0].json.hasCases, false);
	assert.throws(() => run(code, [page([call], 2)], refs), /Incomplete/);
	assert.throws(() => run(code, [page([call, call])], refs), /duplicate/);
	assert.throws(() => run(code, [page([{ ...call, status: 'in_progress' }])], refs), /scope/);
	assert.throws(
		() => run(code, [page([{ ...call, created_at: '2026-10-18T23:59:59Z' }])], refs),
		/scope/,
	);
	assert.throws(() => run(code, [page([], 2001)], refs), /2,000/);
	const midnight = run(code, [page([{ ...call, created_at: window.windowEnd }])], refs)[0].json;
	assert.equal(midnight.hasCases, false);
	const optIn = run(code, [page([call])], {
		'Build previous UTC day': { ...window, includeSummary: true },
	})[0].json;
	assert(optIn.description.includes('<script>private-summary</script>'));
	assert(!optIn.htmlDescription.includes('<script>'));
	assert(optIn.htmlDescription.includes('&lt;script&gt;'));
	assert.equal(
		run(code, [page([call])], {
			'Build previous UTC day': { ...window, previewOnly: undefined },
		})[0].json.previewOnly,
		true,
	);
	assert.equal(
		run(code, [page([call])], { 'Build previous UTC day': { ...window, previewOnly: false } })[0]
			.json.previewOnly,
		false,
	);
	const large = run(
		code,
		[page(Array.from({ length: 51 }, (_, i) => ({ ...call, id: `fixture-${i}` })))],
		refs,
	)[0].json;
	assert.equal(large.caseCount, 51);
	assert(large.description.includes('Showing 50 of 51'));
	assert(!large.description.includes('fixture-50'));
	const dest = workflow.nodes.find((node) => node.type === `n8n-nodes-base.${key}`);
	assert(dest);
	assert.equal(dest.parameters.operation, 'create');
	assert.equal(workflow.connections['Preview only?'].main[0][0].node, 'Inspect ticket preview');
	assert.equal(
		workflow.connections['Preview only?'].main[1][0].node,
		'Validate destination settings',
	);
	assert.equal(workflow.connections['Any calls need triage?'].main[1].length, 0);
	if (key !== 'jira') {
		const validate = get('Validate destination settings').parameters.jsCode;
		for (const value of ['', '-1', 'abc', '9007199254740993'])
			assert.throws(
				() => run(validate, [out], { 'Configure triage': { requesterId: value } }),
				/existing/,
			);
		assert.equal(run(validate, [out], { 'Configure triage': { requesterId: '12345' } }).length, 1);
	}
	if (key === 'zendesk') {
		assert.equal(dest.parameters.jsonParameters, true);
		assert(dest.parameters.additionalFieldsJson.includes('public:false'));
	}
	if (key === 'freshdesk') {
		assert.equal(dest.parameters.requester, 'requesterId');
		assert.equal(dest.parameters.options.description, '={{ $json.htmlDescription }}');
	}
	if (key === 'jira') {
		assert.equal(dest.parameters.project.value, '');
		assert.equal(dest.parameters.issueType.value, '');
	}
}
console.log(
	'All three support workflows passed structure, scope, pagination, privacy, preview and boundary checks without external requests.',
);
