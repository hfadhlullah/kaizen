# Ship: a link the client can play

## Serve
`node $S/serve.mjs .preview 4321` serves the whole folder on 127.0.0.1 for you and your agents.
`PUBLIC=1 node $S/serve.mjs .preview 8060` serves only what `tools/serve.json` (or `--config <file>`) allows:
```json
{
  "public": ["index.html", "game.html", "shared/data.js", "rounds/*.js", "assets/**"],
  "downloads": { "/download/GDD.pdf": "../docs/GDD.pdf", "/download/Cases.md": "../docs/CONTENT-REVIEW.md" }
}
```
- `*` matches one path segment and `**` any depth. Download paths are relative to the config file, and are sent as attachments.
- Old versions (`v1/`), other concepts and scratch files stay private by default. Only list what the client should see.
- The server never throws on a bad request path: `//` and a lone `%` once took the public server down.
  `node $S/serve.test.mjs` checks the path guard and the allowlist matching.
- Keep it running as a user service, so it survives your session:
  `systemd-run --user --unit <name>-web -p WorkingDirectory=$PWD -E PUBLIC=1 node $S/serve.mjs .preview 8060`, or a unit file for reboots.

## Expose
Use the `deploy-tunnel` skill if it is installed (Cloudflare tunnel to a subdomain). Otherwise any static host works for the files.
Publishing is outward-facing, so confirm with the user before the first public link.
Once it is public, every save is live: tell agents, and keep the page working at each save.

## Landing page (`index.html`)
- The play link (and a "jump to the latest part" link for reviewers), the GDD (PDF and MD), and the case list for the content owner.
- A "what's new" list per version, 3–5 lines in the user's language, from each agent's report.
- An honest note about what is simulated (other teams, the live server).

## Before the real event (unproven: plan these in the GDD build plan)
- A server-authoritative game server: it sends one case at a time, keeps the answer keys, stamps time, and decides finish and rank.
  Clients send only actions.
- Progress that survives a refresh or reconnect, one active device per account, and a moderator console (open, start, pause, end, void a case, export).
- A load test with simulated clients, tests on a cheap Android phone and an iPhone, and a full rehearsal with the hosts.
- A fallback (for example a form with the same cases) in case the server fails.
