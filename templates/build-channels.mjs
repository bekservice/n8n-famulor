import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const uid = (text) => {
	const h = createHash('sha256').update('famulor-channels:' + text).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function historyPages(pages, window, channels) {
	const total = pages[0]?.meta?.pagination?.total;
	if (!Number.isSafeInteger(total) || total < 0 || total > 2000) throw new Error('History scan is missing its total or exceeds 2,000 conversations. Narrow the window before writing.');
	const start = Date.parse(window.windowStart), end = Date.parse(window.windowEnd);
	if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Invalid scan window.');
	const all = [], seen = new Set();
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i], meta = page?.meta?.pagination;
		if (!Array.isArray(page?.data) || !meta || meta.total !== total || meta.offset !== i * 200 || meta.limit !== 200 || page.data.length > 200) throw new Error('Inconsistent History pagination. No destination write was attempted.');
		for (const row of page.data) {
			const stamp = Date.parse(row.last_activity_at);
			const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
			if ((row.thread_id != null && !uuid(row.thread_id)) || (row.assistant_id != null && !uuid(row.assistant_id)) || typeof row.last_activity_at !== 'string') throw new Error('Invalid History relation or activity timestamp.');
			if (typeof row.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id) || seen.has(row.id) || !channels.includes(row.channel) || !Number.isFinite(stamp) || stamp < start || stamp > end) throw new Error('History row is duplicated, malformed or outside the requested scope.');
			seen.add(row.id);
			all.push(row);
		}
	}
	if (all.length !== total) throw new Error('Incomplete History scan. No destination write was attempted.');
	return all.filter(row => Date.parse(row.last_activity_at) < end);
}

function factory(key, name) {
	const nodes = [], connections = {};
	const node = (name, type, typeVersion, position, parameters = {}) => {
		const value = { id: uid(key + name), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters };
		nodes.push(value);
		return value;
	};
	const edge = (from, to, branch = 0) => {
		connections[from] ??= { main: [] };
		while (connections[from].main.length <= branch) connections[from].main.push([]);
		connections[from].main[branch].push({ node: to, type: 'main', index: 0 });
	};
	const config = (name, values, position = [220, 300], preserve = false) => node(name, 'set', 3.4, position, {
		assignments: { assignments: Object.entries(values).map(([name, value]) => ({ id: uid(key + name), name, value, type: typeof value })) },
		includeOtherFields: preserve, options: {},
	});
	const code = (name, jsCode, position) => node(name, 'code', 2, position, { jsCode });
	const note = (name, content, position, width = 510, height = 230) => node(name, 'stickyNote', 1, position, { content, width, height, color: 7 });
	const condition = (name, field, position) => node(name, 'if', 2.2, position, {
		conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: uid(key + name), leftValue: `={{ $json.${field} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
	});
	const readHistory = (name, type, query, position) => node(name, 'httpRequest', 4.2, position, {
		method: 'GET', url: 'https://app.famulor.io/api/v1/history', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendQuery: true,
		queryParameters: { parameters: [{ name: 'type', value: type }, ...Object.entries(query).map(([name, value]) => ({ name, value })), { name: 'from', value: "={{ $('Build scan window').first().json.windowStart }}" }, { name: 'to', value: "={{ $('Build scan window').first().json.windowEnd }}" }, { name: 'limit', value: '200' }, { name: 'offset', value: '0' }] },
		options: { response: { response: { responseFormat: 'json' } }, redirect: { redirect: { followRedirects: false } }, pagination: { pagination: { parameters: { parameters: [{ name: 'offset', value: '={{ $pageCount * 200 }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !Array.isArray($response.body?.data) || $response.body.data.length < 200 || (($pageCount + 1) * 200 >= $response.body?.meta?.pagination?.total) }}', limitPagesFetched: true, maxRequests: 10 } }, timeout: 30000 },
	});
	const start = (weekly = false) => {
		node('Run manual preview', 'manualTrigger', 1, [0, 400]);
		node(weekly ? 'Monday report schedule' : 'Daily review schedule', 'scheduleTrigger', 1.2, [0, 200], { rule: { interval: weekly ? [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 8 }] : [{ field: 'days', triggerAtHour: 8 }] } });
		edge('Run manual preview', 'Configure workflow'); edge(weekly ? 'Monday report schedule' : 'Daily review schedule', 'Configure workflow');
	};
	const window = (days = 1) => code('Build scan window', `const c=$input.first().json;const now=new Date();const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));const start=new Date(end.getTime()-${days}*86400000);return [{json:{...c,windowStart:start.toISOString(),windowEnd:end.toISOString(),runAt:now.toISOString()}}];`, [440, 300]);
	const save = (guide) => {
		const workflow = { name, nodes, connections, active: false, settings: { executionOrder: 'v1', timezone: 'UTC' }, pinData: {}, tags: [] };
		writeFileSync(join(here, `${key}.json`), JSON.stringify(workflow, null, 2) + '\n');
		writeFileSync(join(here, `${key}.md`), `# ${name}\n\n${guide}\n`);
	};
	return { node, edge, config, code, note, condition, readHistory, start, window, save };
}

