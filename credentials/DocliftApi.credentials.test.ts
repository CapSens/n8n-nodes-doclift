import { describe, expect, it } from 'vitest';

import { DocliftApi } from './DocliftApi.credentials';

describe('DocliftApi credentials', () => {
	const credentials = new DocliftApi();

	// The name is what the node looks up and what n8n stores the key under:
	// changing it orphans every credential already saved.
	it('is known as docliftApi', () => {
		expect(credentials.name).toBe('docliftApi');
	});

	it('sends the key in the header Doclift authenticates on', () => {
		expect(credentials.authenticate.properties.headers).toEqual({
			'X-Api-Key': '={{$credentials.apiKey}}',
		});
	});

	it('asks for a key and an instance, and hides the key', () => {
		const fields = Object.fromEntries(credentials.properties.map((field) => [field.name, field]));

		expect(Object.keys(fields)).toEqual(['apiKey', 'baseUrl']);
		expect(fields.apiKey.typeOptions?.password).toBe(true);
		expect(fields.apiKey.required).toBe(true);
		expect(fields.baseUrl.default).toBe('https://app.doclift.io');
	});

	// The test call is what tells the user their key works before they build a
	// workflow on it.
	it('checks the key against the instance it was given', () => {
		expect(credentials.test.request).toEqual({
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/user',
			method: 'GET',
		});
	});
});
