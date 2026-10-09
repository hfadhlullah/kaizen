# Kaizen Bot computer: discovery

Date: 2026-10-09. Status: discovery done, pilot not started. Nothing here commits to a
provider or changes the bot.

Later: the local pilot (2026-10-09) folded the spike into `bot/pilot/`; the `docs/spike/` paths below are as they were. Its results are in `docs/bot-computer-pilot-report.md`.

## Recommendation

**Go, for the pilot as scoped.** Shell plus a headless browser does the pilot task; a
desktop is not needed. The isolation controls the request asks for were all built and
tested on a local disposable sandbox and held in 3 of 3 runs. Run the pilot on **E2B**
(first choice) or **Daytona**, both priced at about $0.05 per vCPU-hour, keeping the
egress proxy from the spike in front of either one, because neither provider's own
allowlist re-checks the address a hostname resolves to.

Two things stay open until the pilot proves them on the chosen provider: encrypted
suspend (stop), and deletion guarantees on their side. Both are cited from vendor
docs below, not tested.

## Pilot task

**Web research to file.** The Bot opens allowlisted test pages, extracts what it needs,
runs a script over it, and returns a CSV and a screenshot. It exercises shell, workspace
files and the browser, and writes nothing to the outside world.

## Shell plus browser, or desktop?

Shell plus headless browser is enough. `docs/spike/bot-sandbox/task.sh` runs the pilot
task in headless Chromium inside the sandbox, with no window manager, in about 1.1 s,
and returns `page.csv` and `page.png`. A desktop would be needed only for apps with no
headless mode or sites that refuse headless browsers; the pilot task has neither.

## Provider options

Cited from vendor docs and pricing pages on 2026-10-09; prices change, recheck before
the pilot. "Tested" means tested in this spike; every provider row is cited, untested.

| Option | Isolation | Egress control | Price (compute) | Fit |
|---|---|---|---|---|
| **E2B** | Firecracker microVM per sandbox | `allowOut`/`denyOut` by IP, CIDR or domain; domain rules need deny-all; opens 8.8.8.8 for DNS when a domain is used | $0.0504 /vCPU-h + $0.0162 /GiB-h, per second | Best fit: microVM, per-second, pause/resume |
| **Daytona** | Container sandboxes on Daytona runners | `networkBlockAll`, `networkAllowList` (max 5 CIDRs), domain allowlist | $0.0504 /vCPU-h | Good; CIDR list is small |
| **Modal** | gVisor | `block_network`, `cidr_allowlist` (CIDR only) | $0.00003942 /core-s (≈ $0.142 /core-h) + $0.00000672 /GiB-s | Works; dearer, CIDR only |
| **Fly Machines** | Firecracker microVM | No managed egress allowlist; bring your own proxy | shared-cpu-1x 1 GB ≈ $0.0079 /h, egress from $0.02/GB | Cheapest, most to build ourselves |
| **Self-hosted Docker (spike)** | Container, seccomp default, no caps | Internal network + allowlisting proxy (tested) | Our own machine | Proves controls; container is weaker than a microVM, not for the pilot's untrusted pages long-term |

