import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type Icon,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import { searchTemplates } from './methods/listSearch';
import { getTemplateFields } from './methods/resourceMapping';
import { signatureMatches } from './shared/signature';

interface SentRequest {
	documentRequestId?: number;
}

// `webhookMethods` has nothing to do here, which is why the lifecycle rule is
// off for this class: the webhook below is a resume hook, the shape n8n's own
// Wait node uses, not a subscription registered on a third-party service.
// Doclift has no subscription endpoint at all — the callback address travels
// with each request, which is exactly what lets this node hand over its own.
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
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
		// The address an asynchronous generation calls back on. It is this node's
		// own resume url, so the workflow needs no trigger wired to it, which is
		// only possible because the API takes a callback per request.
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: '={{$nodeId}}',
				restartWebhook: true,
			},
		],
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
						description: 'Generate a PDF from a template',
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
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				default: 'synchrone',
				displayOptions: { show: { resource: ['document'], operation: ['generate'] } },
				options: [
					{
						name: 'Synchronous',
						value: 'synchrone',
						description: 'Wait on the open connection and return the document. One per call.',
					},
					{
						name: 'Asynchronous',
						value: 'asynchrone',
						description:
							'Queue the generation and pause until Doclift calls back. Nothing to wire: this node hands Doclift its own resume URL.',
					},
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
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						description: 'Your own reference, echoed back and searchable on the request list',
					},
					{
						displayName: 'Timeout (Minutes)',
						name: 'timeoutMinutes',
						type: 'number',
						default: 5,
						description:
							'How long an asynchronous generation may keep the execution waiting before it fails',
						displayOptions: { show: { '/mode': ['asynchrone'] } },
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
		const context = this.getContext('node') as SentRequest;

		// A second pass without the webhook having fired is the deadline going
		// off: the request exists, Doclift never called back.
		if (context.documentRequestId !== undefined) {
			throw new NodeOperationError(
				this.getNode(),
				`Doclift did not call back within the timeout. Document request ${context.documentRequestId} may still be running.`,
			);
		}

		const credentials = await this.getCredentials('docliftApi');
		const returnData: INodeExecutionData[] = [];
		const items = this.getInputData();

		for (let i = 0; i < items.length; i++) {
			const mode = this.getNodeParameter('mode', i) as string;
			const templateId = this.getNodeParameter('templateId', i, undefined, {
				extractValue: true,
			}) as string;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const mapped = this.getNodeParameter('variables.value', i, {}) as IDataObject;

			const body: IDataObject = {
				document_request: {
					type: mode,
					tag: (options.tag as string) ?? '',
					document_generations: [
						{
							template_id: Number(templateId),
							variables: { ...mapped, ...parseCollections.call(this, options.collections, i) },
						},
					],
				},
			};

			if (mode === 'asynchrone') {
				const resumeUrl = this.evaluateExpression('{{ $execution.resumeUrl }}', i) as string;
				(body.document_request as IDataObject).callback_url = resumeUrl;
			}

			const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'docliftApi', {
				method: 'POST',
				baseURL: credentials.baseUrl as string,
				url: '/api/v1/document_requests',
				body,
				json: true,
			})) as IDataObject;

			if (mode === 'asynchrone') {
				// One request per execution: the pause belongs to the execution, not
				// to the item, so a second item would overwrite the first's wait.
				context.documentRequestId = response.id as number;

				const minutes = (options.timeoutMinutes as number) ?? 5;
				await this.putExecutionToWait(new Date(Date.now() + minutes * 60 * 1000));

				return [returnData];
			}

			returnData.push(...(await toOutput.call(this, response, i, options)));
		}

		return [returnData];
	}

	/** The resume: Doclift's webhook body is what this node answers with. */
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('docliftApi');
		const request = this.getRequestObject();

		// The signed bytes, before anything reparses them. `rawBody` is empty
		// until this resolves, which is the quiet way a signature check starts
		// rejecting everything.
		await request.readRawBody();
		const raw = request.rawBody?.toString('utf8') ?? '';

		if (!signatureMatches(raw, this.getHeaderData()['x-doclift-signature'], credentials.apiKey as string)) {
			throw new NodeOperationError(
				this.getNode(),
				'The callback signature does not match this credential. It was not sent by Doclift, or it was sent for another application.',
			);
		}

		const payload = JSON.parse(raw) as IDataObject;

		if (payload.event === 'document_request.failed') {
			throw new NodeOperationError(this.getNode(), failureReason(payload));
		}

		return { workflowData: [[{ json: payload }]] };
	}
}

async function toOutput(
	this: IExecuteFunctions,
	response: IDataObject,
	itemIndex: number,
	options: IDataObject,
): Promise<INodeExecutionData[]> {
	const item: INodeExecutionData = { json: response, pairedItem: { item: itemIndex } };
	if (options.download !== true) return [item];

	const generation = ((response.documents_generations as IDataObject[]) ?? [])[0];
	const file = generation?.file as IDataObject | undefined;
	if (typeof file?.url !== 'string') return [item];

	const downloaded = (await this.helpers.httpRequest({
		method: 'GET',
		url: file.url,
		encoding: 'arraybuffer',
		json: false,
	})) as ArrayBuffer;

	item.binary = {
		data: await this.helpers.prepareBinaryData(
			Buffer.from(downloaded),
			(file.filename as string) ?? 'document.pdf',
			'application/pdf',
		),
	};

	return [item];
}

function failureReason(payload: IDataObject): string {
	const generations = (payload.documents_generations as IDataObject[]) ?? [];
	const perDocument = generations
		.map((generation) => generation.generation_error)
		.filter(Boolean)
		.join('; ');

	return [payload.error, perDocument].filter(Boolean).join(' — ') || 'Doclift reported a failure.';
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
