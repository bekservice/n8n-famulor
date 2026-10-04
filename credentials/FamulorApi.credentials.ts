import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FamulorApi implements ICredentialType {
	name = 'famulorApi';
	displayName = 'Famulor API';
	icon = 'file:famulor.svg' as const;
	documentationUrl = 'https://docs.famulor.io/automations/n8n';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'fam_...',
			description:
				'Workspace API key starting with fam_. Create it in Famulor Settings → API & MCP. The key determines the workspace and allowed operations. Personal user preferences require a user-owned credential.',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://app.famulor.io',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + $credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://app.famulor.io"}}',
			url: '/api/v1/me',
		},
	};
}
