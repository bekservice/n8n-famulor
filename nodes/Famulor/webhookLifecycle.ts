import { createHash } from 'node:crypto';
import { NodeOperationError } from 'n8n-workflow';
import type { IHookFunctions } from 'n8n-workflow';
import { request, safeBaseUrl } from './v3/client';

type Version = 2 | 3 | 4;
type Registration = { id: string; url: string; event: string; credential: string; baseUrl: string };

async function settings(context: IHookFunctions, version: Version) {
	const credentials = await context.getCredentials(
		version === 2 ? 'famulorApi' : 'famulorWebhookApi',
	);
	const secret = version === 2 ? context.getNodeParameter('webhookSecret', '') : credentials.secret;
	if (typeof secret !== 'string' || !secret)
		throw new NodeOperationError(context.getNode(), 'Enter the Famulor webhook signing secret.');
	const automatic =
		context.getNodeParameter('registrationMode', version === 4 ? 'automatic' : 'manual') ===
		'automatic';
	const event = version === 2 ? 'call.completed' : String(context.getNodeParameter('event', ''));
	const url = context.getNodeWebhookUrl('default');
	if (automatic && (!url || !url.startsWith('https://')))
		throw new NodeOperationError(
			context.getNode(),
			'Configure a public HTTPS webhook URL for this n8n instance.',
		);
	if (automatic && (secret.length < 16 || secret.length > 256))
		throw new NodeOperationError(
			context.getNode(),
			'Automatic registration requires a signing secret between 16 and 256 characters.',
		);
	if (automatic && (typeof credentials.apiKey !== 'string' || !credentials.apiKey))
		throw new NodeOperationError(
			context.getNode(),
			'Add a workspace API key to the webhook credentials for automatic registration.',
		);
	const credential = String(
		context.getNode().credentials?.[version === 2 ? 'famulorApi' : 'famulorWebhookApi']?.id ?? '',
	);
	const digest = createHash('sha256')
		.update(
			JSON.stringify([
				context.getWorkflow().id,
				context.getNode().id,
				url,
				event,
				credential,
				credentials.baseUrl,
				credentials.apiKey,
				secret,
			]),
		)
		.digest('hex');
	const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
	return { automatic, secret, event, url: url ?? '', id, credential, baseUrl: safeBaseUrl(context.getNode(), credentials.baseUrl as string | undefined) };
}

function matches(value: unknown, config: Registration): boolean {
	if (!value || typeof value !== 'object') return false;
	const row = value as Record<string, unknown>;
	return (
		row.id === config.id &&
		row.url === config.url &&
		row.is_active === true &&
		Array.isArray(row.events) &&
		row.events.length === 1 &&
		row.events[0] === config.event
	);
}

async function api(
	context: IHookFunctions,
	version: Version,
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	body?: unknown,
) {
	return request(context, {
		method,
		path,
		body,
		allowNotFound: method === 'GET',
		credentialType: version === 2 ? 'famulorApi' : 'famulorWebhookApi',
	});
}

export async function webhookExists(context: IHookFunctions, version: Version): Promise<boolean> {
	const config = await settings(context, version);
	// Saved receivers remain explicitly manual. No remote subscription belongs to this node in that mode.
	if (!config.automatic) return true;
	const state = context.getWorkflowStaticData('node');
	const saved = state.famulorSubscription as Registration | undefined;
	if (saved && saved.id !== config.id) return false;
	const detail = await api(context, version, 'GET', `/webhooks/${config.id}`);
	if (!matches((detail as { data?: unknown })?.data, config)) return false;
	state.famulorSubscription = {
		id: config.id,
		url: config.url,
		event: config.event,
		credential: config.credential,
		baseUrl: config.baseUrl,
	};
	return true;
}

export async function createWebhook(context: IHookFunctions, version: Version): Promise<boolean> {
	const config = await settings(context, version);
	if (!config.automatic)
		throw new NodeOperationError(
			context.getNode(),
			'Manual receivers must be configured in Famulor. Select automatic registration to manage a dedicated subscription.',
		);
	const saved = context.getWorkflowStaticData('node').famulorSubscription as Registration | undefined;
	if (saved && saved.id !== config.id) await deleteWebhook(context, version);
	// Preserve cleanup ownership even when the server commits but its response is lost.
	context.getWorkflowStaticData('node').famulorSubscription = {
		id: config.id, url: config.url, event: config.event,
		credential: config.credential, baseUrl: config.baseUrl,
	};
	const result = await api(context, version, 'POST', '/webhooks', {
		id: config.id,
		url: config.url,
		events: [config.event],
		secret: config.secret,
	});
	if (!matches((result as { data?: unknown })?.data, config))
		throw new NodeOperationError(
			context.getNode(),
			'Famulor did not confirm the expected webhook subscription.',
		);
	context.getWorkflowStaticData('node').famulorSubscription = {
		id: config.id,
		url: config.url,
		event: config.event,
		credential: config.credential,
		baseUrl: config.baseUrl,
	};
	return true;
}

export async function deleteWebhook(context: IHookFunctions, version: Version): Promise<boolean> {
	const state = context.getWorkflowStaticData('node');
	let saved = state.famulorSubscription as Registration | undefined;
	if (!saved) {
		const config = await settings(context, version);
		if (!config.automatic) return true;
		const detail = await api(context, version, 'GET', `/webhooks/${config.id}`);
		if (!matches((detail as { data?: unknown })?.data, config)) return true;
		saved = { id: config.id, url: config.url, event: config.event, credential: config.credential, baseUrl: config.baseUrl };
		state.famulorSubscription = saved;
	}
	const credentials = await context.getCredentials(version === 2 ? 'famulorApi' : 'famulorWebhookApi');
	const credential = String(context.getNode().credentials?.[version === 2 ? 'famulorApi' : 'famulorWebhookApi']?.id ?? '');
	const baseUrl = safeBaseUrl(context.getNode(), credentials.baseUrl as string | undefined);
	if (saved.credential !== credential || saved.baseUrl !== baseUrl)
		throw new NodeOperationError(
			context.getNode(),
			'Webhook connection settings changed before cleanup. Restore the original connection and Famulor origin to remove its subscription.',
		);
	await api(context, version, 'DELETE', `/webhooks/${saved.id}`);
	delete state.famulorSubscription;
	return true;
}
