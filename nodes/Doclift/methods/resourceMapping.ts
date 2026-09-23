import type { ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';

import { fieldsFromContract, type PayloadContract } from '../shared/contract';
import { docliftRequest } from '../shared/request';

export async function getTemplateFields(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const templateId = this.getNodeParameter('templateId', undefined, {
		extractValue: true,
	}) as string | number | undefined;

	if (!templateId) {
		return { fields: [], emptyFieldsNotice: 'Choose a template first.' };
	}

	const contract = await docliftRequest<PayloadContract>(this, {
		method: 'GET',
		url: `/api/v1/templates/${templateId}/payload_contract`,
	});

	const fields = fieldsFromContract(contract);

	if (fields.length === 0) {
		return { fields, emptyFieldsNotice: 'This template declares no variable.' };
	}

	return { fields };
}
