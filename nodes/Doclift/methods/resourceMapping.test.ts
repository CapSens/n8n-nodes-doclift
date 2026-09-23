import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { getTemplateFields } from './resourceMapping';

const contract = {
	template_id: 12,
	category: 'workflow',
	variables: [{ name: 'country', allowed_values: ['fr'] }],
	required: ['country'],
	constrained: ['country'],
	collections: [],
	limits: {},
	enforced: { required: true, allowed_values: true, collections: true },
};

const loader = (templateId: unknown, payload: unknown = contract) =>
	({
		getNodeParameter: vi.fn().mockReturnValue(templateId),
		getCredentials: vi.fn().mockResolvedValue({ baseUrl: 'https://app.doclift.io' }),
		helpers: { httpRequestWithAuthentication: vi.fn().mockResolvedValue(payload) },
	}) as unknown as ILoadOptionsFunctions;

describe('getTemplateFields', () => {
	it('builds the form from the template the user picked', async () => {
		const client = loader(12);

		const result = await getTemplateFields.call(client);

		expect(client.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'docliftApi',
			expect.objectContaining({ url: '/api/v1/templates/12/payload_contract' }),
		);
		expect(result.fields).toHaveLength(1);
		expect(result.emptyFieldsNotice).toBeUndefined();
	});

	// Asked before a template is chosen, which n8n does as soon as the node opens.
	it('asks for a template rather than calling the API without one', async () => {
		const client = loader(undefined);

		expect(await getTemplateFields.call(client)).toEqual({
			fields: [],
			emptyFieldsNotice: 'Choose a template first.',
		});
		expect(client.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	// An empty form with no explanation reads as a broken node.
	it('says so when the template declares nothing to fill', async () => {
		const client = loader(12, { ...contract, variables: [] });

		expect(await getTemplateFields.call(client)).toEqual({
			fields: [],
			emptyFieldsNotice: 'This template declares no variable.',
		});
	});

	// A collection travels in its own JSON option, so a template made only of
	// collections leaves the flat form empty — and must say why.
	it('counts a collection as nothing the form can hold', async () => {
		const client = loader(12, {
			...contract,
			required: [],
			variables: [{ name: 'lines', field_type: 'collection' }],
		});

		expect((await getTemplateFields.call(client)).emptyFieldsNotice).toBe(
			'This template declares no variable.',
		);
	});
});
