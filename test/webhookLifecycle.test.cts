import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IHookFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { FamulorTriggerV2 } from '../nodes/Famulor/v2/FamulorTriggerV2.node';
import { FamulorTriggerV3 } from '../nodes/Famulor/v3/FamulorTriggerV3.node';
import { FamulorTriggerV4 } from '../nodes/Famulor/v4/FamulorTriggerV4.node';
import { FamulorWebhookApi } from '../credentials/FamulorWebhookApi.credentials';

const secret = 'fixture-signing-secret-32-characters';
const url = 'https://example.com/webhook/workflow/node';
function fixture(version: 2 | 3 | 4, mode = 'automatic') {
	const state: Record<string, unknown> = {};
	const remote = new Map<string, Record<string, unknown>>();
	const requests: { credential: string; method: string; url: string; body?: unknown }[] = [];
	const node: INode = {
		id: 'node',
		name: 'Famulor Trigger',
		type: 'n8n-nodes-famulor.famulorTrigger',
		typeVersion: version,
		position: [0, 0],
		parameters: {},
		credentials: {
			famulorApi: { id: 'api', name: 'API' },
			famulorWebhookApi: { id: 'webhook', name: 'Webhook' },
		},
	};
	const context = {
		getNode: () => node,
		getWorkflow: () => ({ id: 'workflow' }),
		getNodeWebhookUrl: () => url,
		getWorkflowStaticData: () => state,
		getNodeParameter: (name: string, fallback: unknown) =>
			(
				({ registrationMode: mode, event: 'call.completed', webhookSecret: secret }) as Record<
					string,
					unknown
				>
			)[name] ?? fallback,
		getCredentials: async () => ({
			apiKey: 'fixture-key',
			baseUrl: 'https://app.famulor.io',
			secret,
		}),
		helpers: {
			httpRequestWithAuthentication: async function (
				credential: string,
				options: { method: string; url: string; body?: Record<string, unknown> },
			) {
				requests.push({ credential, ...options });
				const id = options.url.split('/').at(-1)!;
				if (options.method === 'POST') {
					const body = options.body!;
					const saved = { id: body.id, url: body.url, events: body.events, is_active: true };
					remote.set(String(body.id), saved);
					return { statusCode: 201, body: { data: saved } };
				}
				if (options.method === 'DELETE') {
					remote.delete(id);
					return { statusCode: 200, body: { data: { id, deleted: true } } };
				}
				return remote.has(id)
					? { statusCode: 200, body: { data: remote.get(id) } }
					: { statusCode: 404, body: { error: { message: 'Not found' } } };
			},
		},
	} as unknown as IHookFunctions;
	const instance =
		version === 2
			? new FamulorTriggerV2()
			: version === 3
				? new FamulorTriggerV3()
				: new FamulorTriggerV4();
	return { context, state, remote, requests, node, methods: instance.webhookMethods.default };
}

