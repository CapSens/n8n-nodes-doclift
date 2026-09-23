export interface PendingWait {
	documentRequestId?: number;
	deadline?: number;
}

export type Reentry =
	| { kind: 'first' }
	| { kind: 'resumed' }
	| { kind: 'timedOut'; documentRequestId?: number };

/**
 * Why `execute` is running again.
 *
 * n8n re-enters the node for two unrelated reasons, and the node context
 * cannot tell them apart on its own: the deadline went off with no callback,
 * or the node is running a second time inside a loop, the previous turn having
 * already resumed through `webhook`. The deadline separates them — past it,
 * Doclift never called back.
 *
 * Reading it is destructive on purpose: whichever case this is, the wait it
 * describes is over, and leaving it behind is what made a loop's second turn
 * fail on the first turn's request id.
 */
export function classifyReentry(pending: PendingWait, now: number): Reentry {
	if (pending.deadline === undefined) return { kind: 'first' };

	const timedOut = now >= pending.deadline;
	const documentRequestId = pending.documentRequestId;

	delete pending.deadline;
	delete pending.documentRequestId;

	return timedOut ? { kind: 'timedOut', documentRequestId } : { kind: 'resumed' };
}
