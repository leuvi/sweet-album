import { defineConfig } from 'vitest/config'

// Standalone so vitest does not inherit the demo-server root from vite.config.ts
// (vitest runs the config in `serve` mode).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Pure-function suites — one worker is plenty and keeps memory flat.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
})
