import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type JsonObject,
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
import { attachPdf, docliftRequest } from './shared/request';
import { getTemplateFields } from './methods/resourceMapping';
import { signatureMatches } from './shared/signature';
import { classifyReentry, type PendingWait } from './shared/wait';

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
				// Empty, as n8n's own Wait node leaves it. The path is a suffix of
				// the resume url, and `$execution.resumeUrl` — the address handed to
				// Doclift — carries none: anything here registers the webhook
				// somewhere the callback will never knock, and the reply is a 404
				// nothing in the workflow surfaces.
				path: '',
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
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				displayOptions: { show: { resource: ['document'], operation: ['generate'], mode: ['asynchrone'] } },
				description:
					'Whether to pause the execution until Doclift calls back, handing it this node\'s own resume URL. Turn off to queue and continue, in which case the callback goes to the Callback URL option or to the address configured on the external application.',
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
				options: [					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'Where Doclift delivers the webhook when this node does not wait for it. Must be HTTPS. Left empty, the address configured on the external application is used.',
						displayOptions: { show: { '/mode': ['asynchrone'], '/waitForCompletion': [false] } },
					},					{
						displayName: 'Collections (JSON)',
						name: 'collections',
						type: 'json',
						default: '{}',
						description:
							'Collection variables, which the mapping form above cannot hold because it is flat. A JSON object keyed by variable name, each an array of row objects.',
					},					{
						displayName: 'Download PDF',
						name: 'download',
						type: 'boolean',
						default: false,
						description:
							'Whether to fetch the generated file and attach it as binary data, rather than only returning its URL',
					},					{
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						description: 'Your own reference, echoed back and searchable on the request list',
					},					{
						displayName: 'Timeout (Minutes)',
						name: 'timeoutMinutes',
						type: 'number',
						default: 5,
						description:
							'How long an asynchronous generation may keep the execution waiting before it fails',
						displayOptions: { show: { '/mode': ['asynchrone'], '/waitForCompletion': [true] } },
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
		const pending = this.getContext('node') as PendingWait;
		const reentry = classifyReentry(pending, Date.now());

		if (reentry.kind === 'timedOut') {
			throw new NodeOperationError(
				this.getNode(),
				`Doclift did not call back within the timeout. Document request ${reentry.documentRequestId} may still be running.`,
			);
		}

		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const mode = this.getNodeParameter('mode', i) as string;
				const waits =
					mode === 'asynchrone' && (this.getNodeParameter('waitForCompletion', i, true) as boolean);
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				// An execution can only be suspended once, so a batch cannot each
				// have its own callback. Refused rather than silently generating the
				// first and dropping the rest.
				if (waits && items.length > 1) {
					throw new NodeOperationError(
						this.getNode(),
						`Waiting for completion handles one item per execution, and this node received ${items.length}. Turn off "Wait for Completion", or put the node behind a Loop Over Items.`,
					);
				}

				const response = await docliftRequest<IDataObject>(this, {
					method: 'POST',
					url: '/api/v1/document_requests',
					body: buildBody.call(this, i, mode, options, waits),
				});

				if (waits) {
					const minutes = (options.timeoutMinutes as number) ?? 5;
					const deadline = Date.now() + minutes * 60 * 1000;

					pending.documentRequestId = response.id as number;
					pending.deadline = deadline;

					await this.putExecutionToWait(new Date(deadline));

					return [returnData];
				}

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

	/** The resume: Doclift's webhook body is what this node answers with. */
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('docliftApi');
		const request = this.getRequestObject();

		// The signed bytes, before anything reparses them. `rawBody` is empty
		// until this resolves, which is the quiet way a signature check starts
		// rejecting everything.
		await request.readRawBody();
		const raw = request.rawBody?.toString('utf8') ?? '';

		if (
			!signatureMatches(raw, this.getHeaderData()['x-doclift-signature'], credentials.apiKey as string)
		) {
			throw new NodeOperationError(
				this.getNode(),
				'The callback signature does not match this credential. It was not sent by Doclift, or it was sent for another application.',
			);
		}

		const payload = JSON.parse(raw) as IDataObject;

		if (payload.event === 'document_request.failed') {
			throw new NodeOperationError(this.getNode(), failureReason(payload));
		}

		const item: INodeExecutionData = { json: payload };
		const options = this.getNodeParameter('options', {}) as IDataObject;

		// The option promises the same thing in both modes, so it has to be kept
		// on the path that produces the output of an asynchronous run.
		if (options.download === true) {
			const binary = await attachPdf(this, payload);
			if (binary !== undefined) item.binary = binary;
		}

		return { workflowData: [[item]] };
	}
}

function buildBody(
	this: IExecuteFunctions,
	itemIndex: number,
	mode: string,
	options: IDataObject,
	waits: boolean,
): IDataObject {
	const templateId = this.getNodeParameter('templateId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const mapped = this.getNodeParameter('variables.value', itemIndex, {}) as IDataObject;

	const request: IDataObject = {
		type: mode,
		tag: (options.tag as string) ?? '',
		document_generations: [
			{
				template_id: Number(templateId),
				variables: { ...mapped, ...parseCollections.call(this, options.collections, itemIndex) },
			},
		],
	};

	if (waits) {
		request.callback_url = this.evaluateExpression('{{ $execution.resumeUrl }}', itemIndex);
	} else if (mode === 'asynchrone' && options.callbackUrl) {
		request.callback_url = options.callbackUrl;
	}

	return { document_request: request };
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
