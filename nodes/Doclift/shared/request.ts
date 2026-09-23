import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';

export type DocliftCaller = IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions;

const CREDENTIALS = 'docliftApi';

/** Every call to the API goes through here, so the base url is read once. */
export async function docliftRequest<T>(
	caller: DocliftCaller,
	options: { method: IHttpRequestMethods; url: string; body?: IDataObject; qs?: IDataObject },
): Promise<T> {
	const credentials = await caller.getCredentials(CREDENTIALS);

	return (await caller.helpers.httpRequestWithAuthentication.call(caller, CREDENTIALS, {
		baseURL: credentials.baseUrl as string,
		json: true,
		...options,
	})) as T;
}

/** The generated file, fetched from its pre-signed url and attached as binary. */
export async function attachPdf(
	caller: IExecuteFunctions | IWebhookFunctions,
	response: IDataObject,
): Promise<{ data: Awaited<ReturnType<typeof caller.helpers.prepareBinaryData>> } | undefined> {
	const generation = ((response.documents_generations as IDataObject[]) ?? [])[0];
	const file = generation?.file as IDataObject | undefined;
	if (typeof file?.url !== 'string') return undefined;

	const downloaded = (await caller.helpers.httpRequest({
		method: 'GET',
		url: file.url,
		encoding: 'arraybuffer',
		json: false,
	})) as ArrayBuffer;

	return {
		data: await caller.helpers.prepareBinaryData(
			Buffer.from(downloaded),
			(file.filename as string) ?? 'document.pdf',
			'application/pdf',
		),
	};
}
