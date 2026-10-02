# Kaizen Bot

A chat front end for your kaizen board, with AI teammates for every division.

Ask **Chief** what's waiting on you, what's running, and what a plan or review says.
Give division agents (Sales, Marketing, Customer Service, Account Manager) their team's
asks; they turn them into board ideas and runs in their own project. The board still does
the real work: kaizen's plan → approval → build → review loop.

Every action an agent takes shows up in the chat as a **card** with a status:
Action needed, Working, Done, Declined or Failed.

- **On its own word** an agent may read the board, add an idea, add a note, remember a fact
  and draft a message. Each one leaves a card.
- **Only after you click Approve on its card** does anything start a run, approve or revise
  a plan, fix findings or abandon a run. The card shows exactly what will happen. Kaizen Bot
  never turns on Yolo and never commits.
- **A started run's card stays live**: its stage and work list tick along, it asks you right
  in the chat when the run waits on a plan or final approval, and it ends Done with the
  review's verdict. **Open in board** jumps to the run.
- **Drafts** (emails, posts, replies) are cards too. Nothing is ever sent: approve one, then
  copy it, or export all approved drafts as Markdown from Settings.

## Run it

Needs [Bun](https://bun.sh) 1.1 or newer and the kaizen board. No packages to install.

```sh
kaizen web                # the board, on http://127.0.0.1:7420
cd bot                    # in the kaizen repo
cp .env.example .env      # then set PROVIDER, MODEL and that provider's key
bun start                 # Kaizen Bot, on http://127.0.0.1:7430
```

Open http://127.0.0.1:7430. Chief is there from the start; pick its default project in
its side panel (the panel icon, top right), then ask: *what's waiting on me?*
Press **+** on the left for a new chat: pick an agent, or create one from a division.

Type and press **Enter** to send (**Shift+Enter** for a new line), or press the mic and
speak.

## Settings

The round button at the bottom left. The model is set here, not shown on the main screen.

| `PROVIDER`  | Key in `.env`       | `MODEL` example                                  |
|-------------|---------------------|--------------------------------------------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` (the default if left empty)  |
| `openai`    | `OPENAI_API_KEY`    | `gpt-4.1`                                        |
| `requesty`  | `REQUESTY_API_KEY`  | `anthropic/claude-haiku-4-5`                     |

Switching the model in Settings sends one tiny test message first and keeps the old model
if it fails. Only providers whose key is in `.env` can be picked. The server will not start
if the chosen provider's key or model is missing, and says which.

The board address (`BOARD_URL`, default `http://127.0.0.1:7420`) can be changed in Settings
too. It must be a `http://127.0.0.1:<port>` or `http://localhost:<port>` address.

## Privacy

- **Your messages go to the model provider.** What you type, what agents read from the board,
  and what they remember is sent to it on each message. With Requesty the router sees it too.
- **Dictation stays in your browser.** The mic runs Whisper (base, about 80 MB). It is
  downloaded once, on your first press, from huggingface.co and cdn.jsdelivr.net, and cached.
  Nothing is fetched from another site when the page loads, and your audio never leaves the
  browser.
- **Keys stay in `.env`.** They are never stored in the database or sent to the page.
- Both servers listen on `127.0.0.1` only.

## Where things live

- `data/bot.db`: agents, messages, cards, drafts, memories and settings (SQLite). Upgrading
  from the first version backs it up to `data/bot.db.bak` first. Delete it to start over.
- `src/board.ts`: every call to the board, each citing the kaizen `cli/web.ts` route it uses.
  The board's routes are internal to kaizen, so a kaizen release can change them; this file
  is where that would show.
- `src/roles.ts`: the division roles as data (name, colour, prompt, tools, and what each will
  never do without your yes). Add a division by adding an entry there.

## Test

```sh
bun test
```
