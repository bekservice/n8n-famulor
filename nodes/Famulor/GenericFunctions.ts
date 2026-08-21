import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { buildApiUrl, extractListItems } from './api';

type FamulorRequestContext = IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions;

type FamulorRequestOptions = {
	method: IHttpRequestMethods;
	url: string;
	json: true;
	body?: IDataObject;
	qs?: IDataObject;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function makeRequestWithRetry(
	context: FamulorRequestContext,
	options: FamulorRequestOptions,
	maxRetries = 3,
	baseDelay = 1000,
): Promise<unknown> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await context.helpers.httpRequestWithAuthentication.call(
				context,
				'famulorApi',
				options,
			);
		} catch (error: unknown) {
			const err = error as { statusCode?: number; message?: string };
			const isRateLimit =
				err.statusCode === 429 || (typeof err.message === 'string' && err.message.includes('429'));

			if (isRateLimit && attempt < maxRetries) {
				let retryAfter = baseDelay;
				const retryMatch = err.message?.match(/"retry_after":(\d+)/);
				if (retryMatch) {
					retryAfter = parseInt(retryMatch[1], 10) * 1000;
				}
				const delay = Math.min(retryAfter * (attempt + 1), 10000);
				await sleep(delay);
				continue;
			}

			throw error;
		}
	}

	throw new Error('Famulor request failed after retries');
}

export async function famulorApiRequest(
	this: FamulorRequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<unknown> {
	const credentials = await this.getCredentials('famulorApi');
	const options: FamulorRequestOptions = {
		method,
		url: buildApiUrl(credentials.baseUrl as string | undefined, endpoint),
		json: true,
	};

	if (Object.keys(body).length > 0) {
		options.body = body;
	}
	if (Object.keys(qs).length > 0) {
		options.qs = qs;
	}

	return makeRequestWithRetry(this, options);
}

function asNamedRecords(items: unknown[]): Array<Record<string, unknown>> {
	return items.filter((item): item is Record<string, unknown> => {
		return typeof item === 'object' && item !== null && !Array.isArray(item);
	});
}

export async function loadAssistants(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const response = await famulorApiRequest.call(this, 'GET', '/assistants', {}, { limit: 200 });
		const assistants = asNamedRecords(extractListItems(response, ['data', 'items', 'assistants']));

		if (assistants.length === 0) {
			return [
				{
					name: 'No Assistants Found. Create One First.',
					value: '',
				},
			];
		}

		return assistants.map((assistant) => ({
			name: String(assistant.name ?? assistant.id ?? 'Unnamed assistant'),
			value: String(assistant.id ?? ''),
		}));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(this.getNode(), `Failed to load assistants: ${message}`);
	}
}

export async function loadPhoneNumbers(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	try {
		const response = await famulorApiRequest.call(
			this,
			'GET',
			'/phone-numbers',
			{},
			{ limit: 200 },
		);
		const phoneNumbers = asNamedRecords(
			extractListItems(response, ['data', 'items', 'phone_numbers']),
		);

		if (phoneNumbers.length === 0) {
			return [
				{
					name: 'No Phone Numbers Found. Purchase One First.',
					value: '',
				},
			];
		}

		return phoneNumbers.map((phoneNumber) => {
			const number = String(
				phoneNumber.phone_number ?? phoneNumber.number ?? phoneNumber.e164 ?? phoneNumber.id ?? '',
			);
			return {
				name: number,
				value: String(phoneNumber.id ?? ''),
			};
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(this.getNode(), `Failed to load phone numbers: ${message}`);
	}
}

export function toNodeError(
	context: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
	resource: string,
	operation: string,
): never {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		throw error;
	}
	const message = error instanceof Error ? error.message : String(error);
	throw new NodeOperationError(
		context.getNode(),
		`Failed to execute ${resource}:${operation}: ${message}`,
		{ itemIndex },
	);
}
