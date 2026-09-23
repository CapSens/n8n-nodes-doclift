import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { searchTemplates } from './listSearch';

const loader = (templates: unknown[]) =>
	({
		getCredentials: vi.fn().mockResolvedValue({ baseUrl: 'https://app.doclift.io' }),
		helpers: { httpRequestWithAuthentication: vi.fn().mockResolvedValue(templates) },
	}) as unknown as ILoadOptionsFunctions;

describe('searchTemplates', () => {
	it('offers each template under its title and category', async () => {
		const result = await searchTemplates.call(
			loader([
				{ id: 12, title: 'Devis', category: 'workflow' },
				{ id: 13, title: 'Mandat', category: 'fillable_form' },
			]),
		);

		expect(result.results.map((entry) => `${entry.name} → ${entry.value}`)).toEqual([
			'Devis (workflow) → 12',
			'Mandat (fillable_form) → 13',
		]);
	});

	// Custom templates enforce none of the payload contract, so a form built for
	// one would be a form nothing validates.
	it('asks only for the categories this node can build a form for', async () => {
		const client = loader([]);

		await searchTemplates.call(client, 'dev');

		expect(client.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'docliftApi',
			expect.objectContaining({
				url: '/api/v1/templates',
				qs: { category: 'workflow,fillable_form', q: 'dev' },
			}),
		);
	});

	it('searches for nothing in particular when the field is empty', async () => {
		const client = loader([]);

		await searchTemplates.call(client);

		expect(client.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'docliftApi',
			expect.objectContaining({ qs: { category: 'workflow,fillable_form', q: '' } }),
		);
	});
});
