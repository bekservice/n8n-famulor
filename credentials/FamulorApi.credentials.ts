import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FamulorApi implements ICredentialType {
	name = 'famulorApi';
	displayName = 'Famulor API';
	documentationUrl = 'https://app.famulor.de/';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Create an API key in your Famulor account and paste the value here. Get API key here -> https://app.famulor.de/api-keys',
			required: true,
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
			baseURL: 'https://app.famulor.de',
			url: '/api/user/me',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
		},
	};
}
