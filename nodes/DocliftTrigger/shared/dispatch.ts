import type { IDataObject } from 'n8n-workflow';

export const SUCCEEDED = 'document_request.succeeded';
export const FAILED = 'document_request.failed';

/**
 * Whether a callback is one this trigger was asked to react to.
 *
 * A payload without a recognised event is ignored rather than emitted: it is
 * either an older API than this node knows, or something else posting to the
 * URL, and neither is a document a workflow should act on.
 */
export function shouldEmit(payload: IDataObject, events: readonly string[]): boolean {
	const event = payload.event;
	if (typeof event !== 'string') return false;

	return events.includes(event);
}

/**
 * The reason a generation failed, flattened from the two places it is written:
 * the request carries what went wrong overall, each generation what went wrong
 * for it. A workflow branching on `event` should not have to walk both.
 */
export function failureReason(payload: IDataObject): string | undefined {
	if (payload.event !== FAILED) return undefined;

	const generations = (payload.documents_generations as IDataObject[]) ?? [];
	const perDocument = generations
		.map((generation) => generation.generation_error)
		.filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
		.join('; ');

	const request = typeof payload.error === 'string' ? payload.error : undefined;

	return [request, perDocument].filter(Boolean).join(' — ') || 'Doclift reported a failure.';
}
