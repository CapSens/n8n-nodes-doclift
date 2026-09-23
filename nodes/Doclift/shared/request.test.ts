import { describe, expect, it, vi } from 'vitest';

import { attachPdf, docliftRequest } from './request';
import type { DocliftCaller } from './request';

const caller = (over: Record<string, unknown> = {}) =>
	({
		getCredentials: vi.fn().mockResolvedValue({ baseUrl: 'https://app.doclift.io', apiKey: 'k' }),
		helpers: {
			httpRequestWithAuthentication: vi.fn().mockResolvedValue({ id: 7 }),
			httpRequest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
			prepareBinaryData: vi.fn().mockResolvedValue({ fileName: 'given.pdf' }),
			...((over.helpers as object) ?? {}),
		},
		...over,
	}) as unknown as DocliftCaller;

describe('docliftRequest', () => {
	it('reads the instance off the credentials and returns the parsed body', async () => {
		const client = caller();

		const body = await docliftRequest(client, { method: 'GET', url: '/api/v1/templates' });

		expect(body).toEqual({ id: 7 });
		expect(client.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith('docliftApi', {
			baseURL: 'https://app.doclift.io',
			json: true,
			method: 'GET',
			url: '/api/v1/templates',
		});
	});

	// The credentials name is what n8n looks up to inject the key; a request sent
	// with the wrong one is an unauthenticated request.
	it('authenticates as itself', async () => {
		const client = caller();

		await docliftRequest(client, { method: 'GET', url: '/api/v1/user' });

		expect(client.getCredentials).toHaveBeenCalledWith('docliftApi');
	});
});

describe('attachPdf', () => {
	it('downloads the generated file and prepares it as binary', async () => {
		const client = caller() as ReturnType<typeof caller> & { helpers: Record<string, ReturnType<typeof vi.fn>> };

		const binary = await attachPdf(client as never, {
			documents_generations: [{ file: { url: 'https://s3/doc.pdf', filename: 'given.pdf' } }],
		});

		expect(client.helpers.httpRequest).toHaveBeenCalledWith({
			method: 'GET',
			url: 'https://s3/doc.pdf',
			encoding: 'arraybuffer',
			json: false,
		});
		expect(client.helpers.prepareBinaryData).toHaveBeenCalledWith(
			Buffer.from(new Uint8Array([1, 2, 3])),
			'given.pdf',
			'application/pdf',
		);
		expect(binary).toEqual({ data: { fileName: 'given.pdf' } });
	});

	it('names the file itself when the response does not', async () => {
		const client = caller() as ReturnType<typeof caller> & { helpers: Record<string, ReturnType<typeof vi.fn>> };

		await attachPdf(client as never, {
			documents_generations: [{ file: { url: 'https://s3/doc.pdf' } }],
		});

		expect(client.helpers.prepareBinaryData).toHaveBeenCalledWith(
			expect.anything(),
			'document.pdf',
			'application/pdf',
		);
	});

	// Nothing to attach is not a failure: the caller asked for a binary, and a
	// response without a file still carries the generation it describes.
	it.each([
		['no generation at all', {}],
		['a generation without a file', { documents_generations: [{}] }],
		['a file without a url', { documents_generations: [{ file: {} }] }],
	])('returns nothing on %s', async (_case, response) => {
		const client = caller() as ReturnType<typeof caller> & { helpers: Record<string, ReturnType<typeof vi.fn>> };

		expect(await attachPdf(client as never, response)).toBeUndefined();
		expect(client.helpers.httpRequest).not.toHaveBeenCalled();
	});
});
