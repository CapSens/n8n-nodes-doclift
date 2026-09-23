import type { ILoadOptionsFunctions, INodeListSearchResult, IDataObject } from 'n8n-workflow';

import { docliftRequest } from '../shared/request';

// Only the two categories this node can build a form for. Custom templates are
// on their way out and enforce none of the payload contract, so offering them
// would offer a form nothing validates.
const SUPPORTED_CATEGORIES = 'workflow,fillable_form';

export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const templates = await docliftRequest<IDataObject[]>(this, {
		method: 'GET',
		url: '/api/v1/templates',
		qs: { category: SUPPORTED_CATEGORIES, q: filter ?? '' },
	});

	return {
		results: templates.map((template) => ({
			name: `${template.title as string} (${template.category as string})`,
			value: template.id as number,
		})),
	};
}
