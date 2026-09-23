import {
	NodeConnectionTypes,
	type IDataObject,
	type Icon,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

import { attachPdf } from '../Doclift/shared/request';
import { signatureMatches } from '../Doclift/shared/signature';
import { FAILED, SUCCEEDED, failureReason, shouldEmit } from './shared/dispatch';

// Same reason as the Doclift node: this is an address Doclift is pointed at, not
// a subscription registered through an API. Doclift has no such endpoint — the
// callback travels with each request, or sits on the external application.
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
export class DocliftTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Doclift Trigger',
		name: 'docliftTrigger',
		icon: {
			light: 'file:../../icons/doclift.svg',
			dark: 'file:../../icons/doclift.dark.svg',
		} as Icon,
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts a workflow when Doclift finishes a document generation',
		defaults: { name: 'Doclift Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'docliftApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				// Answered as soon as this node is done, and it is always done
				// quickly: Doclift replays anything that is not a 2xx, with a
				// backoff, so slow work here would arrive again rather than wait.
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Paste this node\'s Production URL into the webhook URL of your Doclift external application, or send it as the callback_url of your own API calls. Doclift only accepts HTTPS addresses.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [SUCCEEDED, FAILED],
				description: 'Which outcomes start the workflow',
				options: [
					{
						name: 'Document Request Failed',
						value: FAILED,
						description: 'A generation that ended in error, with the reason',
					},
					{
						name: 'Document Request Succeeded',
						value: SUCCEEDED,
						description: 'A generation that produced its document',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Download PDF',
						name: 'download',
						type: 'boolean',
						default: false,
						description:
							'Whether to fetch the generated file and attach it as binary data, rather than only returning its URL',
					},
				],
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('docliftApi');
		const request = this.getRequestObject();

		// The signed bytes, before anything reparses them.
		await request.readRawBody();
		const raw = request.rawBody?.toString('utf8') ?? '';

		if (
			!signatureMatches(raw, this.getHeaderData()['x-doclift-signature'], credentials.apiKey as string)
		) {
			// Refused rather than thrown: a wrong signature is a misconfigured
			// credential or something else posting here, neither of which is a
			// workflow failure. 401 also stops Doclift counting it as delivered.
			this.getResponseObject().status(401).json({ error: 'Invalid signature' });

			return { noWebhookResponse: true };
		}

		const payload = JSON.parse(raw) as IDataObject;
		const events = this.getNodeParameter('events', []) as string[];

		// Answered 200 and dropped. Anything else would have Doclift replay an
		// event this workflow said it did not want, three times, over an hour.
		if (!shouldEmit(payload, events)) return {};

		const item: INodeExecutionData = { json: { ...payload, failure_reason: failureReason(payload) } };
		const options = this.getNodeParameter('options', {}) as IDataObject;

		if (options.download === true) {
			const binary = await attachPdf(this, payload);
			if (binary !== undefined) item.binary = binary;
		}

		return { workflowData: [[item]] };
	}
}