describe('managed webhook lifecycle', () => {
	for (const version of [2, 3, 4] as const)
		it(`version ${version}: registers, verifies, recovers state and deletes only its subscription`, async () => {
			const f = fixture(version);
			assert.equal(await f.methods.checkExists.call(f.context), false);
			assert.equal(await f.methods.create.call(f.context), true);
			const first = f.requests.find((r) => r.method === 'POST')!;
			assert.equal(first.credential, version === 2 ? 'famulorApi' : 'famulorWebhookApi');
			assert.deepEqual((first.body as Record<string, unknown>).events, ['call.completed']);
			assert.equal((first.body as Record<string, unknown>).secret, secret);
			assert.equal(JSON.stringify(f.state).includes(secret), false);
			f.remote.set('unrelated', { id: 'unrelated', url: 'https://example.com/other' });
			assert.equal(await f.methods.checkExists.call(f.context), true);
			delete f.state.famulorSubscription;
			assert.equal(await f.methods.checkExists.call(f.context), true);
			assert.equal(await f.methods.delete.call(f.context), true);
			assert.equal(f.remote.size, 1);
			assert.ok(f.remote.has('unrelated'));
			assert.equal(await f.methods.delete.call(f.context), true);
			assert.equal(f.requests.filter((r) => r.method === 'DELETE').length, 1);
		});
	it('repeats an ambiguous registration with the same deterministic UUID', async () => {
		const f = fixture(4);
		await f.methods.create.call(f.context);
		delete f.state.famulorSubscription;
		await f.methods.create.call(f.context);
		const ids = f.requests
			.filter((r) => r.method === 'POST')
			.map((r) => (r.body as { id: string }).id);
		assert.equal(ids[0], ids[1]);
		assert.equal(f.remote.size, 1);
	});
	for (const loseState of [false, true]) it(`cleans a committed registration whose response was lost (state lost: ${loseState})`, async () => {
		const f = fixture(4);
		const http = f.context.helpers.httpRequestWithAuthentication;
		f.context.helpers.httpRequestWithAuthentication = (async function (...args: Parameters<typeof http>) {
			const result = await http.apply(this, args);
			if ((args[1] as { method: string }).method === 'POST') throw { statusCode: 503 };
			return result;
		}) as typeof http;
		await assert.rejects(f.methods.create.call(f.context), /HTTP 503/);
		assert.equal(f.remote.size, 1);
		assert.ok(f.state.famulorSubscription);
		if (loseState) delete f.state.famulorSubscription;
		f.context.helpers.httpRequestWithAuthentication = http;
		await f.methods.delete.call(f.context);
		assert.equal(f.remote.size, 0);
	});
	it('does not replace or delete manually configured destinations', async () => {
		const f = fixture(3, 'manual');
		assert.equal(await f.methods.checkExists.call(f.context), true);
		assert.equal(await f.methods.delete.call(f.context), true);
		assert.equal(f.requests.length, 0);
		await assert.rejects(f.methods.create.call(f.context), NodeOperationError);
		assert.equal(
			new FamulorTriggerV3().description.properties.find((p) => p.name === 'registrationMode')
				?.default,
			'manual',
		);
		assert.equal(
			new FamulorTriggerV4().description.properties.find((p) => p.name === 'registrationMode')
				?.default,
			'automatic',
		);
	});
	it('surfaces API failures and keeps the owned ID for retrying cleanup', async () => {
		const f = fixture(4);
		await f.methods.create.call(f.context);
		f.context.helpers.httpRequestWithAuthentication = async () => {
			throw { statusCode: 503 };
		};
		await assert.rejects(f.methods.delete.call(f.context), /HTTP 503/);
		assert.ok(f.state.famulorSubscription);
	});
	it('cleans up the saved subscription after an API key and signing secret rotation', async () => {
		const f = fixture(4);
		await f.methods.create.call(f.context);
		f.context.getCredentials = (async () => ({ apiKey: 'rotated-key', baseUrl: 'https://app.famulor.io', secret: 'rotated-signing-secret' })) as IHookFunctions['getCredentials'];
		assert.equal(await f.methods.delete.call(f.context), true);
		assert.equal(f.remote.size, 0);
		assert.equal(f.requests.filter((r) => r.method === 'DELETE').length, 1);
	});
	it('removes the previous owned subscription before reactivation with changed settings', async () => {
		const f = fixture(4);
		await f.methods.create.call(f.context);
		f.context.getCredentials = (async () => ({ apiKey: 'rotated-key', baseUrl: 'https://app.famulor.io', secret: 'rotated-signing-secret' })) as IHookFunctions['getCredentials'];
		assert.equal(await f.methods.checkExists.call(f.context), false);
		await f.methods.create.call(f.context);
		assert.equal(f.remote.size, 1);
		await f.methods.delete.call(f.context);
		assert.equal(f.remote.size, 0);
	});
	it('rejects missing API keys and changed connection identities before remote writes', async () => {
		const f = fixture(4);
		f.context.getCredentials = (async () => ({ secret })) as IHookFunctions['getCredentials'];
		await assert.rejects(f.methods.create.call(f.context), /workspace API key/);
		assert.equal(f.requests.length, 0);
		const active = fixture(4);
		await active.methods.create.call(active.context);
		active.node.credentials!.famulorWebhookApi.id = 'different';
		await assert.rejects(active.methods.delete.call(active.context), /settings changed/);
		assert.equal(active.requests.filter((r) => r.method === 'DELETE').length, 0);
	});
	it('declares a read-only API key test with redirect following disabled', () => {
		const test = new FamulorWebhookApi().test;
		assert.equal(test.request.url, '/api/v1/me');
		assert.equal(test.request.method, 'GET');
		assert.equal(test.request.disableFollowRedirect, true);
	});
});
