# Docker images — open issues

Results with the published images:

| Check | Result |
| --- | --- |
| Migrations applied at api start | 56 |
| api `/api/auth/ok` | 200 |
| app `/` | 307 → `/sign-in` |
| app `/sign-in` | 200 |
| app → api | 200 |
| app → agent | 401 (correct: no credentials) |
| Errors in the logs | 0 |

## Issues

1. RISK — Anyone can use the agent without auth by sending `Host: localhost`. `localDev()` in `apps/agent/agent/channels/eve.ts` trusts that header. A public agent port exposes the agent.
   Fix: not done. Use `localDev()` only outside production.
2. RISK — The API address is fixed when the app image is built. The published app image calls `http://localhost:3001` and fails anywhere else.
   Fix: set the repository variable `NEXT_PUBLIC_API_URL`. Choosing the address at start time is not done.
3. RISK — The Release workflow puts each release on `release` with `GITHUB_TOKEN`. Changes that token makes do not start other workflows, so the Docker workflow does not run.
   Fix: set the `AUTOMATION_TOKEN` secret, or start the Docker workflow by hand in the Actions tab.
4. RISK — The agent and the app start before the api finishes the migrations. Their first database queries fail.
   Fix: documented in `docs/setup.md`: start the api first. No health check makes them wait.
5. RISK — The app image is large: 4.7 GB unpacked. It keeps all packages, because Next.js links to exact package paths from the build.
   Fix: not done. Next.js `output: "standalone"` makes it smaller, but it needs a change to `next.config.ts`.
6. NOT DONE — The workflow builds only `linux/amd64`. There are no ARM images.
7. NOT DONE — There is no pull request. The fork has no `main` branch. The commit has no Median task ID, because the repo has no `.median/config.json`.
8. UNKNOWN — The GHCR package visibility (public or private) is not confirmed. The gh token does not have the `read:packages` scope.
9. UNKNOWN — A real sign-in and an agent research run are not tested. The test had no Google credentials and no model key.
10. BROKEN — `git push` over HTTPS fails for workflow files. The gh token does not have the `workflow` scope.
    Fix: push over SSH, or run `gh auth refresh -h github.com -s workflow`.
