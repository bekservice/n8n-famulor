import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FamulorApi implements ICredentialType {
	name = 'famulorApi';
	displayName = 'Famulor API';
	documentationUrl = 'https://app.famulor.io/';
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
				'Platform 2.0 service-account key starting with fam_. Create it in Famulor at https://app.famulor.io/. Classic 1.0 keys from app.famulor.de are not interchangeable.',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.famulor.io',
			placeholder: 'https://app.famulor.io',
			description:
				'Famulor Platform host. Defaults to https://app.famulor.io. Set a verified custom domain for whitelabel. Do not use https://app.famulor.de (Classic 1.0, no /api/v1).',
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
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/assistants',
			qs: {
				limit: 1,
			},
		},
	};
}