const historyCode = historyPages.toString();

{
	const f = factory('famulor-whatsapp-freshdesk-review', 'Review unsuccessful WhatsApp conversations in a daily Freshdesk triage ticket');
	f.start(); f.config('Configure workflow', { previewOnly: true, requesterId: '' }); f.window();
	f.readHistory('Read unsuccessful WhatsApp conversations', 'whatsapp', { status: 'completed', outcome: 'unsuccessful' }, [660, 300]);
	f.code('Prepare triage references', `${historyCode}\nconst w=$('Build scan window').first().json;const rows=historyPages($input.all().map(i=>i.json),w,['whatsapp']);if(rows.some(r=>r.status!=='completed'))throw new Error('Expected completed conversations.');if(!rows.length)return [];const shown=rows.slice(0,50);const description='Review unsuccessful WhatsApp conversations in Famulor. UTC window: '+w.windowStart+' to '+w.windowEnd+' (end excluded).\\n'+shown.map(r=>'Conversation '+r.id+' | '+r.status+' | last activity '+r.last_activity_at).join('\\n')+(rows.length>50?'\\nShowing 50 of '+rows.length+'; review the rest in Famulor.':'')+'\\nNo message bodies, contact details or summaries are copied. Re-running this window can create a duplicate ticket.';const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return [{json:{subject:'Famulor WhatsApp review — '+w.windowStart.slice(0,10)+' ('+rows.length+')',description,htmlDescription:'<pre>'+escape(description)+'</pre>',caseCount:rows.length,previewOnly:w.previewOnly!==false}}];`, [880, 300]);
	f.condition('Preview only?', 'previewOnly', [1100, 300]); f.node('Inspect triage draft', 'noOp', 1, [1320, 180]);
	f.code('Validate existing requester', "const id=String($('Configure workflow').first().json.requesterId??'');if(!/^[1-9]\\d*$/.test(id)||!Number.isSafeInteger(Number(id)))throw new Error('Choose an existing Freshdesk requester before enabling writes.');return $input.all();", [1320, 420]);
	const old = JSON.parse(readFileSync(join(here, 'famulor-freshdesk-support-triage.json'))).nodes.find(n => n.type === 'n8n-nodes-base.freshdesk');
	const params = JSON.parse(JSON.stringify(old.parameters).replaceAll('Configure triage', 'Configure workflow'));
	f.node('Create WhatsApp review ticket', 'freshdesk', old.typeVersion, [1540, 420], params);
	f.edge('Configure workflow', 'Build scan window'); f.edge('Build scan window', 'Read unsuccessful WhatsApp conversations'); f.edge('Read unsuccessful WhatsApp conversations', 'Prepare triage references'); f.edge('Prepare triage references', 'Preview only?'); f.edge('Preview only?', 'Inspect triage draft'); f.edge('Preview only?', 'Validate existing requester', 1); f.edge('Validate existing requester', 'Create WhatsApp review ticket');
	f.note('Start here', '## WhatsApp support triage\nOne daily ticket links completed WhatsApp conversations whose Famulor analysis marks them unsuccessful. This is not a live message stream or a complete human-handoff queue. Preview is enabled; importing does not activate the schedule.', [0, -50], 600, 210);
	f.note('Connect and configure', '## Setup\nSelect a Famulor History-read HTTP Header Auth credential in the read node (calls:read scope). Select Freshdesk credentials and an existing requester ID. No customer resource is preselected. Keep previewOnly on for the first run.\n[Famulor API setup](https://docs.famulor.io/automations/n8n)', [620, -50]);
	f.note('Coverage and privacy', '## Review before writing\nUTC previous day, up to 2,000 rows. Invalid or incomplete pages stop before writes. At most 50 references are included; omitted counts are stated. Analysis may arrive late. Bodies, names, numbers and summaries stay in Famulor.', [880, 600]);
	f.note('Enable deliberately', '## Destination test and repeats\nVerify the exact export in a designated test Freshdesk area before enabling writes. Check requester, routing and notification rules. Re-running a window can duplicate the ticket; inspect Freshdesk before retrying an uncertain write.', [1390, 600]);
	f.save('## Who is this for?\nSupport teams reviewing unsuccessful WhatsApp conversations without copying message content into a helpdesk.\n\n## How it works\nReads the previous UTC day from unified History with WhatsApp, completed and unsuccessful-analysis filters. Validates pagination, then prepares one bounded Freshdesk ticket. Empty results stop. Preview starts enabled. This adapts our own call-triage approach to message activity windows and conversation references.\n\n## Setup\nSelect an existing Famulor HTTP Header Auth credential with calls:read and Freshdesk credentials. Enter an existing requester ID in Configure workflow. Run the preview, review counts and references, then test the exact export in your designated Freshdesk test area before setting previewOnly to false.\n\n## Limits\n2,000 rows per scan, 50 ticket references, UTC boundaries. Late analysis can miss the selected window. Re-running a window can create another ticket. No contact, message body or summary is copied. Check Freshdesk notifications before enabling the schedule.');
}

