import { NodeApiError, NodeOperationError, sleep, type IExecuteFunctions, type INode } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Doclift } from './Doclift.node';

vi.mock('n8n-workflow', async (importOriginal) => ({
	...(await importOriginal<typeof import('n8n-workflow')>()),
	sleep: vi.fn().mockResolvedValue(undefined),
}));

const NODE = {
	id: '1',
	name: 'Doclift',
	type: 'n8n-nodes-doclift.doclift',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as INode;

const GENERATED = {
	id: 42,
	status: 'success',
	documents_generations: [{ file: { url: 'https://s3/doc.pdf', filename: 'devis.pdf' } }],
};

const saturated = (retryAfter?: string) => ({
	response: { status: 429, headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter } },
});

interface Setup {
	items?: number;
	parameters?: Record<string, unknown>;
	http?: ReturnType<typeof vi.fn>;
	continueOnFail?: boolean;
}

const context = (setup: Setup = {}) => {
	const parameters: Record<string, unknown> = {
		templateId: '12',
		'variables.value': { country: 'fr' },
		options: {},
		...setup.parameters,
	};

	return {
		getInputData: () => Array.from({ length: setup.items ?? 1 }, (_unused, i) => ({ json: { i } })),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => parameters[name] ?? fallback,
		getNode: () => NODE,
		continueOnFail: () => setup.continueOnFail ?? false,
		getCredentials: vi.fn().mockResolvedValue({ baseUrl: 'https://app.doclift.io' }),
		helpers: {
			httpRequestWithAuthentication: setup.http ?? vi.fn().mockResolvedValue(GENERATED),
			httpRequest: vi.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer),
			prepareBinaryData: vi.fn().mockResolvedValue({ fileName: 'devis.pdf' }),
		},
	} as unknown as IExecuteFunctions;
};

const run = async (setup: Setup = {}) => {
	const ctx = context(setup);
	const output = await new Doclift().execute.call(ctx);

	return { output, ctx, http: ctx.helpers.httpRequestWithAuthentication as ReturnType<typeof vi.fn> };
};

const sentBody = (http: ReturnType<typeof vi.fn>, call = 0) =>
	http.mock.calls[call][1].body.document_request;

beforeEach(() => vi.mocked(sleep).mockClear());

