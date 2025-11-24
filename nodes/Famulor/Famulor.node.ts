import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
	sleep,
} from 'n8n-workflow';

// Helper function for retry logic with rate limiting
async function makeRequestWithRetry(
	context: IExecuteFunctions,
	options: any,
	maxRetries = 3,
	baseDelay = 1000
): Promise<any> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await context.helpers.httpRequestWithAuthentication.call(context, 'famulorApi', options);
		} catch (error: any) {
			// Check if this is a rate limit error (429)
			if (error.statusCode === 429 || (error.message && error.message.includes('429'))) {
				if (attempt < maxRetries) {
					// Extract retry_after from error message if available
					let retryAfter = baseDelay;
					const retryMatch = error.message.match(/"retry_after":(\d+)/);
					if (retryMatch) {
						retryAfter = parseInt(retryMatch[1]) * 1000; // Convert to milliseconds
					}

					// Wait before retrying with exponential backoff
					const delay = Math.min(retryAfter * (attempt + 1), 10000); // Max 10 seconds
					await sleep(delay);
					continue;
				}
			}
			// If not a rate limit error or max retries reached, throw the error
			throw error;
		}
	}
}

export class Famulor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Famulor',
		name: 'famulor',
		icon: 'file:famulor.svg',
		group: ['communication'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Make phone calls using AI assistants from Famulor platform',
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
					name: 'Call',
					value: 'call',
				},
				{
					name: 'Assistant',
					value: 'assistant',
				},
				{
					name: 'Campaign',
					value: 'campaign',
				},
			],
			default: 'call',
			},

			// Call Operations
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
						name: 'Make',
						value: 'make',
						description: 'Make a phone call using an AI assistant',
						action: 'Make a phone call',
					},
				],
				default: 'make',
			},

		// Assistant Operations
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
					name: 'Get Assistants',
					value: 'getAssistants',
					description: 'Get all assistants from your account',
					action: 'Get assistants',
				},
			],
			default: 'getAssistants',
		},

		// Campaign Operations
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
					name: 'List',
					value: 'list',
					description: 'List all campaigns',
					action: 'List all campaigns',
				},
				{
					name: 'Update Status',
					value: 'updateStatus',
					description: 'Start or stop a campaign',
					action: 'Update campaign status',
				},
			],
			default: 'list',
		},

			// Call Make Fields
			{
				displayName: 'Assistant Name or ID',
				name: 'assistant',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getOutboundAssistants',
				},
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Customer Phone Number',
				name: 'phoneNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				default: '',
				description: 'Enter the phone number of the customer',
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						resource: ['call'],
						operation: ['make'],
					},
				},
				default: {
					variables: [
						{
							name: 'Customer Name',
							value: 'John',
						},
					],
				},
				description: 'Variables to pass to the assistant',
				options: [
					{
						displayName: 'Variables',
						name: 'variables',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Variable name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Variable value',
							},
						],
					},
				],
			},

			// Campaign Update Status Fields
			{
				displayName: 'Campaign ID',
				name: 'campaignId',
				type: 'number',
				required: true,
				displayOptions: {
					show: {
						resource: ['campaign'],
						operation: ['updateStatus'],
					},
				},
				default: 0,
				description: 'The ID of the campaign to update',
			},
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['campaign'],
						operation: ['updateStatus'],
					},
				},
			options: [
				{
					name: 'Start',
					value: 'start',
					action: 'Start a campaign',
				},
				{
					name: 'Stop',
					value: 'stop',
					action: 'Stop a campaign',
				},
			],
			default: 'start',
			},
		],
	};

	methods = {
		loadOptions: {
			async getOutboundAssistants(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const options = {
					method: 'GET' as 'GET',
					url: 'https://app.famulor.de/api/user/assistants/outbound',
					json: true,
				};

				try {
					const response = await this.helpers.httpRequestWithAuthentication.call(this, 'famulorApi', options);

					if (!Array.isArray(response)) {
						throw new NodeOperationError(this.getNode(), 'Invalid response format');
					}

					if (response.length === 0) {
						return [
							{
								name: 'No Outbound Assistants Found. Create One First.',
								value: '',
							},
						];
					}

					return response.map((assistant: any) => ({
						name: assistant.name,
						value: assistant.id,
					}));
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load assistants: ${error.message}`);
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				if (resource === 'call') {
					if (operation === 'make') {
						const assistant = this.getNodeParameter('assistant', i) as string;
						const phoneNumber = this.getNodeParameter('phoneNumber', i) as string;
						const variablesCollection = this.getNodeParameter('variables', i) as { variables: Array<{ name: string; value: string }> };

					// Convert variables from collection format to object format expected by API
					const variables: { [key: string]: string } = {};
					if (variablesCollection.variables) {
						variablesCollection.variables.forEach(variable => {
							if (variable.name && variable.value) {
								variables[variable.name] = variable.value;
							}
						});
					}

					const options = {
						method: 'POST' as 'POST',
						url: 'https://app.famulor.de/api/user/make_call',
						body: {
							assistant_id: assistant,
							phone_number: phoneNumber,
							variables: variables,
						},
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);
					returnData.push({ 
						json: response,
						pairedItem: { item: i }
					});

					} else {
						throw new NodeOperationError(
							this.getNode(),
							`The operation "${operation}" is not known!`,
							{ itemIndex: i },
						);
					}
			} else if (resource === 'assistant') {
				if (operation === 'getAssistants') {
					const options = {
						method: 'GET' as 'GET',
						url: 'https://app.famulor.de/api/user/assistants',
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);

					if (!Array.isArray(response)) {
						throw new NodeOperationError(this.getNode(), 'Invalid response format', { itemIndex: i });
					}

					// Return each assistant as a separate item
					response.forEach((assistant: any) => {
						returnData.push({ 
							json: assistant,
							pairedItem: { item: i }
						});
					});

				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not known!`,
						{ itemIndex: i },
					);
				}
			} else if (resource === 'campaign') {
				if (operation === 'list') {
					const options = {
						method: 'GET' as 'GET',
						url: 'https://app.famulor.de/api/user/campaigns',
						json: true,
					};

				const response = await makeRequestWithRetry(this, options);

				// Handle both array response and object with campaigns property
				let campaigns = response;
				if (response.campaigns && Array.isArray(response.campaigns)) {
					campaigns = response.campaigns;
				}

				if (!Array.isArray(campaigns)) {
					throw new NodeOperationError(this.getNode(), 'Invalid response format', { itemIndex: i });
				}

				// Return each campaign as a separate item
				campaigns.forEach((campaign: any) => {
					returnData.push({ 
						json: campaign,
						pairedItem: { item: i }
					});
				});

				} else if (operation === 'updateStatus') {
					const campaignId = this.getNodeParameter('campaignId', i) as number;
					const action = this.getNodeParameter('action', i) as string;

					const options = {
						method: 'POST' as 'POST',
						url: 'https://app.famulor.de/api/user/campaigns/update-status',
						body: {
							campaign_id: campaignId,
							action: action,
						},
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);
					returnData.push({ 
						json: response,
						pairedItem: { item: i }
					});

				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not known!`,
						{ itemIndex: i },
					);
				}
			} else {
				throw new NodeOperationError(this.getNode(), `The resource "${resource}" is not known!`, {
					itemIndex: i,
				});
			}

		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ 
					json: { error: error.message },
					pairedItem: { item: i }
				});
				continue;
			}
				throw new NodeOperationError(this.getNode(), `Failed to execute ${resource}:${operation}: ${error.message}`, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
