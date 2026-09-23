import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// `n8n-node build` copies the sources to dist/, tests included, and the
		// compiled copies would run a second time against stale output.
		exclude: ['dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			include: ['nodes/**/*.ts', 'credentials/**/*.ts'],
			exclude: ['**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			// The node is small enough that every branch is reachable from a test,
			// and the ones that are not reachable have no business being there.
			thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
		},
	},
});
