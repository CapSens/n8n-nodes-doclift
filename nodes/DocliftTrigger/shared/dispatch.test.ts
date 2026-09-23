import { describe, expect, it } from 'vitest';

import { FAILED, SUCCEEDED, failureReason, shouldEmit } from './dispatch';

const BOTH = [SUCCEEDED, FAILED];

describe('shouldEmit', () => {
	it('emits an outcome the workflow asked for', () => {
		expect(shouldEmit({ event: SUCCEEDED }, BOTH)).toBe(true);
		expect(shouldEmit({ event: FAILED }, BOTH)).toBe(true);
	});

	it('drops an outcome the workflow did not ask for', () => {
		expect(shouldEmit({ event: FAILED }, [SUCCEEDED])).toBe(false);
	});

	// Either an API older than this node, or something else posting to the URL.
	it('drops a payload carrying no recognisable event', () => {
		expect(shouldEmit({}, BOTH)).toBe(false);
		expect(shouldEmit({ event: 'document_request.something_new' }, BOTH)).toBe(false);
		expect(shouldEmit({ event: 42 }, BOTH)).toBe(false);
	});

	it('drops everything when no event is selected', () => {
		expect(shouldEmit({ event: SUCCEEDED }, [])).toBe(false);
	});
});

describe('failureReason', () => {
	// The whole point of not throwing: a failed generation has to come out as
	// data the workflow can branch on, and Doclift replays anything that is not
	// a 2xx — so a raised error would arrive again, three times, over an hour.
	it('flattens the request reason and each generation reason', () => {
		const reason = failureReason({
			event: FAILED,
			error: 'le rendu a produit une page blanche',
			documents_generations: [
				{ generation_error: 'variable lastname absente' },
				{ generation_error: 'template introuvable' },
			],
		});

		expect(reason).toBe(
			'le rendu a produit une page blanche — variable lastname absente; template introuvable',
		);
	});

	it('answers on the request reason alone', () => {
		expect(failureReason({ event: FAILED, error: 'boom', documents_generations: [] })).toBe('boom');
	});

	it('never comes back empty on a failure', () => {
		expect(failureReason({ event: FAILED })).toBe('Doclift reported a failure.');
	});

	it('says nothing about a success', () => {
		expect(failureReason({ event: SUCCEEDED, error: null })).toBeUndefined();
	});
});