{
	const f = factory('famulor-crm-consented-sms', 'Preview and send consent-checked SMS follow-ups from CRM lead events');
	f.node('Authenticated CRM event', 'webhook', 2, [0, 240], { httpMethod: 'POST', path: 'famulor-crm-sms-follow-up', authentication: 'headerAuth', responseMode: 'onReceived', options: {} });
	f.node('Run sample preview', 'manualTrigger', 1, [0, 500]);
	f.code('Synthetic lead example', "return [{json:{sampleInput:true,external_id:'example-event-1',phone:'+15550100000',consent_sms:true}}];", [220, 500]);
	f.config('Configure SMS', { previewOnly: true, fromNumberId: '', messageText: 'Thanks for contacting us. Our team will follow up shortly.' }, [440, 300], true);
	f.code('Check consent and normalize leads', "const seen=new Set();return $input.all().map(item=>{const c=item.json;const raw=c.body&&typeof c.body==='object'&&!Array.isArray(c.body)?c.body:c;const phone=typeof raw.phone==='string'?raw.phone.trim():'';const event=typeof raw.external_id==='string'?raw.external_id.trim():'';const text=typeof c.messageText==='string'?c.messageText.trim():'';const reasons=[];if(raw.consent_sms!==true)reasons.push('Explicit SMS consent is required');if(!/^\\+[1-9]\\d{7,14}$/.test(phone))reasons.push('E.164 phone is required');if(!event||event.length>120)reasons.push('A stable CRM event ID is required');if(seen.has(event))reasons.push('Duplicate event in this execution');if(!text||text.length>1600)reasons.push('Message must contain 1–1600 characters');seen.add(event);return {json:{external_id:event,to:phone,body:text,from_number_id:c.fromNumberId,eligible:reasons.length===0,reasons,previewOnly:c.previewOnly!==false||c.sampleInput===true}};});", [660, 300]);
	f.condition('Eligible for SMS?', 'eligible', [880, 300]); f.node('Inspect rejected lead', 'noOp', 1, [1100, 560]);
	f.condition('Preview or sample?', 'previewOnly', [1100, 220]); f.node('Inspect SMS preview', 'noOp', 1, [1320, 100]);
	f.code('Validate configured sender', "return $input.all().map(item=>{if(typeof item.json.from_number_id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.json.from_number_id))throw new Error('Select an outbound SMS-capable Famulor number before enabling writes.');return item;});", [1320, 340]);
	f.node('Send authorized SMS', 'httpRequest', 4.2, [1540, 340], { method: 'POST', url: 'https://app.famulor.io/api/v1/sms/send', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ { from_number_id: $json.from_number_id, to: $json.to, body: $json.body } }}', options: { response: { response: { responseFormat: 'json' } }, redirect: { redirect: { followRedirects: false } }, timeout: 30000 } });
	f.edge('Authenticated CRM event', 'Configure SMS'); f.edge('Run sample preview', 'Synthetic lead example'); f.edge('Synthetic lead example', 'Configure SMS'); f.edge('Configure SMS', 'Check consent and normalize leads'); f.edge('Check consent and normalize leads', 'Eligible for SMS?'); f.edge('Eligible for SMS?', 'Preview or sample?'); f.edge('Eligible for SMS?', 'Inspect rejected lead', 1); f.edge('Preview or sample?', 'Inspect SMS preview'); f.edge('Preview or sample?', 'Validate configured sender', 1); f.edge('Validate configured sender', 'Send authorized SMS');
	f.note('Start here', '## Consent-checked CRM SMS follow-up\nFor trusted CRM lead events with phone, external_id and boolean consent_sms. Validates the event and exposes rejected reasons. Preview is enabled. The manual example is permanently preview-only, even if writes are enabled later.', [0, -60], 620, 230);
	f.note('Credentials and sender', '## Setup\nConfigure Header Auth on the inbound webhook. Select a separate Famulor HTTP Header Auth credential with sms:send on the send node. Choose an existing outbound SMS-capable number UUID in Configure SMS. No sender or real recipient is bundled.', [650, -60]);
	f.note('Example payload', '## Expected trusted CRM payload\nUse synthetic records first. Example: external_id = example-event-1, phone = +15550100000, consent_sms = true (boolean). String "true" is rejected. Edit messageText in Configure SMS. The webhook acknowledgement is not proof of delivery.', [440, 650]);
	f.note('Activation and repeats', '## Before enabling writes\nRun the exact export against an authorized test sender and recipient. SMS consumes Famulor credits. Source CRM must send each consented event once: duplicates are detected only within one execution, not across requests. An uncertain send must be inspected before retrying.', [1160, 650], 620, 240);
	f.save('## Who is this for?\nCRM teams following up with leads who explicitly consented to SMS.\n\n## How it works\nAn authenticated webhook accepts trusted CRM events. It requires a stable external_id, an E.164 phone and boolean consent_sms=true; invalid events go to a review branch. The message comes from workflow configuration. Preview is on by default, and the included synthetic manual example cannot send even when previewOnly is false.\n\n## Setup\nConfigure the webhook Header Auth credential and your CRM payload. Select a Famulor HTTP Header Auth credential with sms:send in Send authorized SMS. Enter an existing outbound SMS-capable number UUID and your message text in Configure SMS. Run previews, verify rejected cases, then perform a separately authorized end-to-end test with a designated test sender/recipient before setting previewOnly to false.\n\n## Limits\nSMS costs credits; consent and applicable messaging rules are your responsibility. The webhook immediately acknowledges receipt, not delivery. Duplicate event IDs are blocked within an execution only. The source CRM must prevent cross-request duplicates. This workflow does not automatically retry writes; inspect an uncertain send in Famulor before retrying.');
}

