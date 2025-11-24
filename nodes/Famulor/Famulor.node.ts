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
			{
				name: 'Lead',
				value: 'lead',
			},
			{
				name: 'SMS',
				value: 'sms',
			},
			{
				name: 'Tool',
				value: 'tool',
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
					name: 'Delete',
					value: 'delete',
					description: 'Delete a specific call record',
					action: 'Delete a call',
				},
				{
					name: 'Get',
					value: 'get',
					description: 'Get details of a specific call by ID',
					action: 'Get a call',
				},
				{
					name: 'List',
					value: 'list',
					description: 'List all calls with filtering options',
					action: 'List all calls',
				},
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
			{
				name: 'Get Languages',
				value: 'getLanguages',
				description: 'Get all available languages for assistant configuration',
				action: 'Get languages',
			},
			{
				name: 'Get Models',
				value: 'getModels',
				description: 'Get all available LLM models for assistant configuration',
				action: 'Get models',
			},
			{
				name: 'Get Phone Numbers',
				value: 'getPhoneNumbers',
				description: 'Get available phone numbers for assistant assignment',
				action: 'Get phone numbers',
			},
			{
				name: 'Get Voices',
				value: 'getVoices',
				description: 'Get all available voices for assistant configuration',
				action: 'Get voices',
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

	// Lead Operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['lead'],
			},
		},
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a lead',
				action: 'Delete a lead',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List all leads',
				action: 'List all leads',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing lead',
				action: 'Update a lead',
			},
		],
		default: 'list',
	},

	// Lead Delete/Update Fields
	{
		displayName: 'Lead ID',
		name: 'leadId',
		type: 'number',
		required: true,
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['delete', 'update'],
			},
		},
		default: 0,
		description: 'The ID of the lead to delete or update',
	},

	// Lead Update Fields
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Campaign ID',
				name: 'campaign_id',
				type: 'number',
				default: 0,
				description: 'The ID of the campaign to assign the lead to',
			},
			{
				displayName: 'Phone Number',
				name: 'phone_number',
				type: 'string',
				default: '',
				placeholder: '+1234567890',
				description: 'The phone number of the lead (will be formatted to E164)',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Created', value: 'created' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Reached Max Retries', value: 'reached-max-retries' },
				],
				default: 'created',
				description: 'The status of the lead',
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Variables to merge with existing lead variables',
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
		],
	},

	// SMS Operations
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: {
				show: {
					resource: ['sms'],
				},
			},
			options: [
				{
					name: 'Send',
					value: 'send',
					description: 'Send an SMS message',
					action: 'Send an SMS',
				},
			],
		default: 'send',
	},

	// Tool Operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['tool'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new mid call tool',
				action: 'Create a tool',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a mid call tool',
				action: 'Delete a tool',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a specific mid call tool by ID',
				action: 'Get a tool',
			},
			{
				name: 'List',
				value: 'list',
				description: 'List all mid call tools',
				action: 'List all tools',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing mid call tool',
				action: 'Update a tool',
			},
		],
		default: 'list',
	},

	// Tool Get/Delete/Update Fields
	{
		displayName: 'Tool ID',
		name: 'toolId',
		type: 'number',
		required: true,
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['get', 'delete', 'update'],
			},
		},
		default: 0,
		description: 'The ID of the tool to retrieve, delete or update',
	},

	// Tool Create Fields
	{
		displayName: 'Name',
		name: 'toolName',
		type: 'string',
		required: true,
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		default: '',
		placeholder: 'get_weather',
		description: 'Tool name (lowercase letters and underscores only, must start with letter)',
	},
	{
		displayName: 'Description',
		name: 'toolDescription',
		type: 'string',
		required: true,
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		typeOptions: {
			rows: 3,
		},
		default: '',
		description: 'Detailed explanation of when and how the AI should use this tool (max 255 characters)',
	},
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		default: '',
		placeholder: 'https://api.example.com/endpoint',
		description: 'Valid URL of the API endpoint to call',
	},
	{
		displayName: 'Method',
		name: 'method',
		type: 'options',
		required: true,
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		options: [
			{ name: 'DELETE', value: 'DELETE' },
			{ name: 'GET', value: 'GET' },
			{ name: 'PATCH', value: 'PATCH' },
			{ name: 'POST', value: 'POST' },
			{ name: 'PUT', value: 'PUT' },
		],
		default: 'GET',
		description: 'HTTP method',
	},
	{
		displayName: 'Timeout',
		name: 'timeout',
		type: 'number',
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		default: 10,
		description: 'Request timeout in seconds (1-30)',
		typeOptions: {
			minValue: 1,
			maxValue: 30,
		},
	},
	{
		displayName: 'Headers',
		name: 'headers',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		default: {},
		description: 'HTTP headers to send with the request',
		options: [
			{
				displayName: 'Headers',
				name: 'headers',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Header name',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Header value',
					},
				],
			},
		],
	},
	{
		displayName: 'Schema',
		name: 'schema',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['create'],
			},
		},
		default: {},
		description: 'Parameters that the AI will extract from conversation',
		options: [
			{
				displayName: 'Parameters',
				name: 'parameters',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Parameter name (2-32 chars, letters and underscores)',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Number', value: 'number' },
							{ name: 'String', value: 'string' },
						],
						default: 'string',
						description: 'Parameter type',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Help AI understand how to extract this parameter (3-255 chars)',
					},
				],
			},
		],
	},

	// Tool Update Fields
	{
		displayName: 'Update Fields',
		name: 'updateToolFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['tool'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				placeholder: 'get_weather',
				description: 'Tool name (lowercase letters and underscores only)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'Tool description (max 255 characters)',
			},
			{
				displayName: 'Endpoint',
				name: 'endpoint',
				type: 'string',
				default: '',
				placeholder: 'https://api.example.com/endpoint',
				description: 'API endpoint URL',
			},
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				description: 'HTTP method',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				default: 10,
				description: 'Request timeout in seconds (1-30)',
				typeOptions: {
					minValue: 1,
					maxValue: 30,
				},
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'HTTP headers (replaces existing)',
				options: [
					{
						displayName: 'Headers',
						name: 'headers',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Header name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Header value',
							},
						],
					},
				],
			},
			{
				displayName: 'Schema',
				name: 'schema',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Parameters schema (replaces existing)',
				options: [
					{
						displayName: 'Parameters',
						name: 'parameters',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Parameter name',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{ name: 'Boolean', value: 'boolean' },
									{ name: 'Number', value: 'number' },
									{ name: 'String', value: 'string' },
								],
								default: 'string',
								description: 'Parameter type',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
								description: 'Parameter description',
							},
						],
					},
				],
			},
		],
	},

	// Call Get/Delete Fields
		{
			displayName: 'Call ID',
			name: 'callId',
			type: 'number',
			required: true,
			displayOptions: {
				show: {
					resource: ['call'],
					operation: ['get', 'delete'],
				},
			},
			default: 0,
			description: 'The ID of the call to retrieve or delete',
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

	// Assistant Get Phone Numbers Fields
	{
		displayName: 'Type Filter',
		name: 'phoneNumberType',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['assistant'],
				operation: ['getPhoneNumbers'],
			},
		},
		options: [
			{
				name: 'All',
				value: '',
			},
			{
				name: 'Inbound',
				value: 'inbound',
			},
			{
				name: 'Outbound',
				value: 'outbound',
			},
		],
		default: '',
		description: 'Filter phone numbers by assistant type',
	},

	// Assistant Get Voices Fields
	{
		displayName: 'Mode Filter',
		name: 'voiceMode',
		type: 'options',
		displayOptions: {
			show: {
				resource: ['assistant'],
				operation: ['getVoices'],
			},
		},
		options: [
			{
				name: 'All',
				value: '',
			},
			{
				name: 'Multimodal',
				value: 'multimodal',
			},
			{
				name: 'Pipeline',
				value: 'pipeline',
			},
		],
		default: '',
		description: 'Filter voices by assistant mode',
	},

		// Call List Fields (Filters)
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'collection',
			placeholder: 'Add Filter',
			default: {},
			displayOptions: {
				show: {
					resource: ['call'],
					operation: ['list'],
				},
			},
		options: [
			{
				displayName: 'Assistant ID',
				name: 'assistant_id',
				type: 'number',
				default: 0,
				description: 'Filter calls by assistant ID',
			},
			{
				displayName: 'Campaign ID',
				name: 'campaign_id',
				type: 'number',
				default: 0,
				description: 'Filter calls by campaign ID',
			},
			{
				displayName: 'Date From',
				name: 'date_from',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description: 'Filter calls from this date',
			},
			{
				displayName: 'Date To',
				name: 'date_to',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description: 'Filter calls until this date',
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				default: 1,
				description: 'Page number',
				typeOptions: {
					minValue: 1,
				},
			},
			{
				displayName: 'Per Page',
				name: 'per_page',
				type: 'number',
				default: 15,
				description: 'Number of calls per page (1-100)',
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
			},
			{
				displayName: 'Phone Number',
				name: 'phone_number',
				type: 'string',
				default: '',
				description: 'Filter calls by client phone number',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Busy', value: 'busy' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Ended', value: 'ended' },
					{ name: 'Ended by Assistant', value: 'ended_by_assistant' },
					{ name: 'Ended by Customer', value: 'ended_by_customer' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'In Progress', value: 'in-progress' },
					{ name: 'Initiated', value: 'initiated' },
					{ name: 'No Answer', value: 'no-answer' },
					{ name: 'Ringing', value: 'ringing' },
				],
				default: 'initiated',
				description: 'Filter calls by status',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Inbound', value: 'inbound' },
					{ name: 'Outbound', value: 'outbound' },
					{ name: 'Web', value: 'web' },
				],
				default: 'inbound',
				description: 'Filter calls by type',
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

	// SMS Send Fields
	{
		displayName: 'From Phone Number Name or ID',
		name: 'fromPhoneNumberId',
		type: 'options',
		required: true,
		displayOptions: {
			show: {
				resource: ['sms'],
				operation: ['send'],
			},
		},
		typeOptions: {
			loadOptionsMethod: 'getPhoneNumbers',
		},
		default: '',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
		{
			displayName: 'To Phone Number',
			name: 'toPhoneNumber',
			type: 'string',
			required: true,
			displayOptions: {
				show: {
					resource: ['sms'],
					operation: ['send'],
				},
			},
			default: '',
			placeholder: '+1234567890',
			description: 'The recipient\'s phone number in international format',
		},
		{
			displayName: 'Message Body',
			name: 'messageBody',
			type: 'string',
			required: true,
			displayOptions: {
				show: {
					resource: ['sms'],
					operation: ['send'],
				},
			},
			typeOptions: {
				rows: 4,
			},
			default: '',
			description: 'The SMS message content (max 300 characters)',
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
		async getPhoneNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
			const options = {
				method: 'GET' as 'GET',
				url: 'https://app.famulor.de/api/user/assistants/phone-numbers',
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
							name: 'No Phone Numbers Found. Purchase One First.',
							value: '',
						},
					];
				}

				return response.map((phoneNumber: any) => ({
					name: `${phoneNumber.phone_number} (${phoneNumber.type_label})`,
					value: phoneNumber.id,
				}));
			} catch (error) {
				throw new NodeOperationError(this.getNode(), `Failed to load phone numbers: ${error.message}`);
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
					if (operation === 'delete') {
						const callId = this.getNodeParameter('callId', i) as number;

						const options = {
							method: 'DELETE' as 'DELETE',
							url: `https://app.famulor.de/api/user/calls/${callId}`,
							json: true,
						};

						const response = await makeRequestWithRetry(this, options);
						returnData.push({ 
							json: response,
							pairedItem: { item: i }
						});

					} else if (operation === 'get') {
						const callId = this.getNodeParameter('callId', i) as number;

						const options = {
							method: 'GET' as 'GET',
							url: `https://app.famulor.de/api/user/calls/${callId}`,
							json: true,
						};

						const response = await makeRequestWithRetry(this, options);
						returnData.push({ 
							json: response,
							pairedItem: { item: i }
						});

					} else if (operation === 'make') {
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

				} else if (operation === 'list') {
					const filters = this.getNodeParameter('filters', i, {}) as {
						status?: string;
						type?: string;
						phone_number?: string;
						assistant_id?: number;
						campaign_id?: number;
						date_from?: string;
						date_to?: string;
						per_page?: number;
						page?: number;
					};

				// Build query parameters
				const queryParams: string[] = [];
				Object.entries(filters).forEach(([key, value]) => {
					if (value !== undefined && value !== '' && value !== 0) {
						queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
					}
				});

				const queryString = queryParams.length > 0 
					? '?' + queryParams.join('&')
					: '';

					const options = {
						method: 'GET' as 'GET',
						url: `https://app.famulor.de/api/user/calls${queryString}`,
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);

					if (!response.data || !Array.isArray(response.data)) {
						throw new NodeOperationError(this.getNode(), 'Invalid response format - expected data array', { itemIndex: i });
					}

					// Return each call as a separate item
					response.data.forEach((call: any) => {
						returnData.push({ 
							json: call,
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

			} else if (operation === 'getLanguages') {
				const options = {
					method: 'GET' as 'GET',
					url: 'https://app.famulor.de/api/user/assistants/languages',
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);

				if (!Array.isArray(response)) {
					throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
				}

				// Return each language as a separate item
				response.forEach((language: any) => {
					returnData.push({ 
						json: language,
						pairedItem: { item: i }
				});
			});

			} else if (operation === 'getModels') {
				const options = {
					method: 'GET' as 'GET',
					url: 'https://app.famulor.de/api/user/assistants/models',
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);

				if (!Array.isArray(response)) {
					throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
				}

				// Return each model as a separate item
				response.forEach((model: any) => {
					returnData.push({ 
						json: model,
						pairedItem: { item: i }
					});
				});

			} else if (operation === 'getPhoneNumbers') {
					const phoneNumberType = this.getNodeParameter('phoneNumberType', i, '') as string;

					const queryString = phoneNumberType ? `?type=${encodeURIComponent(phoneNumberType)}` : '';

					const options = {
						method: 'GET' as 'GET',
						url: `https://app.famulor.de/api/user/assistants/phone-numbers${queryString}`,
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);

					if (!Array.isArray(response)) {
						throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
					}

					// Return each phone number as a separate item
					response.forEach((phoneNumber: any) => {
						returnData.push({ 
							json: phoneNumber,
							pairedItem: { item: i }
					});
				});

			} else if (operation === 'getVoices') {
				const voiceMode = this.getNodeParameter('voiceMode', i, '') as string;

				const queryString = voiceMode ? `?mode=${encodeURIComponent(voiceMode)}` : '';

				const options = {
					method: 'GET' as 'GET',
					url: `https://app.famulor.de/api/user/assistants/voices${queryString}`,
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);

				if (!Array.isArray(response)) {
					throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
				}

				// Return each voice as a separate item
				response.forEach((voice: any) => {
					returnData.push({ 
						json: voice,
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
		} else if (resource === 'lead') {
			if (operation === 'delete') {
				const leadId = this.getNodeParameter('leadId', i) as number;

				const options = {
					method: 'DELETE' as 'DELETE',
					url: `https://app.famulor.de/api/user/leads/${leadId}`,
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);
				returnData.push({ 
					json: response,
					pairedItem: { item: i }
				});

			} else if (operation === 'list') {
				const options = {
					method: 'GET' as 'GET',
					url: 'https://app.famulor.de/api/user/leads',
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);

				// Handle both direct array response and object with leads property
				let leads = response;
				if (response.leads && Array.isArray(response.leads)) {
					leads = response.leads;
				}

				if (!Array.isArray(leads)) {
					throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
				}

				// Return each lead as a separate item
				leads.forEach((lead: any) => {
					returnData.push({ 
						json: lead,
						pairedItem: { item: i }
					});
				});

			} else if (operation === 'update') {
				const leadId = this.getNodeParameter('leadId', i) as number;
				const updateFields = this.getNodeParameter('updateFields', i, {}) as {
					campaign_id?: number;
					phone_number?: string;
					status?: string;
					variables?: { variables: Array<{ name: string; value: string }> };
				};

				// Build the update body
				const body: any = {};

				if (updateFields.campaign_id !== undefined && updateFields.campaign_id !== 0) {
					body.campaign_id = updateFields.campaign_id;
				}

				if (updateFields.phone_number) {
					body.phone_number = updateFields.phone_number;
				}

				if (updateFields.status) {
					body.status = updateFields.status;
				}

				if (updateFields.variables && updateFields.variables.variables) {
					const variables: { [key: string]: string } = {};
					updateFields.variables.variables.forEach(variable => {
						if (variable.name && variable.value) {
							variables[variable.name] = variable.value;
						}
					});
					body.variables = variables;
				}

				const options = {
					method: 'PUT' as 'PUT',
					url: `https://app.famulor.de/api/user/leads/${leadId}`,
					body: body,
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
		} else if (resource === 'sms') {
				if (operation === 'send') {
					const fromPhoneNumberId = this.getNodeParameter('fromPhoneNumberId', i) as number;
					const toPhoneNumber = this.getNodeParameter('toPhoneNumber', i) as string;
					const messageBody = this.getNodeParameter('messageBody', i) as string;

					const options = {
						method: 'POST' as 'POST',
						url: 'https://app.famulor.de/api/user/sms',
						body: {
							from: fromPhoneNumberId,
							to: toPhoneNumber,
							body: messageBody,
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
		} else if (resource === 'tool') {
			if (operation === 'create') {
				const toolName = this.getNodeParameter('toolName', i) as string;
				const toolDescription = this.getNodeParameter('toolDescription', i) as string;
				const endpoint = this.getNodeParameter('endpoint', i) as string;
				const method = this.getNodeParameter('method', i) as string;
				const timeout = this.getNodeParameter('timeout', i, 10) as number;
				const headersCollection = this.getNodeParameter('headers', i, {}) as { headers?: Array<{ name: string; value: string }> };
				const schemaCollection = this.getNodeParameter('schema', i, {}) as { parameters?: Array<{ name: string; type: string; description: string }> };

				// Build headers array
				const headers: Array<{ name: string; value: string }> = [];
				if (headersCollection.headers) {
					headersCollection.headers.forEach(header => {
						if (header.name && header.value) {
							headers.push({ name: header.name, value: header.value });
						}
					});
				}

				// Build schema array
				const schema: Array<{ name: string; type: string; description: string }> = [];
				if (schemaCollection.parameters) {
					schemaCollection.parameters.forEach(param => {
						if (param.name && param.type && param.description) {
							schema.push({ 
								name: param.name, 
								type: param.type, 
								description: param.description 
							});
						}
					});
				}

				const options = {
					method: 'POST' as 'POST',
					url: 'https://app.famulor.de/api/user/tools',
					body: {
						name: toolName,
						description: toolDescription,
						endpoint: endpoint,
						method: method,
						timeout: timeout,
						headers: headers,
						schema: schema,
					},
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);
				returnData.push({ 
					json: response,
					pairedItem: { item: i }
				});

			} else if (operation === 'delete') {
				const toolId = this.getNodeParameter('toolId', i) as number;

				const options = {
					method: 'DELETE' as 'DELETE',
					url: `https://app.famulor.de/api/user/tools/${toolId}`,
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);
				returnData.push({ 
					json: response,
					pairedItem: { item: i }
				});

			} else if (operation === 'get') {
				const toolId = this.getNodeParameter('toolId', i) as number;

				const options = {
					method: 'GET' as 'GET',
					url: `https://app.famulor.de/api/user/tools/${toolId}`,
					json: true,
				};

				const response = await makeRequestWithRetry(this, options);
				returnData.push({ 
					json: response,
					pairedItem: { item: i }
				});

			} else if (operation === 'list') {
					const options = {
						method: 'GET' as 'GET',
						url: 'https://app.famulor.de/api/user/tools',
						json: true,
					};

					const response = await makeRequestWithRetry(this, options);

					if (!Array.isArray(response)) {
						throw new NodeOperationError(this.getNode(), 'Invalid response format - expected array', { itemIndex: i });
					}

					// Return each tool as a separate item
					response.forEach((tool: any) => {
						returnData.push({ 
							json: tool,
							pairedItem: { item: i }
					});
				});

			} else if (operation === 'update') {
				const toolId = this.getNodeParameter('toolId', i) as number;
				const updateToolFields = this.getNodeParameter('updateToolFields', i, {}) as {
					name?: string;
					description?: string;
					endpoint?: string;
					method?: string;
					timeout?: number;
					headers?: { headers?: Array<{ name: string; value: string }> };
					schema?: { parameters?: Array<{ name: string; type: string; description: string }> };
				};

				// Build the update body
				const body: any = {};

				if (updateToolFields.name) {
					body.name = updateToolFields.name;
				}

				if (updateToolFields.description) {
					body.description = updateToolFields.description;
				}

				if (updateToolFields.endpoint) {
					body.endpoint = updateToolFields.endpoint;
				}

				if (updateToolFields.method) {
					body.method = updateToolFields.method;
				}

				if (updateToolFields.timeout !== undefined) {
					body.timeout = updateToolFields.timeout;
				}

				if (updateToolFields.headers && updateToolFields.headers.headers) {
					const headers: Array<{ name: string; value: string }> = [];
					updateToolFields.headers.headers.forEach(header => {
						if (header.name && header.value) {
							headers.push({ name: header.name, value: header.value });
						}
					});
					body.headers = headers;
				}

				if (updateToolFields.schema && updateToolFields.schema.parameters) {
					const schema: Array<{ name: string; type: string; description: string }> = [];
					updateToolFields.schema.parameters.forEach(param => {
						if (param.name && param.type && param.description) {
							schema.push({ 
								name: param.name, 
								type: param.type, 
								description: param.description 
							});
						}
					});
					body.schema = schema;
				}

				const options = {
					method: 'PUT' as 'PUT',
					url: `https://app.famulor.de/api/user/tools/${toolId}`,
					body: body,
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
