# Kaizen Bot computer: local pilot report

Date: 2026-10-09. Scope: one Tech Lead agent, one task type, local Docker on this PC
(12 cores, 30 GB RAM, Docker 29.8). No cloud, no spend. How to run it: `bot/pilot/README.md`.
Raw numbers: `.kaizen/runs/2026-10-09-bot-computer-pilot/attachments/pilot-50.json`
(local run state, not committed), reproduced with `bun pilot/run-pilot.ts 50` in `bot/`.

**This report does not authorize anything further.** A cloud stage, another agent, or another
task type is a separate decision for Husein.

## Verdict

The PC and the flow are good enough. 50 of 50 tasks succeeded, every sandbox was removed
and confirmed gone on every exit path, all 40 isolation probes passed, and no write
reached the outside world. The slow part is the export step (copy, type checks, virus scan), about 7 of the
10 seconds a task takes; the scan's database load is most of it.

## Against the thresholds

| Threshold (approved plan) | Measured | Pass |
|---|---|---|
| Task success ≥ 95% over 50 tasks | 50 / 50 (100%) | yes |
| Sandbox start p95 < 3 s | p50 0.82 s, p95 1.47 s | yes |
| All probes pass before the session | 40 / 40 | yes |
| 0 non-GET/HEAD let through in the proxy log | 0 of 237 allowed requests | yes |
| Nothing left after every exit path, within one sweep | 0 after each of 50 tasks, cancel, timeout, error; 4 left by a SIGKILLed runner, all 4 removed by the sweep | yes |
| Peak sandbox RAM ≤ 768 MB, CPU ≤ 1 core | peak 155 MB; at most 3.2 CPU-seconds per task under a 1-CPU cap | yes |

Per task (50 tasks, 1–3 pages each): total p50 10.2 s, p95 11.8 s. Of that, the sandbox
start takes 0.8 s, the pages 1.3 s (p95 3.3 s), and export plus the virus scan 6.8 s (p95 7.1 s).
Host load average went from 2.8–3.4 to 3.4–4.0 over the 9-minute run, with other work
running on the PC; it stayed usable.

## Exit paths

| Path | How it was caused | Card | Left behind |
|---|---|---|---|
| Done | 50 normal tasks | Stopped | 0 |
| Cancel | Cancel clicked while running, through the server route | Error: "cancelled by you; the sandbox was removed" | 0 |
| Timeout | task deadline set to 0.3 s | Error: "timed out after 0.3 s …" | 0 |
| Error | the task's exec answers a failure; real containers | Error: "the task failed: simulated task failure" | 0 |
| Runner killed | SIGKILL while running, so no cleanup code ran | — | 4 (sandbox, proxy, test site, network) until the sweep, then 0 |

The bot server also marks a card left running by a stopped server as failed on its next start
(tested with a fake docker).

## Security

- **Isolation probes, in the sandbox, 40 of 40:**
  - **Sandbox controls:** non-root, read-only root, no host mounts, no docker socket, no capabilities, no sudo. The memory, workspace and pids caps all hold.
  - **Direct egress:** blocked to a public IP, metadata, the Docker host gateway, private ranges, IPv6 loopback and link-local, and outside DNS.
  - **Through the proxy, reachable:** only the allowlisted sites and the test site.
  - **Through the proxy, blocked:**
    - non-allowlisted sites, metadata, loopback, IPv6 loopback, a non-web port, https to the test site;
    - domain fronting (Host ≠ CONNECT name, Host ≠ URL host, SNI ≠ CONNECT name);
    - POST (http and https), PUT, DELETE, GET with a body, websocket upgrade;
    - redirects to an off-list site and to metadata;
    - a name that resolves to loopback.
- **Proxy policy unit tests (6 groups):** cover private, loopback, link-local, metadata, ULA and IPv4-mapped answers for an allowlisted name, and a resolver that flips from public to private between lookups.
- **The shared-IP / domain-fronting gap from discovery is closed:** the proxy terminates TLS and requires the CONNECT name, SNI and Host to be the same allowlisted name. It verifies the real site's certificate for that name. It dials only an address it resolved and checked itself.
- **No writes left the sandbox:**
  - Every one of the 237 allowed requests was a GET or HEAD.
  - The 418 refusals are almost all Chromium's own background calls (Google update, accounts, autofill), refused as not allowlisted.
- **Findings:**
  - **Medium:** a GET's query string can still carry data to an allowlisted host. The pilot allowlist is static public test pages and a local fixture, so nothing reads it, but any future allowlisted site that acts on GET would turn this into a write path. Keep the allowlist to read-only pages.
  - **Low:** the sandbox is a container on the user's own PC, a weaker boundary than a VM. Acceptable for public test pages with no secrets on the box; a VM boundary is a question for any later stage.
  - **Low:** the proxy's CA private key sits in `bot/data/pilot-ca` and in the local proxy image. It is trusted only inside pilot sandboxes, never on the host.
- **Secrets:** none are used. No logins, and the browser profile is in tmpfs and dies with the sandbox. The proxy log has no headers, bodies or query strings.

## Stop and delete

- **Suspend:** none. Stopping means saving the files, then deleting.
- **Delete:** `docker rm -f` of the three containers and `docker network rm`, then a check that nothing labelled with the card remains; a delete that cannot be confirmed is shown as an error. The workspace and browser profile are tmpfs, so nothing of the sandbox reaches disk.
- **Expiry:** the sandbox's own process ends after 10 minutes. The sweeper (bot start and every minute) removes anything past its expiry or not running in this server.

## Live screen (added after the first review)

The user watches the bot work, as in a screen share:
- **The browser:** a normal Chromium window on a virtual screen in the sandbox. The bot types each URL into the address bar, the page loads, and the text and the screenshot come from that same window.
- **The video:** about 8 frames a second goes to the card, with a line saying what the bot is doing. View only: nothing goes back into the sandbox.
- **Over 5 tasks:** task time p50 7.4 s (1.3 s with no live view), total p50 15.9 s, peak sandbox RAM 410 MB (cap 768 MB).
- **Checks:** probes 40/40, 0 leftovers on every exit path, 0 writes allowed.
- **Not scanned:** frames are length-capped and JPEG-checked but not virus-scanned, since they are shown and never stored.

## Not done in this pilot

- OpenSandbox was not evaluated (declined at the plan approval).
- No real user session through the chat yet: the 50 tasks went through the same approve route the page calls, but driven by a script, not by a model choosing to propose them.
- The virus scan loads its database per task (~7 s). A long-lived `clamd` would cut that; not needed for a pilot.
