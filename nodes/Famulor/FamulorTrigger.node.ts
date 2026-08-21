import type {
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { extractAssistantId, extractWebhookEvent } from './api';
import { loadAssistants } from './GenericFunctions';
import { SIGNATURE_HEADER, verifyWebhookSignature } from './webhookSignature';

function rejectUnauthorized(this: IWebhookFunctions, message: string): IWebhookResponseData {
	const response = this.getResponseObject();
	response.status(401).json({ error: message });
	return {
		noWebhookResponse: true,
	};
}

export class FamulorTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Famulor Trigger',
		name: 'famulorTrigger',
		icon: 'file:famulor.svg',
		group: ['trigger'],
		version: 2,
		subtitle: 'Call completed (signed workspace webhook)',
		description:
			'Starts the workflow when Famulor sends a signed call.completed workspace webhook. Do not use unsigned assistants.webhook_url.',
		defaults: {
			name: 'Famulor Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'famulorApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Create a workspace webhook in Famulor Settings → Webhooks for event <code>call.completed</code>. Paste this node Production URL. Verify with the workspace webhook secret (header X-Famulor-Signature). Unsigned assistant webhook_url is not the n8n trigger contract.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Webhook Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				required: true,
				default: '',
				description:
					'Workspace webhook secret from Famulor Settings → Webhooks. Used to verify X-Famulor-Signature as sha256=HMAC_SHA256(raw_body, secret).',
			},
			{
				displayName: 'Assistant Name or ID',
				name: 'assistantId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAssistants',
				},
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
		],
	};

	methods = {
		loadOptions: {
			getAssistants: loadAssistants,
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const webhookSecret = this.getNodeParameter('webhookSecret') as string;
		const assistantFilter = this.getNodeParameter('assistantId', '') as string;
		const request = this.getRequestObject() as {
			rawBody?: Buffer | string;
			headers?: Record<string, string | string[] | undefined>;
		};
		const headerData = this.getHeaderData();
		const signatureHeader =
			(typeof headerData[SIGNATURE_HEADER] === 'string' && headerData[SIGNATURE_HEADER]) ||
			(typeof headerData['X-Famulor-Signature'] === 'string' &&
				headerData['X-Famulor-Signature']) ||
			undefined;

		if (!webhookSecret) {
			return rejectUnauthorized.call(this, 'Famulor webhook secret is missing');
		}

		if (!request.rawBody) {
			return rejectUnauthorized.call(this, 'Famulor webhook raw body is missing');
		}

		const valid = verifyWebhookSignature({
			secret: webhookSecret,
			rawBody: request.rawBody,
			headerValue: signatureHeader,
		});

		if (!valid) {
			return rejectUnauthorized.call(this, 'Invalid X-Famulor-Signature');
		}

		const bodyData = this.getBodyData();
		const event = extractWebhookEvent(bodyData);
		if (event && event !== 'call.completed') {
			return {
				workflowData: [[]],
			};
		}

		if (assistantFilter) {
			const assistantId = extractAssistantId(bodyData);
			if (assistantId && assistantId !== assistantFilter) {
				return {
					workflowData: [[]],
				};
			}
		}

		return {
			workflowData: [
				[
					{
						json: bodyData,
					},
				],
			],
		};
	}
}