describe('Doclift node', () => {
	it('returns one generated document per input item', async () => {
		const { output, http } = await run({ items: 2 });

		expect(http).toHaveBeenCalledTimes(2);
		expect(output[0]).toEqual([
			{ json: GENERATED, pairedItem: { item: 0 } },
			{ json: GENERATED, pairedItem: { item: 1 } },
		]);
	});

	// The node exists to generate synchronously: the request says so, and the
	// template id travels as the number the API expects rather than the string
	// the resource locator holds.
	it('asks for a synchronous generation of the chosen template', async () => {
		const { http } = await run();

		expect(sentBody(http)).toEqual({
			type: 'synchrone',
			tag: '',
			document_generations: [{ template_id: 12, variables: { country: 'fr' } }],
		});
		expect(http.mock.calls[0][1]).toMatchObject({
			method: 'POST',
			url: '/api/v1/document_requests',
		});
	});

	it('carries the tag when one is given', async () => {
		const { http } = await run({ parameters: { options: { tag: 'devis-2026' } } });

		expect(sentBody(http).tag).toBe('devis-2026');
	});

	describe('collections', () => {
		it('merges the ones written as JSON into the variables', async () => {
			const { http } = await run({
				parameters: { options: { collections: '{"lines":[{"label":"Audit"}]}' } },
			});

			expect(sentBody(http).document_generations[0].variables).toEqual({
				country: 'fr',
				lines: [{ label: 'Audit' }],
			});
		});

		it('takes an object as it comes', async () => {
			const { http } = await run({
				parameters: { options: { collections: { lines: [{ label: 'Audit' }] } } },
			});

			expect(sentBody(http).document_generations[0].variables.lines).toEqual([{ label: 'Audit' }]);
		});

		it.each([
			['an empty field', ''],
			['an empty object', '{}'],
			['an absent option', undefined],
		])('sends only the mapped variables on %s', async (_case, collections) => {
			const { http } = await run({ parameters: { options: { collections } } });

			expect(sentBody(http).document_generations[0].variables).toEqual({ country: 'fr' });
		});

		// Silently dropping it would generate a document missing its table.
		it('refuses what is not JSON', async () => {
			await expect(run({ parameters: { options: { collections: 'lines: Audit' } } })).rejects.toThrow(
				'Collections is not valid JSON',
			);
		});
	});

	describe('download', () => {
		it('attaches the generated file when asked', async () => {
			const { output, ctx } = await run({ parameters: { options: { download: true } } });

			expect(ctx.helpers.httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({ url: 'https://s3/doc.pdf' }),
			);
			expect(output[0][0].binary).toEqual({ data: { fileName: 'devis.pdf' } });
		});

		it('leaves the item alone when the response carries no file', async () => {
			const { output } = await run({
				parameters: { options: { download: true } },
				http: vi.fn().mockResolvedValue({ id: 42, documents_generations: [] }),
			});

			expect(output[0][0].binary).toBeUndefined();
		});

		it('returns only the url when it is not asked', async () => {
			const { output, ctx } = await run();

			expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
			expect(output[0][0].binary).toBeUndefined();
		});
	});

	describe('when the organization holds every synchronous slot', () => {
		it('waits the delay the server asked for and sends it again', async () => {
			const http = vi.fn().mockRejectedValueOnce(saturated('3')).mockResolvedValue(GENERATED);

			const { output } = await run({ http });

			expect(sleep).toHaveBeenCalledWith(3000);
			expect(http).toHaveBeenCalledTimes(2);
			expect(output[0][0].json).toEqual(GENERATED);
		});

		it('tries five times before it gives up, by default', async () => {
			const http = vi.fn().mockRejectedValue(saturated('1'));

			await expect(run({ http })).rejects.toThrow(/still holding every synchronous slot/);
			expect(http).toHaveBeenCalledTimes(5);
			expect(sleep).toHaveBeenCalledTimes(4);
		});

		// The message is the only place the three ways out are written down.
		it('names what the user can do about it', async () => {
			const http = vi.fn().mockRejectedValue(saturated('1'));

			await expect(run({ http, parameters: { options: { maxAttempts: 2 } } })).rejects.toThrow(
				'Doclift is still holding every synchronous slot after 2 attempts. Raise "Max Attempts When Busy", spread the work out, or ask for the organization\'s synchronous limit to be raised.',
			);
			expect(http).toHaveBeenCalledTimes(2);
		});

		it('still sends once when the option is set below one', async () => {
			const http = vi.fn().mockRejectedValue(saturated());

			await expect(run({ http, parameters: { options: { maxAttempts: 0 } } })).rejects.toThrow(
				NodeOperationError,
			);
			expect(http).toHaveBeenCalledTimes(1);
			expect(sleep).not.toHaveBeenCalled();
		});
	});

	describe('failures', () => {
		// Nothing else improves by asking again: a 422 on the payload would be a
		// 422 five times over.
		it('raises anything else on the first answer', async () => {
			const http = vi.fn().mockRejectedValue({ response: { status: 422 }, message: 'Unprocessable' });

			await expect(run({ http })).rejects.toBeInstanceOf(NodeApiError);
			expect(http).toHaveBeenCalledTimes(1);
			expect(sleep).not.toHaveBeenCalled();
		});

		it('keeps an error already worded for the node', async () => {
			const worded = new NodeOperationError(NODE, 'Template 12 has been archived');
			const http = vi.fn().mockRejectedValue(worded);

			await expect(run({ http })).rejects.toBe(worded);
		});

		// What lands in the item is n8n's own wording for the status: the failure
		// has already been turned into a NodeApiError, which files what Doclift
		// actually said under `description`. The following items are still
		// generated.
		it('hands the failure to the next node when told to continue', async () => {
			const http = vi
				.fn()
				.mockRejectedValueOnce({
					response: { status: 422 },
					errors: ['The following variables carry a value that is not in their list: country'],
				})
				.mockResolvedValue(GENERATED);

			const { output } = await run({ items: 2, continueOnFail: true, http });

			expect(output[0][0].json.error).toBe(
				'Your request is invalid or could not be processed by the service',
			);
			expect(output[0][0].pairedItem).toEqual({ item: 0 });
			expect(output[0][1].json).toEqual(GENERATED);
		});
	});
});
