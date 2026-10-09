# Computer pilot (local)

One Tech Lead agent in Kaizen Bot can propose a **computer task**: read 1–3 allowlisted
test pages in a throwaway Docker sandbox on this machine, and bring back a screenshot of
each page plus a CSV of its text. Nothing runs until you click Approve on the card.
This is a pilot. Going further (cloud, other agents, other tasks) needs a separate decision.

## What runs where

| Part | Image | Notes |
|---|---|---|
| Sandbox | `kz-pilot-sandbox` (`Dockerfile`) | Headless Chromium, uid 1000, read-only root, no capabilities, 1 CPU, 768 MB, 256 pids, 200 MB tmpfs `/work` and `/tmp`, no mounts, internal network only |
| Egress proxy | `kz-pilot-proxy` (`proxy/`) | mitmproxy + `addon.py`: terminates TLS; CONNECT name, SNI and Host must match an allowlisted name; GET/HEAD only, no body, no upgrade; resolves once and dials only public addresses; logs one JSON line per decision |
| Test site | `kz-pilot-fixture` (`fixture/`) | `http://fixture.test/` on the sandbox network: a table, a list, a form, two redirects |
| Virus scan | `clamav/clamav:stable` | `clamscan` over the exported files, no network, read-only mount of the staging folder |

The allowlist is `proxy/allowlist.json`, read by the proxy and the bot alike.
Each task gets its own network, proxy, test site and sandbox, all labelled
`kaizen.sandbox=1`, `kaizen.card=<card id>` and `kaizen.expires=<unix time>`.

## Set up

```sh
docker pull clamav/clamav:stable
bot/pilot/setup.sh        # creates the proxy CA in bot/data/pilot-ca, builds the three images, runs the policy tests
```

Then in Kaizen Bot: **Settings → Computer pilot**, pick the Tech Lead agent and tick the box.

## Kill switch

Untick **Settings → Computer pilot**. Approvals are refused, the tool is no longer
offered, and a running task is cancelled (its sandbox is removed). By hand:

```sh
docker ps -aq --filter label=kaizen.sandbox=1 | xargs -r docker rm -f
docker network ls -q --filter label=kaizen.sandbox=1 | xargs -r docker network rm
```

## Cleanup

- Every task, however it ends (done, error, timeout after 3 minutes, cancel), removes
  its containers and network and then checks that nothing labelled with its card is left.
  A delete it cannot confirm turns the card into an error.
- The sandbox's own command is `sleep 600`, so it ends by itself after 10 minutes.
- Kaizen Bot sweeps on start and every minute: anything labelled `kaizen.sandbox=1` that
  is past its expiry, or whose task is not running in this server, is removed. A card
  left running by a stopped server is marked failed on the next start.
- There is no suspend. "Stopping" means saving the files, then deleting.

## Evidence

```sh
bun test                              # in bot/: the runner, the card and the server routes, with a fake docker
docker run --rm --network none -w /pilot --entrypoint python3 kz-pilot-proxy test_addon.py
bun pilot/run-pilot.ts 50 out.json    # in bot/: probes, 50 tasks, then cancel/timeout/error/SIGKILL paths
```

`run-pilot.ts` uses a scratch database and data folder, never the real `bot.db`.
Per task, the proxy's log is kept at `data/computer-logs/<card id>.jsonl` and the files
at `data/artifacts/<card id>/`.
