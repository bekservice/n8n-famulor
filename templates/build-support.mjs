import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const id = (name) => {
	const h = createHash('sha256')
		.update('famulor-support:' + name)
		.digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const node = (name, type, version, position, parameters = {}) => ({
	id: id(name),
	name,
	type: 'n8n-nodes-base.' + type,
	typeVersion: version,
	position,
	parameters,
});
const edge = (name) => ({ node: name, type: 'main', index: 0 });
const note = (name, content, position, width = 490, height = 210, color = 7) =>
	node(name, 'stickyNote', 1, position, { content, width, height, color });
const routes = [
	{
		key: 'freshdesk',
		label: 'Freshdesk',
		name: 'Create a daily Freshdesk triage ticket for negative Famulor calls',
		query: { status: 'completed', sentiment: 'negative' },
		reason: 'completed calls with a negative sentiment',
		select: "call.status === 'completed' && call.sentiment === 'negative'",
		kind: 'negative-call triage',
	},
	{
		key: 'zendesk',
		label: 'Zendesk',
		name: 'Create an internal Zendesk handoff ticket for unsuccessful Famulor calls',
		query: { status: 'completed', success: 'false' },
		reason: 'completed calls explicitly marked unsuccessful',
		select: "call.status === 'completed' && call.success === false",
		kind: 'unsuccessful-call handoff',
	},
	{
		key: 'jira',
		label: 'Jira',
		name: 'Create a Jira investigation issue for failed Famulor calls',
		query: { status: 'failed' },
		reason: 'calls with the failed status',
		select: "call.status === 'failed'",
		kind: 'failed-call investigation',
	},
];
for (const route of routes) {
	const description = `## Who is this for?
Support and operations teams using Famulor and ${route.label} who want a focused daily ${route.kind} queue.

## How it works
Each morning, the workflow reads ${route.reason} created during the previous UTC day. It validates every API page before preparing one aggregate ${route.key === 'jira' ? 'issue' : 'ticket'}. Empty results produce no write. The preview branch starts enabled, so manual previews show the draft without changing ${route.label}.

## Setup
1. Store a Famulor workspace key with calls:read in an n8n HTTP Header Auth credential: header Authorization, value Bearer followed by your key. Select it in Read matching Famulor calls.
2. Connect your ${route.label} credential.${route.key === 'jira' ? ' Select your project and issue type in Create investigation issue.' : ' Enter an existing requester ID in Configure triage. This avoids automatically creating a contact.'}
3. Run a preview and inspect the draft. Optional summaries start disabled; enable them only if your ticket audience may see conversation summaries. Raw transcripts, phone numbers and email addresses are excluded.
4. Switch previewOnly off and activate the daily schedule when ready.

## Requirements and customization
Uses only built-in n8n nodes and works without a community package. Change the schedule if needed; the query window always uses UTC. Scans above 2,000 records or incomplete pagination fail before writes. One draft contains at most 50 call references and clearly reports omitted rows. Re-running a non-preview window can create another ticket; this is not exactly-once delivery. ${route.key === 'zendesk' ? 'The first Zendesk comment is private. ' : ''}Check destination notification rules before activation. [Famulor API setup](https://docs.famulor.io/automations/n8n).`;
	const params = [
		['previewOnly', true, 'boolean'],
		['includeSummary', false, 'boolean'],
		...(route.key === 'jira' ? [] : [['requesterId', '', 'string']]),
	];
	const config = node('Configure triage', 'set', 3.4, [220, 300], {
		assignments: {
			assignments: params.map(([name, value, type]) => ({
				id: id(route.key + name),
				name,
				value,
				type,
			})),
		},
		options: {},
	});
	const window = node('Build previous UTC day', 'code', 2, [440, 300], {
		jsCode: `const now=new Date(); const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())); const start=new Date(end.getTime()-86400000); return [{json:{...$input.first().json,windowStart:start.toISOString(),windowEnd:end.toISOString()}}];`,
	});
	const read = node('Read matching Famulor calls', 'httpRequest', 4.2, [660, 300], {
		method: 'GET',
		url: 'https://app.famulor.io/api/v1/calls',
		authentication: 'genericCredentialType',
		genericAuthType: 'httpHeaderAuth',
		sendQuery: true,
		queryParameters: {
			parameters: [
				...Object.entries(route.query).map(([name, value]) => ({ name, value })),
				{ name: 'from', value: '={{ $json.windowStart }}' },
				{ name: 'to', value: '={{ $json.windowEnd }}' },
				{ name: 'limit', value: '200' },
				{ name: 'offset', value: '0' },
			],
		},
		options: {
			response: { response: { responseFormat: 'json' } },
			redirect: { redirect: { followRedirects: false } },
			pagination: {
				pagination: {
					parameters: { parameters: [{ name: 'offset', value: '={{ $pageCount * 200 }}' }] },
					paginationCompleteWhen: 'other',
					completeExpression:
						'={{ !Array.isArray($response.body?.data) || $response.body.data.length < 200 || (($pageCount + 1) * 200 >= $response.body?.meta?.pagination?.total) }}',
					limitPagesFetched: true,
					maxRequests: 10,
				},
			},
			timeout: 30000,
		},
	});
	const prepare = node('Validate pages and prepare draft', 'code', 2, [880, 300], {
		jsCode: `const config=$('Build previous UTC day').first().json;
const pages=$input.all().map(item=>item.json); const total=pages[0]?.meta?.pagination?.total;
if(!Number.isSafeInteger(total)||total<0||total>2000)throw new Error('Missing pagination total or more than 2,000 calls. Narrow the scan before writing.');
let calls=[];let offset=0;
for(const page of pages){const meta=page?.meta?.pagination;if(!Array.isArray(page?.data)||!meta||meta.total!==total||meta.offset!==offset||meta.limit!==200||page.data.length>200)throw new Error('Inconsistent Famulor pagination; no ticket was created.');calls.push(...page.data);offset+=200;}
if(calls.length!==total)throw new Error('Incomplete Famulor scan; no ticket was created.');
const seen=new Set();const start=Date.parse(config.windowStart),end=Date.parse(config.windowEnd);
for(const call of calls){if(typeof call.id!=='string'||!call.id||seen.has(call.id))throw new Error('Missing or duplicate call ID.');seen.add(call.id);const created=Date.parse(call.created_at);if(!Number.isFinite(created)||created<start||created>end||!(${route.select}))throw new Error('Call is outside the requested triage scope.');}
calls=calls.filter(call=>Date.parse(call.created_at)<end);
const date=config.windowStart.slice(0,10);const shown=calls.slice(0,50);const lines=shown.map(call=>{let line='Call '+call.id+' | '+call.status+' | created '+call.created_at;if(Number.isFinite(call.duration_sec))line+=' | duration '+call.duration_sec+'s';if(config.includeSummary===true&&typeof call.summary==='string'&&call.summary.trim())line+='\\nSummary: '+call.summary.slice(0,1200);return line;});
const subject='Famulor ${route.kind} — '+date+' ('+calls.length+' calls)';
const description='UTC window: '+config.windowStart+' to '+config.windowEnd+' (end excluded).\\nReview the calls below and assign the next support action.\\n'+(calls.length>50?'Showing 50 of '+calls.length+' calls. Review the remaining calls in Famulor.\\n':'')+'\\n'+lines.join('\\n\\n')+'\\n\\nSummaries may be unavailable or arrive later. Re-running this window can create a duplicate ticket.';
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
return [{json:{subject,description,htmlDescription:'<pre>'+escape(description)+'</pre>',hasCases:calls.length>0,caseCount:calls.length,previewOnly:config.previewOnly!==false}}];`,
	});
	const condition = (name, field, position) =>
		node(name, 'if', 2.2, position, {
			conditions: {
				options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
				conditions: [
					{
						id: id(name),
						leftValue: '={{ $json.' + field + ' }}',
						rightValue: '',
						operator: { type: 'boolean', operation: 'true', singleValue: true },
					},
				],
				combinator: 'and',
			},
			options: {},
		});
	const hasCases = condition('Any calls need triage?', 'hasCases', [1100, 300]);
	const preview = condition('Preview only?', 'previewOnly', [1320, 300]);
	const validate = node('Validate destination settings', 'code', 2, [1540, 420], {
		jsCode:
			route.key === 'jira'
				? 'return $input.all();'
				: `const requester=String($('Configure triage').first().json.requesterId??'').trim();if(!/^[1-9]\\d*$/.test(requester)||!Number.isSafeInteger(Number(requester)))throw new Error('Enter an existing ${route.label} requester ID before turning preview off.');return $input.all();`,
	});
	let destination;
	if (route.key === 'freshdesk')
		destination = node('Create triage ticket', 'freshdesk', 1, [1760, 420], {
			resource: 'ticket',
			operation: 'create',
			requester: 'requesterId',
			requesterIdentificationValue: "={{ $('Configure triage').first().json.requesterId }}",
			status: 'open',
			priority: 'medium',
			source: 'phone',
			options: {
				subject: '={{ $json.subject }}',
				description: '={{ $json.htmlDescription }}',
				tags: 'famulor,call-triage',
			},
		});
	if (route.key === 'zendesk')
		destination = node('Create private handoff ticket', 'zendesk', 1, [1760, 420], {
			authentication: 'apiToken',
			resource: 'ticket',
			operation: 'create',
			description: '={{ $json.description }}',
			jsonParameters: true,
			additionalFieldsJson:
				"={{ JSON.stringify({subject:$json.subject,requester_id:Number($('Configure triage').first().json.requesterId),status:'open',type:'problem',tags:['famulor','call-handoff'],comment:{body:$json.description,public:false}}) }}",
		});
	if (route.key === 'jira')
		destination = node('Create investigation issue', 'jira', 1, [1760, 420], {
			jiraVersion: 'cloud',
			resource: 'issue',
			operation: 'create',
			project: { __rl: true, value: '', mode: 'list' },
			issueType: { __rl: true, value: '', mode: 'list' },
			summary: '={{ $json.subject }}',
			additionalFields: {
				description: '={{ $json.description }}',
				labels: ['famulor', 'call-investigation'],
			},
		});
	const edges = {
		"Preview yesterday's triage": [['Configure triage']],
		'Every day at 08:00 UTC': [['Configure triage']],
		'Configure triage': [['Build previous UTC day']],
		'Build previous UTC day': [['Read matching Famulor calls']],
		'Read matching Famulor calls': [['Validate pages and prepare draft']],
		'Validate pages and prepare draft': [['Any calls need triage?']],
		'Any calls need triage?': [['Preview only?'], []],
		'Preview only?': [['Inspect ticket preview'], ['Validate destination settings']],
		'Validate destination settings': [[destination.name]],
	};
	const workflow = {
		name: route.name,
		active: false,
		settings: { executionOrder: 'v1', timezone: 'UTC' },
		nodes: [
			node("Preview yesterday's triage", 'manualTrigger', 1, [0, 300]),
			node('Every day at 08:00 UTC', 'scheduleTrigger', 1.2, [0, 460], {
				rule: {
					interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }],
				},
			}),
			config,
			window,
			read,
			prepare,
			hasCases,
			preview,
			node('Inspect ticket preview', 'noOp', 1, [1540, 160]),
			validate,
			destination,
			note('About this workflow', description, [-20, -500], 760, 720, 4),
			note(
				'1. Select your credentials',
				'Use HTTP Header Auth for Famulor: Authorization = Bearer followed by a calls:read key. The workflow export has no credentials or real requester IDs. Choose your ticket-system credential separately.',
				[640, 590],
			),
			note(
				'2. Validate before writing',
				'Every page and selected call must match the query. Empty or incomplete scans do not create tickets. Only IDs, status, date and duration are included by default; summaries are opt-in.',
				[870, 840],
			),
			note(
				'3. Preview, then activate',
				`Preview only starts enabled. Configure ${route.key === 'jira' ? 'project and issue type' : 'an existing requester ID'}, inspect the draft, then turn preview off. This is one daily aggregate, not a per-call real-time workflow. Replays can create duplicates. Check notification settings.`,
				[1300, 650],
				540,
				250,
			),
		],
		connections: Object.fromEntries(
			Object.entries(edges).map(([from, branches]) => [
				from,
				{ main: branches.map((branch) => branch.map(edge)) },
			]),
		),
		pinData: {},
	};
	writeFileSync(
		join(here, `famulor-${route.key}-support-triage.json`),
		JSON.stringify(workflow, null, 2) + '\n',
	);
	writeFileSync(
		join(here, `famulor-${route.key}-support-triage.md`),
		'# ' + route.name + '\n\n' + description + '\n',
	);
}
console.log('Built three credential-free, inactive support triage workflows.');
