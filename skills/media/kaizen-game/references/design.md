# Design: brief, concepts, GDD

## Brief: ask before anything is built
One message, grouped, with a default for each question so the user can answer "defaults are fine".
- **The game.** Genre or reference feel (described by mechanic, not by a game to copy), 2D or 3D, session length, solo or multiplayer, and what makes a player come back.
- **Track.** Just a game, or an event / learning game with real content (see below)?
- **Players.** How many, solo or teams, one device each? Phone, laptop or both (default: phone first, laptop works)?
- **Setting.** A live event (a fixed time, a host, everyone at once, rankings) or played anytime? How long, and how many rounds?
- **Client** (event / learning). The organisation, its sector, the unit that owns the content, and the person who signs it off.
  Ask this first. Content written before the sector is known has to be rewritten: bank wording for an insurer, civil-servant rules for a state company.
- **Purpose.** What should players learn, practise or prove? What counts as winning?
- **Channel.** Zoom, Teams, a stage screen? Who shares what? (On the real project, Zoom was used by moderators only. Players played in their own browser.)
- **Language and tone.** The players' language, and everyday office or playful.
- **Brand and limits.** Logo, colours, real places to include, devices that must work, hosting rules, the event date.

Write the answers into GDD section 1 and keep the unknowns in section 14 (open questions).

## Concepts
When the direction is open, use `kaizen-concept`. What worked:
- Three truly different concepts, not one idea in three skins. For example: case files and stamps, a 3D toy town, a TV game show.
- All three share one `shared/data.js` (teams, sample cases, a `simulateRound`), so they are compared on design and not on content.
- Each concept plays its signature round to the result by real input, and has a spectator view for the shared screen.
- One review page with a vote per concept. The user picked one, then asked for two separate passes:
  a UI pass ("follow Apple philosophy") and a richness pass (CC0 models and sound). Offer them as separate steps.

## Every game
- **Core loop** in one line (for example: run, dodge, collect, reach the goal). If it is not fun with the scoring removed, fix the loop first.
- **Controls on both devices.** Touch first (tap, swipe, hold, drag), with laptop keys as a bonus. No control may require a keyboard on a phone.
- **Win state, fail state, and feedback** under 1 s for every action.
- **Difficulty** rises across a session or level. Write the tuning knobs (speed, spacing, timers) in the GDD so they can be adjusted without redesign.
- **Juice where it counts.** Small camera kicks, particles, sound on every action, and a short slow-motion beat on big moments. Respect reduced motion.

## Event / learning track: not a quiz in a skin
The user rejected "Kahoot style" outright. In every round:
- The question is a **situation inside the game**: a vendor holding out a parcel on the street, a visitor without a badge, an email in the inbox.
- The answer is an **action**: dodge or collect, stop or let through, flag or open, put away, choose a path.
- Skill (speed, aim, timing) and knowledge both count, and knowledge decides.
- A text question is allowed only as a short checkpoint inside the action, such as a gate with three lanes. It never fills a whole screen.

## Shared systems for the event / learning track (state once in the GDD)
- **Case model.** `{ id, prompt, action, reason, source }`, in play order, the same for every player.
  `reason` is one line a player understands. `source` names the real rule.
- **Ranking.** Cases solved first, then time with a fixed penalty per wrong action (for example 5 s), then fewer wrong actions.
  Points per rank (for example 100, minus 3 per place, minimum 10). Top N go to a harder final. Add tie-breaks.
- **Cosmetic pickups** (coins) are shown on the result only and never change the ranking.
- **First result counts.** Replays are labelled as practice and leave the standings unchanged. Finals have no replay.
- **Answer review** after every round lists the round's cases with the correct action, reason and source, and highlights the player's mistakes.
  This is the learning moment and the host's talking point. Build it from the solved and missed case sets, not from the order of play.
  Otherwise a timeout or cases solved out of order give wrong rows.
- **Difficulty curve.** Obvious cases first and subtle ones last (a near-identical domain). The final is clearly harder than any round.
- **Fairness pillar.** The same content and the same clock for everyone. Timing never depends on the video call (Zoom lags 1–3 s).

## GDD skeleton (`docs/GDD.md`)
```
# <Name>: Game Design Document
Version, date, status line, client and content owner.
1. One-page overview: pitch, track, players, session or event shape, pillars, anti-pillars
2. Event format and run-of-show (live events only): table of time, segment, player screen, shared screen
3. Core loop and shared systems: loop diagram, scoring, progression, character, difficulty curve
   (event / learning: case model, ranking, pickups, answer review)
4..N. One section per game, level or round:
   Building or place, genre, what it teaches
   Fantasy: one line
   How it plays: controls on phone and on laptop, what the player does each second
   Objects, enemies, obstacles (event / learning: the cases in the world, and the correct action for each)
   Level or case data shape; fixed totals where times must be comparable
   Feedback: correct and wrong, both under 1 s so play keeps flowing
   Spectator: what the shared screen shows
   Tuning knobs, edge cases (reconnect, hidden tab), effort S/M/L
N+1. Final
.. Screens and UI: table of screen and purpose; design language
.. Tech, content, accessibility: stack, server-authoritative rules, assets and sizes, performance targets, content pipeline
.. Build plan: steps and the result of each
.. Risks and fallback (phones, network, server, content errors, disputes, call delay)
.. Open questions for the client
```
Write each game section so another agent can build it without asking anything. The real project's sub-agents built five games in parallel from their sections alone.

## Originality
Genres and mechanics are free to use: a 3-lane runner, a memory match, a word search. Names, characters, art, music and levels are your own.
Never recreate a specific existing game, even when it is renamed. Kenney CC0 packs give a consistent toy look that belongs to nobody.
