import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DocliftApi implements ICredentialType {
	name = 'docliftApi';

	displayName = 'Doclift API';

	icon: Icon = { light: 'file:../icons/doclift.svg', dark: 'file:../icons/doclift.dark.svg' };

	documentationUrl = 'https://app.doclift.io';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The secret key of an external application, from Doclift under External applications. A sandbox key generates watermarked documents; a production key generates final ones.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.doclift.io',
			required: true,
			description:
				'The Doclift instance to call. Synchronous generation is served by this public domain, so pointing elsewhere makes it unavailable.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	// Answers 403 on an unknown or revoked key, and names the application the
	// key belongs to on success, which is what makes the test worth running.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/user',
			method: 'GET',
		},
	};
}
