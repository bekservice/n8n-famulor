import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { buildMakeCallBody, extractListItems, isE164, parseLead, unwrapResource } from './api';
import {
	famulorApiRequest,
	loadAssistants,
	loadPhoneNumbers,
	toNodeError,
} from './GenericFunctions';

type Resource = 'assistant' | 'call' | 'campaign';
type CallOperation = 'get' | 'getAll' | 'make';
type AssistantOperation = 'create' | 'get' | 'getAll';
type CampaignOperation = 'create' | 'getAll';

function asJson(data: unknown): IDataObject {
	return data as IDataObject;
}

export class Famulor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Famulor',
		name: 'famulor',
		icon: 'file:famulor.svg',
		group: ['communication'],
		version: 2,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Automate Famulor Platform 2.0 AI phone calls via API v1',
		defaults: {
			name: 'Famulor',
		},
		usableAsTool: true,
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'famulorApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Assistant',
						value: 'assistant',
					},
					{
						name: 'Call',
						value: 'call',
					},
					{
						name: 'Campaign',
						value: 'campaign',
					},
				],
				default: 'call',
			},

			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['call'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a call by UUID, including transcript and analysis',
						action: 'Get a call',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List calls with optional filters',
						action: 'Get many calls',
					},
					{
						name: 'Make',
						value: 'make',
						description: 'Start an outbound call with an AI assistant',
						action: 'Make a phone call',
					},
				],
				default: 'make',
			},

			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['assistant'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create an AI phone assistant',
						action: 'Create an assistant',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a single assistant by UUID',
						action: 'Get an assistant',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List assistants in the workspace',
						action: 'Get many assistants',
					},
				],
				default: 'getAll',
			},

			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['campaign'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create an outreach campaign',
						action: 'Create a campaign',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List campaigns in the workspace',
						action: 'Get many campaigns',
					},
				],
				default: 'getAll',
			},

			{
				displayName: 'Assistant Name or ID',
				name: 'assistantId',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getAssistants',
				},
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'To Number',
				name: 'toNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				default: '',
				placeholder: '+4930123456',
				description: 'Destination phone number in E.164 format, for example +4930123456',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				options: [
					{
						displayName: 'Lead',
						name: 'lead',
						type: 'json',
						default: '{}',
						description:
							'Optional lead object available to the assistant during the call, for example {"name":"Jane Doe"}. Do not send Classic 1.0 variables, from_number, or lead_id.',
					},
					{
						displayName: 'Phone Number Name or ID',
						name: 'phoneNumberId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getPhoneNumbers',
						},
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
				],
			},

			{
				displayName: 'Call ID',
				name: 'callId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['get'],
					},
				},
				default: '',
				placeholder: '11111111-1111-4111-8111-111111111111',
				description: 'Call UUID returned by Make or Get Many',
			},

			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['getAll'],
					},
				},
				options: [
					{
						displayName: 'Assistant ID',
						name: 'assistant_id',
						type: 'string',
						default: '',
						description: 'Return only calls for this assistant UUID',
					},
					{
						displayName: 'Campaign ID',
						name: 'campaign_id',
						type: 'string',
						default: '',
						description: 'Return only calls for this campaign UUID',
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						options: [
							{
								name: 'Inbound',
								value: 'inbound',
							},
							{
								name: 'Outbound',
								value: 'outbound',
							},
							{
								name: 'Web',
								value: 'web',
							},
						],
						default: 'outbound',
						description: 'Return only calls with this direction',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'string',
						default: '',
						placeholder: '2026-01-01T00:00:00Z',
						description: 'Return only calls created at or after this ISO-8601 timestamp',
					},
					{
						displayName: 'Limit',
						name: 'pageLimit',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: 50,
						description: 'Maximum number of calls to return (1-200)',
					},
					{
						displayName: 'Offset',
						name: 'offset',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description: 'Number of calls to skip',
					},
					{
						displayName: 'Search',
						name: 'q',
						type: 'string',
						default: '',
						description: 'Lexical search against call transcript and summary',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{
								name: 'Busy',
								value: 'busy',
							},
							{
								name: 'Completed',
								value: 'completed',
							},
							{
								name: 'Failed',
								value: 'failed',
							},
							{
								name: 'In Progress',
								value: 'in_progress',
							},
							{
								name: 'No Answer',
								value: 'no_answer',
							},
							{
								name: 'Queued',
								value: 'queued',
							},
							{
								name: 'Ringing',
								value: 'ringing',
							},
						],
						default: 'completed',
						description: 'Return only calls with this status',
					},
					{
						displayName: 'To',
						name: 'to',
						type: 'string',
						default: '',
						placeholder: '2026-12-31T23:59:59Z',
						description: 'Return only calls created at or before this ISO-8601 timestamp',
					},
				],
			},

			{
				displayName: 'Name',
				name: 'assistantName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['assistant'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Display name of the assistant',
			},
			{
				displayName: 'Additional Fields',
				name: 'assistantAdditionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['assistant'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'First Message',
						name: 'first_message',
						type: 'string',
						default: '',
						description: 'Opening line the assistant speaks when the call starts',
					},
					{
						displayName: 'System Prompt',
						name: 'system_prompt',
						type: 'string',
						typeOptions: {
							rows: 4,
						},
						default: '',
						description: 'System prompt that defines role, tone, and behavior',
					},
				],
			},

			{
				displayName: 'Assistant ID',
				name: 'getAssistantId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['assistant'],
						operation: ['get'],
					},
				},
				default: '',
				placeholder: '22222222-2222-4222-8222-222222222222',
				description: 'Assistant UUID',
			},

			{
				displayName: 'Return All',
				name: 'returnAllAssistants',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['assistant'],
						operation: ['getAll'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'assistantLimit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['assistant'],
						operation: ['getAll'],
						returnAllAssistants: [false],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 200,
				},
				default: 50,
				description: 'Max number of results to return',
			},

			{
				displayName: 'Name',
				name: 'campaignName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['campaign'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Display name of the campaign',
			},
			{
				displayName: 'Additional Fields',
				name: 'campaignAdditionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['campaign'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Assistant Name or ID',
						name: 'assistant_id',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getAssistants',
						},
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
				],
			},

			{
				displayName: 'Filters',
				name: 'campaignFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['campaign'],
						operation: ['getAll'],
					},
				},
				options: [
					{
						displayName: 'Limit',
						name: 'pageLimit',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: 50,
						description: 'Maximum number of campaigns to return (1-200)',
					},
					{
						displayName: 'Offset',
						name: 'offset',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description: 'Number of campaigns to skip',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{
								name: 'Archived',
								value: 'archived',
							},
							{
								name: 'Completed',
								value: 'completed',
							},
							{
								name: 'Draft',
								value: 'draft',
							},
							{
								name: 'Paused',
								value: 'paused',
							},
							{
								name: 'Running',
								value: 'running',
							},
							{
								name: 'Scheduled',
								value: 'scheduled',
							},
						],
						default: 'draft',
						description: 'Return only campaigns with this status',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getAssistants: loadAssistants,
			getPhoneNumbers: loadPhoneNumbers,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as Resource;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				if (resource === 'call') {
					await executeCall.call(this, operation as CallOperation, i, returnData);
				} else if (resource === 'assistant') {
					await executeAssistant.call(this, operation as AssistantOperation, i, returnData);
				} else if (resource === 'campaign') {
					await executeCampaign.call(this, operation as CampaignOperation, i, returnData);
				} else {
					const _exhaustive: never = resource;
					throw new NodeOperationError(
						this.getNode(),
						`The resource "${_exhaustive}" is not known!`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: i },
					});
					continue;
				}
				toNodeError(this, error, i, resource, operation);
			}
		}

		return [returnData];
	}
}