Sources: [E2B price](https://docs.e2b.dev/faq/calculate-sandbox-price),
[E2B internet access](https://e2b.dev/docs/network/internet-access),
[Daytona pricing](https://www.daytona.io/pricing),
[Daytona network limits](https://www.daytona.io/docs/en/network-limits),
[Modal sandbox networking](https://modal.com/docs/guide/sandbox-networking),
[Modal sandbox pricing](https://modal.com/docs/guide/sandbox-resources.md),
[Fly pricing](https://fly.io/docs/pricing/).

## Threat and isolation model

**What we protect:** the user's machine and network, cloud metadata and credentials,
the test credentials the task uses, other tasks' data, and the outside world from
unapproved writes.

**Who attacks:** a web page the Bot opens (prompt injection, malicious redirects), code
the Bot writes or runs (including a compromised package), and the Bot itself acting on
injected instructions.

| Threat | Control | Status |
|---|---|---|
| Escape to the host | Disposable sandbox, uid 1000, read-only root, no capabilities, `no-new-privileges`, no host mounts, no docker socket | Tested (container); microVM cited |
| Exhausting the host | CPU 1, memory 768 MB, pids 256, workspace 200 MB tmpfs, 15 min lifetime | Tested |
| Reaching private networks or metadata | Sandbox network has no route out; all egress through one proxy | Tested |
| Allowlisted name pointing at a private address, DNS rebinding | Proxy resolves once, refuses any non-global address, connects to that exact IP | Tested (static private answers); a TTL-flipping rebind is covered by design, not by a test |
| Redirect from an allowed site to a forbidden one | Every hop goes through the proxy and is checked again | Tested |
| Secrets leaking | No secrets in env, prompts, logs or artifacts; pilot uses none (public test pages). If a later task needs one, the proxy adds it to the outbound request so the sandbox never holds it | Design |
| Browser logins persisting | Browser profile lives in the sandbox's tmpfs and dies with it | Tested |
| Unapproved external write | Proxy reaches test domains only (tested); the pilot adds a rule refusing anything but GET and HEAD (design: the spike proxy does not yet check methods, and cannot see inside HTTPS without terminating it); any write is a card the user approves (the bot's existing `propose_*` card pattern) | Design |
| Malicious artifact | Export allowlists type by content (png, csv, txt), caps size (5 MB) and count (20) | Tested; malware scan not yet (see gaps) |

Chromium's own sandbox is off inside the container (`--no-sandbox`), because it needs
user namespaces the locked-down container does not grant. The container or microVM is
the boundary. That is normal for headless Chromium in containers, and one more reason to
pilot on a microVM.

## Lifecycle

States shown to the user, mapping onto the bot's existing card states:

| Sandbox state | Card | Meaning |
|---|---|---|
| starting | Working | Being created |
| running | Working | Task in progress |
| stopping | Working | Exporting artifacts, then deleting |
| stopped | Done | Deleted; artifacts saved |
| error | Failed | What failed and whether cleanup finished |

- **Stop** (suspend): the provider's pause/snapshot, kept at most 30 minutes, then
  deleted. Not used in the pilot task, which finishes in one go; tested in the pilot on
  the chosen provider.
- **Delete:** remove the sandbox, then confirm it no longer exists. In the spike the
  workspace and browser profile are tmpfs, so they never touch disk. Tested.
- **Cleanup on every exit:** the runner's exit trap cleans up on completion, error and
  cancel (tested with SIGTERM). When the runner itself dies (tested with SIGKILL), every
  sandbox carries an expiry label and `sweep.sh` removes expired ones and their network.
  Tested.
- **Export failures are reported**, not hidden: the spike's first runs failed to export
  and said `export failed: page.csv`.

## Spike results

`docs/spike/bot-sandbox/run.sh` on this machine (Docker 29.8, 3 runs, all passed):

| Measure | Result |
|---|---|
| Provisioning (create to running) | 758–787 ms |
| Pilot task | 1045–1177 ms |
| Probes passed | 28 of 28, each run |
| Cleanup | 0 containers and 0 networks left after each run, after cancel, and after a killed runner plus sweep |

Probes: non-root, read-only root, no host mounts, no docker socket, no capabilities, no
sudo, memory cap, workspace cap, pids cap; direct access to a public IP, metadata
(169.254.169.254), the Docker host gateway, 10/8, 192.168/16, IPv6 loopback and
link-local, and outside DNS all blocked; through the proxy, an allowlisted site
reachable over http and https, a non-allowlisted site, metadata, loopback, three
allowlisted names that resolve to private or metadata addresses, a non-web port, and two
redirects from an allowed site to forbidden targets all blocked.

Bugs the spike found and fixed: a shell fork loop pinned the pids cap and starved the
next step (busybox `sh` retries failed forks); Chromium needs a writable `HOME`;
`docker cp` cannot read tmpfs, so export streams files out instead.

## Expected cost

Pilot: 1 Bot, 1 user, about 200 tasks, 1 vCPU and 1 GiB each, up to 5 minutes billed.
On E2B: 200 × (5/60) h × ($0.0504 + $0.0162) ≈ **$1.11** compute, plus the proxy host
(any small VM, a few dollars a month). Model tokens cost more than the computer.

## Proposed pilot thresholds

To agree before the pilot starts (acceptance criterion 9):

1. Provisioning p95 under 10 s.
2. Task success at least 95% over at least 100 tasks.
3. Cleanup 100%: no sandbox alive past its expiry plus one sweep interval (1 minute).
4. Isolation probes 100% passing on the provider, run at the start of every pilot day.
5. Zero unapproved external writes in the proxy log.
6. Zero security findings at high or critical.
7. Compute under $10 for the whole pilot.

## Gaps the pilot must close

- Run the same probes against the chosen provider, not only local Docker.
- Stop: encrypted suspend and its 30-minute TTL on the provider.
- Delete: what the provider guarantees about disk and snapshots after deletion.
- A malware scan (ClamAV) on export, in place of the content-type check alone.
- A DNS rebinding test with a server that changes its answer between lookups.
- The bot side: a `computer_task` tool on Tech Lead only, behind an approval card.

## Next run

On a go: one kaizen run that adds the `computer_task` tool and its card, runs the
sandbox on the chosen provider behind this proxy, and reports against the thresholds
above. Anything beyond that one pilot is a separate decision, made from its report.
