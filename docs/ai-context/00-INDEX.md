# Project Knowledge Index

Persistent knowledge base for backrooms-game — a browser found-footage horror game set in
Level 0 of the Backrooms (TypeScript + Vite + Three.js). Plain Markdown — readable by Claude
Code, Obsidian (open `docs/ai-context` as a vault), your editor, and Git.

## Core context

- [[01-PRODUCT]] — Purpose, users, game rules
- [[02-ARCHITECTURE]] — Stack, components, data flows
- [[03-DECISIONS]] — Confirmed decisions (append-only)
- [[04-CURRENT-STATE]] — What exists now, verified
- [[05-NEXT-STEPS]] — Prioritised remaining work
- [[06-KNOWN-ISSUES]] — Bugs, limitations, technical debt

## Reading rules

Read 01, 02, 04 and 05 in full at the start of a session; **grep** 03 and 06 for the area you
are touching. Live repo facts come from `.claude/hooks/context_facts.py`, never from a doc.

## Detailed documentation (read on demand)

| Document | When to read it |
|---|---|
| `README.md` | Player-facing summary, controls, URL flags, deploy options |
| `CLAUDE.md` | Vision, architecture rules, look reference, conventions (parts stale — see 06) |
| `docs/superpowers/specs/2026-09-24-level-0-design.md` | **Design source of truth**: world, player systems, threats, VHS, testing, scope |
| `docs/superpowers/plans/2026-09-24-milestone-{1..5}-*.md` | How each milestone was built (walkable map, VHS camcorder, escape loop, threats, polish & ship) |
| `docs/superpowers/plans/2026-09-25-visual-overhaul.md` | Visual overhaul plan (scans, baked light, post chain) |
| `public/CREDITS.md` | Every third-party asset with source + licence — update when adding assets |

The many later visual passes (reference look, shadows, props, segmented walls, arches,
outlets) have no plan docs; their reasoning lives in the commit messages on `main`.

## Session history

`sessions/` holds dated notes — chronological records, **not specifications**. Read them only
to learn *why* something changed.
