export const SATURATED = 429;
const FALLBACK_SECONDS = 1;
const CEILING_SECONDS = 60;

interface HttpFailure {
	httpCode?: string | number;
	statusCode?: number;
	response?: { status?: number; headers?: Record<string, unknown> };
}

/**
 * Doclift answers 429 when the organization already holds every synchronous
 * slot it is allowed — five by default, and generations free them as they
 * finish, so saturation is usually a matter of seconds.
 */
export function isSaturation(error: unknown): boolean {
	const failure = error as HttpFailure;
	const code = failure?.response?.status ?? failure?.statusCode ?? Number(failure?.httpCode);

	return code === SATURATED;
}

/**
 * How long the server asked us to wait. It sends `Retry-After` in seconds and
 * is the only thing that knows when a slot frees, so it is honoured rather
 * than guessed — bounded all the same, because a header is an input.
 */
export function retryAfterSeconds(error: unknown): number {
	const headers = (error as HttpFailure)?.response?.headers ?? {};
	const raw = headers['retry-after'] ?? headers['Retry-After'];
	const seconds = Number(Array.isArray(raw) ? raw[0] : raw);

	if (!Number.isFinite(seconds) || seconds <= 0) return FALLBACK_SECONDS;

	return Math.min(seconds, CEILING_SECONDS);
}
