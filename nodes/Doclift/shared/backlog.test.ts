import { describe, expect, it } from 'vitest';

import { isSaturation, retryAfterSeconds } from './backlog';

describe('isSaturation', () => {
	it('recognises the 429 wherever the helper puts the code', () => {
		expect(isSaturation({ response: { status: 429 } })).toBe(true);
		expect(isSaturation({ statusCode: 429 })).toBe(true);
		expect(isSaturation({ httpCode: '429' })).toBe(true);
	});

	it('leaves every other failure alone', () => {
		expect(isSaturation({ response: { status: 422 } })).toBe(false);
		expect(isSaturation(new Error('socket hang up'))).toBe(false);
		expect(isSaturation(undefined)).toBe(false);
	});
});

describe('retryAfterSeconds', () => {
	it('honours what the server asked for', () => {
		expect(retryAfterSeconds({ response: { headers: { 'retry-after': '3' } } })).toBe(3);
	});

	it('reads the header whatever its casing, and a repeated one', () => {
		expect(retryAfterSeconds({ response: { headers: { 'Retry-After': 2 } } })).toBe(2);
		expect(retryAfterSeconds({ response: { headers: { 'retry-after': ['4'] } } })).toBe(4);
	});

	// A header is an input: absent, zero or nonsense must not stall a workflow
	// for ever, and neither must a very large value.
	it('falls back to a second when the header says nothing usable', () => {
		expect(retryAfterSeconds({})).toBe(1);
		expect(retryAfterSeconds({ response: { headers: { 'retry-after': '0' } } })).toBe(1);
		expect(retryAfterSeconds({ response: { headers: { 'retry-after': 'soon' } } })).toBe(1);
	});

	it('caps a header that would park the execution', () => {
		expect(retryAfterSeconds({ response: { headers: { 'retry-after': '86400' } } })).toBe(60);
	});
});