{
	const f = factory('famulor-email-hubspot-follow-up', 'Queue failed or overdue native Famulor email replies as HubSpot tasks');
	f.start(); f.config('Configure workflow', { previewOnly: true, pendingMinutes: 30, maxTasks: 20 }); f.window();
	f.readHistory('Read native email threads', 'email', {}, [660, 300]);
	f.code('Select reply failures and overdue threads', `${historyCode}\nconst w=$('Build scan window').first().json;const rows=historyPages($input.all().map(i=>i.json),w,['email']);if(!Number.isFinite(w.pendingMinutes)||w.pendingMinutes<5||!Number.isSafeInteger(w.maxTasks)||w.maxTasks<1||w.maxTasks>100)throw new Error('Choose 5+ pending minutes and a task cap from 1 to 100.');const now=Date.parse(w.runAt);if(!Number.isFinite(now))throw new Error('Invalid run time.');const cases=rows.filter(r=>r.reply_status==='failed'||(r.reply_status==='pending'&&now-Date.parse(r.last_activity_at)>=w.pendingMinutes*60000));if(cases.length>w.maxTasks)throw new Error('Task cap exceeded. Narrow the window and review before writing.');return cases.map(r=>({json:{subject:'Review Famulor email reply '+r.id,description:'Conversation '+(r.thread_id||r.id)+' | History record '+r.id+' | state '+r.reply_status+' | last activity '+r.last_activity_at+'. Review the thread in Famulor before replying. No email addresses, subjects, bodies or raw delivery errors are copied. Re-running this window can duplicate the task.',dueAt:new Date(now+86400000).toISOString(),previewOnly:w.previewOnly!==false}}));`, [880, 300]);
	f.condition('Preview only?', 'previewOnly', [1100, 300]); f.node('Inspect follow-up tasks', 'noOp', 1, [1320, 180]);
	f.node('Create HubSpot follow-up task', 'hubspot', 2.2, [1320, 420], { authentication: 'appToken', resource: 'engagement', operation: 'create', type: 'task', dueDate: '={{ $json.dueAt }}', metadata: { subject: '={{ $json.subject }}', body: '={{ $json.description }}', status: 'NOT_STARTED' }, additionalFields: {} });
	f.edge('Configure workflow', 'Build scan window'); f.edge('Build scan window', 'Read native email threads'); f.edge('Read native email threads', 'Select reply failures and overdue threads'); f.edge('Select reply failures and overdue threads', 'Preview only?'); f.edge('Preview only?', 'Inspect follow-up tasks'); f.edge('Preview only?', 'Create HubSpot follow-up task', 1);
	f.note('Start here', '## Native email reply follow-up\nCreate internal CRM tasks for failed or overdue auto-replies in native Famulor email. Does not watch Gmail/Outlook connector threads, send replies or create CRM contacts. Preview is enabled; empty results do not write.', [0, -50], 600, 220);
	f.note('Credentials and thresholds', '## Setup\nSelect a Famulor History-read HTTP Header Auth credential (calls:read). Select HubSpot Service Key credentials with engagement/task creation access. Set pendingMinutes (minimum 5) and maxTasks (1–100). No contact association or real owner is bundled.', [650, -50]);
	f.note('Scope and privacy', '## Scan and classification\nReads previous UTC-day activity, validates all pages and selects failed replies or pending replies older than the threshold at run time. Stops before all writes if the task cap is exceeded. Copies references and state only, not message content or raw error text.', [650, 640]);
	f.note('Destination test and repeats', '## Before enabling writes\nTest the exact export in a designated HubSpot test area and review task permissions, ownership and notifications. Tasks are unassociated by default. Re-running the same window can create duplicates. This is a windowed review queue, not a complete historic backlog monitor.', [1240, 640]);
	f.save('## Who is this for?\nSupport teams using native Famulor email and HubSpot who want a review queue for failed or overdue replies.\n\n## How it works\nScans native email History with previous UTC-day activity, validates complete pagination and selects failed replies or pending replies older than pendingMinutes. Stops before any write if maxTasks is exceeded. Each task contains only conversation/record references, state and activity time. Preview is on by default.\n\n## Setup\nSelect Famulor HTTP Header Auth with calls:read and HubSpot Service Key credentials with task creation access. Review pendingMinutes/maxTasks in Configure workflow, run the preview and test the exact export in your HubSpot test area before disabling previewOnly. Tasks are unassociated with contacts by default; configure ownership or associations deliberately if needed.\n\n## Limits\nNative email only; Gmail/Outlook connector threads have different reply-state semantics. Previous-day activity is a bounded review window, not a historic backlog monitor. 2,000 scanned rows and at most 100 tasks, with a default cap of 20. Re-running a window can create duplicate tasks. No email send, contact creation, subject/body or raw error export.');
}

