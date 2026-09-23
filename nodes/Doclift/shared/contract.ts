import type { FieldType, ResourceMapperField } from 'n8n-workflow';

export interface PayloadContractVariable {
	name: string;
	description?: string | null;
	field_type?: string | null;
	allowed_values?: string[] | null;
}

export interface PayloadContract {
	template_id: number;
	category: string;
	variables: PayloadContractVariable[];
	required: string[];
	constrained: string[];
	collections: string[];
	limits: { collection_rows?: number };
	enforced: { required: boolean; allowed_values: boolean; collections: boolean };
}

const COLLECTION = 'collection';

/**
 * Turns a template's contract into the fields of the mapping form.
 *
 * `required` is read off the contract's own list rather than off each
 * variable, because only that list says what the API will actually refuse: a
 * fillable form stores the flag and enforces nothing, so marking its fields
 * mandatory would promise a 422 that never comes.
 */
export function fieldsFromContract(contract: PayloadContract): ResourceMapperField[] {
	const required = new Set(contract.required ?? []);

	return (contract.variables ?? [])
		.filter((variable) => variable.field_type !== COLLECTION)
		.map((variable) => {
			const allowed = variable.allowed_values ?? [];
			const constrained = allowed.length > 0;

			return {
				id: variable.name,
				displayName: variable.name,
				required: required.has(variable.name),
				defaultMatch: false,
				canBeUsedToMatch: false,
				display: true,
				type: (constrained ? 'options' : 'string') as FieldType,
				...(constrained ? { options: allowed.map((value) => ({ name: value, value })) } : {}),
			};
		});
}