async function executeCall(
	this: IExecuteFunctions,
	operation: CallOperation,
	itemIndex: number,
	returnData: INodeExecutionData[],
): Promise<void> {
	switch (operation) {
		case 'make': {
			const assistantId = this.getNodeParameter('assistantId', itemIndex) as string;
			const toNumber = this.getNodeParameter('toNumber', itemIndex) as string;
			const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
				phoneNumberId?: string;
				lead?: unknown;
			};

			if (!assistantId) {
				throw new NodeOperationError(this.getNode(), 'Assistant ID is required', { itemIndex });
			}
			if (!isE164(toNumber)) {
				throw new NodeOperationError(
					this.getNode(),
					'To Number must be E.164, for example +4930123456',
					{ itemIndex },
				);
			}

			const body = buildMakeCallBody({
				assistantId,
				toNumber,
				phoneNumberId: additionalFields.phoneNumberId || undefined,
				lead: parseLead(additionalFields.lead),
			});

			const response = await famulorApiRequest.call(this, 'POST', '/calls', body as IDataObject);
			returnData.push({
				json: asJson(unwrapResource(response)),
				pairedItem: { item: itemIndex },
			});
			return;
		}
		case 'get': {
			const callId = this.getNodeParameter('callId', itemIndex) as string;
			const response = await famulorApiRequest.call(this, 'GET', `/calls/${callId}`);
			returnData.push({
				json: asJson(unwrapResource(response)),
				pairedItem: { item: itemIndex },
			});
			return;
		}
		case 'getAll': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const qs: IDataObject = {};
			for (const [key, value] of Object.entries(filters)) {
				if (value === undefined || value === '' || value === null) {
					continue;
				}
				qs[key === 'pageLimit' ? 'limit' : key] = value;
			}
			const response = await famulorApiRequest.call(this, 'GET', '/calls', {}, qs);
			const calls = extractListItems(response, ['data', 'items', 'calls']);
			for (const call of calls) {
				returnData.push({
					json: asJson(unwrapResource(call)),
					pairedItem: { item: itemIndex },
				});
			}
			return;
		}
		default: {
			const _exhaustive: never = operation;
			throw new NodeOperationError(this.getNode(), `The operation "${_exhaustive}" is not known!`, {
				itemIndex,
			});
		}
	}
}

