import { defineConfig, devices } from '@playwright/test';

// Each worktree gets its own port (derived from its path) and always starts its own server, so a
// run never tests another worktree's build. Override with PW_PORT.
const PORT =
  Number(process.env.PW_PORT) ||
  4200 + ([...process.cwd()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 700);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
