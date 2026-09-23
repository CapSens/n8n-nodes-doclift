import { describe, expect, it } from 'vitest';

import { fieldsFromContract, type PayloadContract } from './contract';

const contract = (overrides: Partial<PayloadContract> = {}): PayloadContract => ({
	template_id: 1,
	category: 'workflow',
	variables: [],
	required: [],
	constrained: [],
	collections: [],
	limits: {},
	enforced: { required: true, allowed_values: true, collections: true },
	...overrides,
});

describe('fieldsFromContract', () => {
	it('turns a constrained variable into a dropdown of its allowed values', () => {
		const fields = fieldsFromContract(
			contract({
				required: ['country'],
				variables: [{ name: 'country', allowed_values: ['fr', 'be'], field_type: 'select' }],
			}),
		);

		expect(fields).toEqual([
			expect.objectContaining({
				id: 'country',
				type: 'options',
				options: ['fr', 'be'].map((value) => ({ name: value, value })),
			}),
		]);
	});

	// The wall hit on the first real mapping: an optional constrained variable
	// could not be left empty, because a dropdown refuses a value that is not on
	// its list. The API accepts blank; the form now offers it.
	it('opens an optional constrained variable with a way out of the list', () => {
		const fields = fieldsFromContract(
			contract({ variables: [{ name: 'legal_form', allowed_values: ['SAS', 'SARL'] }] }),
		);

		expect(fields[0].options).toEqual([
			{ name: 'None', value: '' },
			{ name: 'SAS', value: 'SAS' },
			{ name: 'SARL', value: 'SARL' },
		]);
	});

	it('leaves an unconstrained variable a plain string', () => {
		const fields = fieldsFromContract(
			contract({ variables: [{ name: 'comment', allowed_values: [] }] }),
		);

		expect(fields[0]).toMatchObject({ type: 'string' });
		expect(fields[0]).not.toHaveProperty('options');
	});

	// The reason the contract publishes a list rather than a flag per variable:
	// a fillable form stores `required` and enforces none of it, so marking the
	// field mandatory would promise a 422 that never comes.
	it('marks required only what the contract says is refused', () => {
		const fields = fieldsFromContract(
			contract({
				category: 'fillable_form',
				required: [],
				enforced: { required: false, allowed_values: true, collections: false },
				variables: [{ name: 'civility', allowed_values: ['M.', 'Mme'] }],
			}),
		);

		expect(fields[0].required).toBe(false);
	});

	it('marks required what a workflow will refuse', () => {
		const fields = fieldsFromContract(
			contract({ required: ['country'], variables: [{ name: 'country' }] }),
		);

		expect(fields[0].required).toBe(true);
	});

	// The mapping form is flat; a collection takes an array of row objects and
	// travels in a JSON field of its own.
	it('leaves collections out of the form', () => {
		const fields = fieldsFromContract(
			contract({
				collections: ['lines'],
				variables: [{ name: 'lines', field_type: 'collection' }, { name: 'total' }],
			}),
		);

		expect(fields.map((field) => field.id)).toEqual(['total']);
	});

	// n8n asks for the fields as soon as the node opens, and an older Doclift —
	// or a template whose contract predates a key — answers without one of them.
	it('survives a contract missing the keys it reads', () => {
		const partial = { template_id: 1, category: 'workflow' } as unknown as PayloadContract;

		expect(fieldsFromContract(partial)).toEqual([]);
	});

	it('treats a variable with no list as free text', () => {
		const fields = fieldsFromContract(
			contract({ variables: [{ name: 'comment' }] }),
		);

		expect(fields[0].type).toBe('string');
	});

	it('survives a contract with no variable at all', () => {
		expect(fieldsFromContract(contract())).toEqual([]);
	});
});
