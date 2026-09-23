import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// `n8n-node build` copies the sources to dist/, tests included, and the
		// compiled copies would run a second time against stale output.
		exclude: ['dist/**', 'node_modules/**'],
	},
});
