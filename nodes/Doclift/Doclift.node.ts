import type { Icon, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { searchTemplates } from './methods/listSearch';

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
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}/api/v1',
			headers: { 'Content-Type': 'application/json' },
		},
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
						routing: {
							request: {
								method: 'POST',
								url: '/document_requests',
							},
						},
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
				routing: {
					send: {
						type: 'body',
						property: 'document_request.document_generations[0].template_id',
						value: '={{Number($value)}}',
					},
				},
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
						description: 'Wait for the PDF and return it in the response. One document per call.',
					},
					{
						name: 'Asynchronous',
						value: 'asynchrone',
						description:
							'Queue the generation and answer immediately. Requires a callback URL; the Doclift Trigger node supplies one.',
					},
				],
				routing: { send: { type: 'body', property: 'document_request.type' } },
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'json',
				default: '{}',
				displayOptions: { show: { resource: ['document'], operation: ['generate'] } },
				description: 'The values to interpolate, as a JSON object keyed by variable name. GET /api/v1/templates/:ID/payload_contract lists what a template expects and which of it the API enforces.',
				routing: {
					send: {
						type: 'body',
						property: 'document_request.document_generations[0].variables',
						value: '={{ typeof $value === "string" ? JSON.parse($value) : $value }}',
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
						displayName: 'Tag',
						name: 'tag',
						type: 'string',
						default: '',
						description: 'Your own reference, echoed back and searchable on the request list',
						routing: { send: { type: 'body', property: 'document_request.tag' } },
					},
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'Where the webhook is delivered for an asynchronous generation. Must be HTTPS. Overrides the URL configured on the external application.',
						routing: { send: { type: 'body', property: 'document_request.callback_url' } },
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchTemplates },
	};
}