async function executeAssistant(
	this: IExecuteFunctions,
	operation: AssistantOperation,
	itemIndex: number,
	returnData: INodeExecutionData[],
): Promise<void> {
	switch (operation) {
		case 'create': {
			const name = this.getNodeParameter('assistantName', itemIndex) as string;
			const additionalFields = this.getNodeParameter(
				'assistantAdditionalFields',
				itemIndex,
				{},
			) as IDataObject;
			const body: IDataObject = { name };
			if (additionalFields.system_prompt) {
				body.system_prompt = additionalFields.system_prompt;
			}
			if (additionalFields.first_message) {
				body.first_message = additionalFields.first_message;
			}
			const response = await famulorApiRequest.call(this, 'POST', '/assistants', body);
			returnData.push({
				json: asJson(unwrapResource(response)),
				pairedItem: { item: itemIndex },
			});
			return;
		}
		case 'get': {
			const assistantId = this.getNodeParameter('getAssistantId', itemIndex) as string;
			const response = await famulorApiRequest.call(this, 'GET', `/assistants/${assistantId}`);
			returnData.push({
				json: asJson(unwrapResource(response)),
				pairedItem: { item: itemIndex },
			});
			return;
		}
		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAllAssistants', itemIndex) as boolean;
			const qs: IDataObject = {};
			if (!returnAll) {
				qs.limit = this.getNodeParameter('assistantLimit', itemIndex) as number;
			} else {
				qs.limit = 200;
			}
			const response = await famulorApiRequest.call(this, 'GET', '/assistants', {}, qs);
			const assistants = extractListItems(response, ['data', 'items', 'assistants']);
			for (const assistant of assistants) {
				returnData.push({
					json: asJson(unwrapResource(assistant)),
					pairedItem: { item: itemIndex },
				});
			}
			return;
		}
		default: {
			const _exhaustive: never = operation;
			throw new NodeOperationError(this.getNode(), `The operation "${_exhaustive}" is not known!`, {
				itemIndex,
			});
		}
	}
}

async function executeCampaign(
	this: IExecuteFunctions,
	operation: CampaignOperation,
	itemIndex: number,
	returnData: INodeExecutionData[],
): Promise<void> {
	switch (operation) {
		case 'create': {
			const name = this.getNodeParameter('campaignName', itemIndex) as string;
			const additionalFields = this.getNodeParameter(
				'campaignAdditionalFields',
				itemIndex,
				{},
			) as IDataObject;
			const body: IDataObject = { name };
			if (additionalFields.assistant_id) {
				body.assistant_id = additionalFields.assistant_id;
			}
			const response = await famulorApiRequest.call(this, 'POST', '/campaigns', body);
			returnData.push({
				json: asJson(unwrapResource(response)),
				pairedItem: { item: itemIndex },
			});
			return;
		}
		case 'getAll': {
			const filters = this.getNodeParameter('campaignFilters', itemIndex, {}) as IDataObject;
			const qs: IDataObject = {};
			for (const [key, value] of Object.entries(filters)) {
				if (value === undefined || value === '' || value === null) {
					continue;
				}
				qs[key === 'pageLimit' ? 'limit' : key] = value;
			}
			const response = await famulorApiRequest.call(this, 'GET', '/campaigns', {}, qs);
			const campaigns = extractListItems(response, ['data', 'items', 'campaigns']);
			for (const campaign of campaigns) {
				returnData.push({
					json: asJson(unwrapResource(campaign)),
					pairedItem: { item: itemIndex },
				});
			}
			return;
		}
		default: {
			const _exhaustive: never = operation;
			throw new NodeOperationError(this.getNode(), `The operation "${_exhaustive}" is not known!`, {
				itemIndex,
			});
		}
	}
}
