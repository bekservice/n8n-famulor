import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	API_PREFIX,
	DEFAULT_BASE_URL,
	buildApiUrl,
	buildMakeCallBody,
	extractAssistantId,
	extractListItems,
	extractWebhookEvent,
	isE164,
	parseLead,
	resolveBaseUrl,
	unwrapResource,
} from '../nodes/Famulor/api';

describe('resolveBaseUrl / buildApiUrl', () => {
	it('defaults to the Platform 2.0 host and /api/v1', () => {
		assert.equal(resolveBaseUrl(), DEFAULT_BASE_URL);
		assert.equal(resolveBaseUrl(''), DEFAULT_BASE_URL);
		assert.equal(resolveBaseUrl('https://app.famulor.io/'), 'https://app.famulor.io');
		assert.equal(buildApiUrl(undefined, '/calls'), 'https://app.famulor.io/api/v1/calls');
		assert.equal(API_PREFIX, '/api/v1');
	});

	it('strips a trailing /api/v1 and keeps a verified custom domain', () => {
		assert.equal(resolveBaseUrl('https://calls.example.com/api/v1'), 'https://calls.example.com');
		assert.equal(
			buildApiUrl('https://calls.example.com', 'assistants'),
			'https://calls.example.com/api/v1/assistants',
		);
	});

	it('rejects Classic 1.0 app.famulor.de', () => {
		assert.throws(() => resolveBaseUrl('https://app.famulor.de'), /Classic 1\.0/);
		assert.throws(() => buildApiUrl('https://app.famulor.de', '/user/make_call'), /Classic 1\.0/);
	});
});

describe('buildMakeCallBody', () => {
	it('sends assistant_id + to_number and optional phone_number_id + lead', () => {
		assert.deepEqual(
			buildMakeCallBody({
				assistantId: '22222222-2222-4222-8222-222222222222',
				toNumber: '+4930123456',
			}),
			{
				assistant_id: '22222222-2222-4222-8222-222222222222',
				to_number: '+4930123456',
			},
		);

		assert.deepEqual(
			buildMakeCallBody({
				assistantId: '22222222-2222-4222-8222-222222222222',
				toNumber: '+4930123456',
				phoneNumberId: '33333333-3333-4333-8333-333333333333',
				lead: { name: 'Jane Doe', company: 'Acme' },
			}),
			{
				assistant_id: '22222222-2222-4222-8222-222222222222',
				to_number: '+4930123456',
				phone_number_id: '33333333-3333-4333-8333-333333333333',
				lead: { name: 'Jane Doe', company: 'Acme' },
			},
		);
	});

	it('never includes Classic 1.0 fields variables, from_number, or lead_id', () => {
		const body = buildMakeCallBody({
			assistantId: '22222222-2222-4222-8222-222222222222',
			toNumber: '+4930123456',
			lead: { name: 'Jane' },
		});

		assert.equal('variables' in body, false);
		assert.equal('from_number' in body, false);
		assert.equal('lead_id' in body, false);
		assert.equal('phone_number' in body, false);
	});
});

describe('parseLead / isE164', () => {
	it('parses a lead object and ignores empty JSON', () => {
		assert.deepEqual(parseLead('{"name":"Jane"}'), { name: 'Jane' });
		assert.deepEqual(parseLead({ company: 'Acme' }), { company: 'Acme' });
		assert.equal(parseLead('{}'), undefined);
		assert.equal(parseLead(''), undefined);
		assert.throws(() => parseLead('[]'), /JSON object/);
	});

	it('accepts E.164 numbers only', () => {
		assert.equal(isE164('+4930123456'), true);
		assert.equal(isE164('4930123456'), false);
		assert.equal(isE164('+49 30123456'), false);
	});
});

describe('response helpers', () => {
	it('extracts list items from array or data wrappers', () => {
		assert.deepEqual(extractListItems([{ id: '1' }]), [{ id: '1' }]);
		assert.deepEqual(extractListItems({ data: [{ id: '2' }] }), [{ id: '2' }]);
		assert.deepEqual(extractListItems({ data: { items: [{ id: '3' }] } }, ['items']), [{ id: '3' }]);
		assert.throws(() => extractListItems({ ok: true }), /unexpected list payload/);
	});

	it('unwraps a single resource and reads webhook event metadata', () => {
		assert.deepEqual(unwrapResource({ data: { id: 'call-1' } }), { id: 'call-1' });
		assert.equal(
			extractAssistantId({
				event: 'call.completed',
				data: { assistant_id: '22222222-2222-4222-8222-222222222222' },
			}),
			'22222222-2222-4222-8222-222222222222',
		);
		assert.equal(extractWebhookEvent({ event: 'call.completed' }), 'call.completed');
		assert.equal(extractWebhookEvent({ type: 'call.completed' }), 'call.completed');
	});
});
