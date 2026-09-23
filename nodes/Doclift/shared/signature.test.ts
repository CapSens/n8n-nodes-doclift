import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { signatureMatches } from './signature';

const SECRET = 'a-secret-key';
const BODY = '{"event":"document_request.succeeded","id":42}';
const sign = (body: string, secret = SECRET) =>
	'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('signatureMatches', () => {
	it('accepts what Doclift signed', () => {
		expect(signatureMatches(BODY, sign(BODY), SECRET)).toBe(true);
	});

	it('refuses a body that changed by one character', () => {
		expect(signatureMatches(BODY.replace('42', '43'), sign(BODY), SECRET)).toBe(false);
	});

	it('refuses a signature made with another key', () => {
		expect(signatureMatches(BODY, sign(BODY, 'another-key'), SECRET)).toBe(false);
	});

	// A reparsed body is a different byte string, which is how this check starts
	// rejecting everything if the raw body is ever lost.
	it('refuses a body that was reparsed and restringified', () => {
		const reparsed = JSON.stringify(JSON.parse(BODY), null, 2);

		expect(signatureMatches(reparsed, sign(BODY), SECRET)).toBe(false);
	});

	it('refuses a missing, empty or unprefixed header', () => {
		expect(signatureMatches(BODY, undefined, SECRET)).toBe(false);
		expect(signatureMatches(BODY, '', SECRET)).toBe(false);
		expect(signatureMatches(BODY, sign(BODY).slice(7), SECRET)).toBe(false);
	});

	// timingSafeEqual throws on a length mismatch rather than answering false.
	it('refuses a header of the wrong length without throwing', () => {
		expect(signatureMatches(BODY, 'sha256=abc', SECRET)).toBe(false);
	});
});
