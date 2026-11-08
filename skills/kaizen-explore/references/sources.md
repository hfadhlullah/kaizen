# Method sources and attribution

Kaizen Explore combines an interview and an evidence-gathering loop. It is not
an upstream integration or a claim that the upstream projects endorse Kaizen.

- Matt Pocock, [grilling](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/productivity/grilling/SKILL.md): prerequisite-aware decision trees, rounds of independent questions, recommendations, agent-owned factual lookups, user-owned decisions, and confirmation before action. Studied 2026-11-08. Adapted under MIT; see `../LICENSE-Matt-Pocock`.
- GPT Researcher, [architecture](https://github.com/assafelovic/gpt-researcher#architecture): form research questions, gather information, summarize with source tracking, aggregate a report. Studied 2026-11-08. This skill describes the approach in original wording; no implementation or prompt text is bundled from that Apache-2.0 project.
- David Zhang, [deep-research](https://github.com/dzhng/deep-research/blob/main/src/deep-research.ts): iterative searches informed by findings and follow-up questions, with bounded breadth and depth. Studied 2026-11-08; method reference only, no copied code.

Kaizen adds saved run state, a per-run skip, source-linked evidence, explicit
unknowns and contradictory findings, a research budget, and a handoff into Plan.
These are Kaizen design choices rather than claims about upstream behavior.
