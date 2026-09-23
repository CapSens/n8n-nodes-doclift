import type { ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';

import { fieldsFromContract, type PayloadContract } from '../shared/contract';

export async function getTemplateFields(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const templateId = this.getNodeParameter('templateId', undefined, {
		extractValue: true,
	}) as string | number | undefined;

	if (!templateId) {
		return { fields: [], emptyFieldsNotice: 'Choose a template first.' };
	}

	const credentials = await this.getCredentials('docliftApi');

	const contract = (await this.helpers.httpRequestWithAuthentication.call(this, 'docliftApi', {
		method: 'GET',
		baseURL: credentials.baseUrl as string,
		url: `/api/v1/templates/${templateId}/payload_contract`,
		json: true,
	})) as PayloadContract;

	const fields = fieldsFromContract(contract);

	if (fields.length === 0) {
		return { fields, emptyFieldsNotice: 'This template declares no variable.' };
	}

	return { fields };
}
