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
 * A dropdown refuses a value absent from its list, and an empty one is on no
 * list: without this choice, an optional constrained variable can only be left
 * out by removing its field from the form. The API takes a blank value on a
 * constrained variable like on any other.
 */
const NOT_SET = { name: 'None', value: '' };

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
			const mandatory = required.has(variable.name);
			const choices = allowed.map((value) => ({ name: value, value }));

			return {
				id: variable.name,
				displayName: variable.name,
				required: mandatory,
				defaultMatch: false,
				canBeUsedToMatch: false,
				display: true,
				type: (constrained ? 'options' : 'string') as FieldType,
				...(constrained ? { options: mandatory ? choices : [NOT_SET, ...choices] } : {}),
			};
		});
}