{
	const f = factory('famulor-webchat-outcomes-sheets', 'Track weekly completed web chat outcomes by assistant in Google Sheets');
	f.start(true); f.config('Configure workflow', { previewOnly: true }); f.window(7);
	f.readHistory('Read completed web chats', 'live_chat', { status: 'completed' }, [660, 300]);
	f.code('Validate completed web chat window', `${historyCode}\nconst w=$('Build scan window').first().json;const rows=historyPages($input.all().map(i=>i.json),w,['live_chat']);if(rows.some(r=>r.status!=='completed'))throw new Error('Expected completed web chats.');return [{json:{...w,completed:rows.map(r=>({id:r.id,assistant_id:r.assistant_id,duration_sec:r.duration_sec}))}}];`, [880, 300]);
	f.readHistory('Read unsuccessful web chats', 'live_chat', { status: 'completed', outcome: 'unsuccessful' }, [1100, 300]);
	f.code('Build assistant outcome rows', `${historyCode}\nconst w=$('Validate completed web chat window').first().json;const unsuccessful=historyPages($input.all().map(i=>i.json),w,['live_chat']);const ids=new Set(w.completed.map(r=>r.id));if(unsuccessful.some(r=>!ids.has(r.id)||r.status!=='completed'))throw new Error('History changed between scans. No report was written; review and retry the window.');const failed=new Set(unsuccessful.map(r=>r.id));const groups=new Map();for(const r of w.completed){const assistant=typeof r.assistant_id==='string'&&r.assistant_id?r.assistant_id:'unassigned';const g=groups.get(assistant)||{count:0,unsuccessful:0,seconds:0,measured:0};g.count++;if(failed.has(r.id))g.unsuccessful++;if(r.duration_sec!=null){if(!Number.isSafeInteger(r.duration_sec)||r.duration_sec<0||!Number.isSafeInteger(g.seconds+r.duration_sec))throw new Error('Invalid measured duration.');g.seconds+=r.duration_sec;g.measured++;}groups.set(assistant,g);}return [...groups].map(([assistant,g])=>({json:{'Report key':w.windowStart.slice(0,10)+':'+assistant,'Window start':w.windowStart,'Window end':w.windowEnd,'Assistant ID':assistant,'Completed chats':g.count,'Unsuccessful chats':g.unsuccessful,'Measured chats':g.measured,'Average seconds':g.measured?Math.round(g.seconds/g.measured):'',previewOnly:w.previewOnly!==false}}));`, [1320, 300]);
	f.condition('Preview only?', 'previewOnly', [1540, 300]); f.node('Inspect weekly report', 'noOp', 1, [1760, 180]);
	const columns = ['Report key', 'Window start', 'Window end', 'Assistant ID', 'Completed chats', 'Unsuccessful chats', 'Measured chats', 'Average seconds'];
	f.node('Upsert weekly assistant report', 'googleSheets', 4.7, [1760, 420], { operation: 'appendOrUpdate', documentId: { __rl: true, value: '', mode: 'list' }, sheetName: { __rl: true, value: '', mode: 'list' }, columns: { mappingMode: 'defineBelow', value: Object.fromEntries(columns.map(c=>[c,`={{ $json['${c}'] }}`])), matchingColumns: ['Report key'], schema: columns.map(c=>({ id:c,displayName:c,required:false,defaultMatch:false,display:true,type:'string',canBeUsedToMatch:true,removed:false })), attemptToConvertTypes: false, convertFieldsToString: true }, options: {} });
	f.edge('Configure workflow', 'Build scan window'); f.edge('Build scan window', 'Read completed web chats'); f.edge('Read completed web chats', 'Validate completed web chat window'); f.edge('Validate completed web chat window', 'Read unsuccessful web chats'); f.edge('Read unsuccessful web chats', 'Build assistant outcome rows'); f.edge('Build assistant outcome rows', 'Preview only?'); f.edge('Preview only?', 'Inspect weekly report'); f.edge('Preview only?', 'Upsert weekly assistant report', 1);
	f.note('Start here', '## Web chat outcome report\nMonday report for the preceding seven UTC days. Compares all completed web text chats with the unsuccessful-analysis subset, then groups counts and measured durations by assistant. Does not read voice widget calls or copy transcripts/contacts. Preview is enabled.', [0, -60], 620, 240);
	f.note('Credentials and report sheet', '## Setup\nSelect the same Famulor History-read credential (calls:read) in both read nodes. Choose your Google Sheets connection, spreadsheet and tab. Create headers: '+columns.join(', ')+'. Match on Report key.', [650, -60], 620, 240);
	f.note('Validation and coverage', '## Two bounded scans\nEach scan is limited to 2,000 rows. Incomplete pages, wrong channels or a subset not contained in the first scan stop before writes. Missing durations are not counted in the average. Unsuccessful analysis may arrive later; this is not a conversion-rate or exactly-once event feed.', [1100, 640], 600, 240);
	f.note('Enable after destination test', '## Re-runs\nInspect preview rows and test the exact export in a designated sheet before disabling previewOnly. Append-or-update uses Window start + Assistant ID as Report key to update re-runs. Avoid concurrent runs and duplicate Report key values in the sheet; Sheets upsert is not a transactional uniqueness guarantee.', [1720, 640], 620, 240);
	f.save('## Who is this for?\nSupport and CRM operations teams measuring completed web text chat workload and reviewing unsuccessful outcomes by assistant.\n\n## How it works\nMonday schedule scans the preceding seven UTC days twice: all completed live_chat records, then the unsuccessful-analysis subset. It validates pagination and subset consistency, aggregates counts and averages over available durations, and prepares one report row per assistant. Preview starts enabled.\n\n## Setup\nSelect Famulor HTTP Header Auth with calls:read in both read nodes. Create a Google Sheet with these exact headers: '+columns.join(', ')+'. Select the document/tab and match on Report key. Run previews, then test the exact export in a designated sheet before disabling previewOnly.\n\n## Limits\n2,000 rows per scan, UTC boundaries and available analysis. This is not a conversion-rate metric or a complete chat-message stream. Missing durations are excluded from averages. A conversation changing between scans stops the report if subset consistency fails. Re-running the same week updates the same Report key; avoid concurrent runs and duplicate keys. No contact details, text or transcript is exported.');
}

console.log('Built four distinct, inactive channel workflow exports and setup guides.');
