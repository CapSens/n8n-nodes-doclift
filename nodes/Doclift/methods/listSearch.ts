import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	IDataObject,
} from 'n8n-workflow';

// Only the two categories this node can build a form for. Custom templates are
// on their way out and enforce none of the payload contract, so offering them
// would offer a form nothing validates.
const SUPPORTED_CATEGORIES = 'workflow,fillable_form';

export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const credentials = await this.getCredentials('docliftApi');

	const templates = (await this.helpers.httpRequestWithAuthentication.call(this, 'docliftApi', {
		method: 'GET',
		baseURL: credentials.baseUrl as string,
		url: '/api/v1/templates',
		qs: { category: SUPPORTED_CATEGORIES, q: filter ?? '' },
		json: true,
	})) as IDataObject[];

	return {
		results: templates.map((template) => ({
			name: `${template.title as string} (${template.category as string})`,
			value: template.id as number,
		})),
	};
}
