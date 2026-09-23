import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Doclift signs the webhook body with the application's own secret key, which
 * is the same key this node authenticates with.
 *
 * The raw body is what is signed, so it has to be compared before anything
 * reparses it: `JSON.stringify(JSON.parse(body))` reorders nothing but
 * reformats everything, and the digest no longer matches.
 */
export function signatureMatches(rawBody: string, header: unknown, secret: string): boolean {
	if (typeof header !== 'string' || !header.startsWith(PREFIX)) return false;

	const expected = Buffer.from(
		PREFIX + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'),
	);
	const received = Buffer.from(header);

	// timingSafeEqual throws on a length mismatch rather than returning false.
	return expected.length === received.length && timingSafeEqual(expected, received);
}
