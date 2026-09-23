import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type Icon,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import { searchTemplates } from './methods/listSearch';
import { getTemplateFields } from './methods/resourceMapping';
import { isSaturation, retryAfterSeconds } from './shared/backlog';
import { attachPdf, docliftRequest } from './shared/request';

export class Doclift implements INodeType {
	description: INodeTypeDescription = {
		usableAsTool: true,
		displayName: 'Doclift',
		name: 'doclift',
		icon: { light: 'file:../../icons/doclift.svg', dark: 'file:../../icons/doclift.dark.svg' } as Icon,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate PDF documents from Doclift templates',
		defaults: { name: 'Doclift' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'docliftApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Document', value: 'document' }],
				default: 'document',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['document'] } },
				options: [
					{
						name: 'Generate',
						value: 'generate',
						action: 'Generate a document',
						description: 'Generate a PDF from a template and wait for it',
					},
				],
				default: 'generate',
			},
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['document'], operation: ['generate'] } },
				description: 'The published template to generate from',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
					},
					{ displayName: 'By ID', name: 'id', type: 'string' },
				],
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				displayOptions: { show: { resource: ['document'], operation: ['generate'] } },
				typeOptions: {
					loadOptionsDependsOn: ['templateId.value'],
					resourceMapper: {
						resourceMapperMethod: 'getTemplateFields',
						mode: 'add',
						addAllFields: true,
						supportAutoMap: true,
						fieldWords: { singular: 'variable', plural: 'variables' },
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { resource: ['document'], operation: ['generate'] } },
				options: [
					{
						displayName: 'Collections (JSON)',
						name: 'collections',
						type: 'json',
						default: '{}',
						description:
							'Collection variables, which the mapping form above cannot hold because it is flat. A JSON object keyed by variable name, each an array of row objects.',
					},
					{
						displayName: 'Download PDF',
						name: 'download',
						type: 'boolean',
						default: false,
						description:
							'Whether to fetch the generated file and attach it as binary data, rather than only returning its URL',
					},
					{
						displayName: 'Max Attempts When Busy',
						name: 'maxAttempts',
						type: 'number',
						default: 5,
						description:
							'How many times to re-send a generation Doclift turned away because the organization already holds every synchronous slot. It answers 429 with a Retry-After, which is honoured; slots free as generations finish.',
					},
					{
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						description: 'Your own reference, echoed back and searchable on the request list',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchTemplates },
		resourceMapping: { getTemplateFields },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const response = await generate.call(this, i, options);
				const item: INodeExecutionData = { json: response, pairedItem: { item: i } };

				if (options.download === true) {
					const binary = await attachPdf(this, response);
					if (binary !== undefined) item.binary = binary;
				}

				returnData.push(item);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}

				const failure =
					error instanceof NodeOperationError
						? error
						: new NodeApiError(this.getNode(), error as JsonObject);

				throw failure;
			}
		}

		return [returnData];
	}
}

/**
 * A synchronous generation, re-sent while Doclift says it is busy.
 *
 * Saturation is not a failure of the payload: the organization holds a fixed
 * number of synchronous slots — five by default — and they free as generations
 * finish, so the answer to a 429 is to wait the Retry-After it carries and ask
 * again. Every other failure is raised on the first try.
 */
async function generate(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): Promise<IDataObject> {
	const attempts = Math.max(1, (options.maxAttempts as number) ?? 5);
	const body = buildBody.call(this, itemIndex, options);
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await docliftRequest<IDataObject>(this, {
				method: 'POST',
				url: '/api/v1/document_requests',
				body,
			});
		} catch (error) {
			if (!isSaturation(error)) {
				throw error instanceof NodeOperationError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject);
			}

			lastError = error;
			if (attempt === attempts) break;

			await sleep(retryAfterSeconds(error) * 1000);
		}
	}

	throw new NodeOperationError(
		this.getNode(),
		`Doclift is still holding every synchronous slot after ${attempts} attempts. Raise "Max Attempts When Busy", spread the work out, or ask for the organization's synchronous limit to be raised.`,
		{ itemIndex, description: (lastError as Error)?.message },
	);
}

function buildBody(
	this: IExecuteFunctions,
	itemIndex: number,
	options: IDataObject,
): IDataObject {
	const templateId = this.getNodeParameter('templateId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const mapped = this.getNodeParameter('variables.value', itemIndex, {}) as IDataObject;

	return {
		document_request: {
			type: 'synchrone',
			tag: (options.tag as string) ?? '',
			document_generations: [
				{
					template_id: Number(templateId),
					variables: { ...mapped, ...parseCollections.call(this, options.collections, itemIndex) },
				},
			],
		},
	};
}

function parseCollections(
	this: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
): IDataObject {
	if (value === undefined || value === '' || value === '{}') return {};
	if (typeof value === 'object') return value as IDataObject;

	try {
		return JSON.parse(value as string) as IDataObject;
	} catch {
		throw new NodeOperationError(this.getNode(), 'Collections is not valid JSON', { itemIndex });
	}
}
