import type { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

export class FamulorWebhookApi implements ICredentialType {
	name = 'famulorWebhookApi';
	displayName = 'Famulor Webhook API';
	documentationUrl = 'https://docs.famulor.io/automations/n8n';
	icon = { light: 'file:famulor.svg', dark: 'file:famulor-dark.svg' } as const;
	authenticate = {
		type: 'generic',
		properties: { headers: { Authorization: '={{"Bearer " + $credentials.apiKey}}' } },
	} as const;
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://app.famulor.io"}}',
			url: '/api/v1/me',
			method: 'GET',
			disableFollowRedirect: true,
		},
	};
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Workspace key with settings:read, settings:write and the selected event’s calls:read or bookings:read scope. Required to test the API connection and register automatically. Existing manual receivers can leave it blank; their signing secret cannot be compared remotely.',
		},
		{ displayName: 'Base URL', name: 'baseUrl', type: 'hidden', default: 'https://app.famulor.io' },
		{
			displayName: 'Webhook Secret',
			name: 'secret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Secret configured for the Famulor webhook destination. n8n stores it encrypted in credentials',
		},
	];
}
