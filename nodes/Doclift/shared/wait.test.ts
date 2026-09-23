import { describe, expect, it } from 'vitest';

import { classifyReentry, type PendingWait } from './wait';

const NOW = 1_000_000;

describe('classifyReentry', () => {
	it('is a first run when no wait was recorded', () => {
		expect(classifyReentry({}, NOW)).toEqual({ kind: 'first' });
	});

	// The case no end-to-end run can produce on demand: it needs a callback that
	// never arrives, and Doclift delivers in seconds.
	it('is a timeout once the deadline has passed', () => {
		const pending: PendingWait = { documentRequestId: 501, deadline: NOW - 1 };

		expect(classifyReentry(pending, NOW)).toEqual({ kind: 'timedOut', documentRequestId: 501 });
	});

	it('counts the deadline itself as passed', () => {
		expect(classifyReentry({ deadline: NOW }, NOW)).toMatchObject({ kind: 'timedOut' });
	});

	// A loop's second turn: the first already resumed through `webhook`, and its
	// deadline is still ahead. Reading it as a timeout is what used to fail the
	// second iteration on the first one's request id.
	it('is a resumption while the deadline is still ahead', () => {
		expect(classifyReentry({ documentRequestId: 501, deadline: NOW + 60_000 }, NOW)).toEqual({
			kind: 'resumed',
		});
	});

	it('clears the wait it read, whichever case it was', () => {
		const timedOut: PendingWait = { documentRequestId: 1, deadline: NOW - 1 };
		const resumed: PendingWait = { documentRequestId: 2, deadline: NOW + 1 };

		classifyReentry(timedOut, NOW);
		classifyReentry(resumed, NOW);

		expect(timedOut).toEqual({});
		expect(resumed).toEqual({});
	});

	it('reads a second time as a first run, so a loop keeps turning', () => {
		const pending: PendingWait = { documentRequestId: 1, deadline: NOW - 1 };

		classifyReentry(pending, NOW);

		expect(classifyReentry(pending, NOW)).toEqual({ kind: 'first' });
	});
});
