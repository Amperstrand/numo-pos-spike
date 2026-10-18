# AGENTS.md — numo-pos-spike

Instructions for AI coding agents working in this repository.

## Purpose

Hackathon spike turning [Numo](https://github.com/cashubtc/numo) (the
open-source Cashu Android POS) into a restaurant checkout flow: a web shop
loads a menu, builds a cart, pays via a mock mint, emits the real Numo v2
`payment.received` webhook, and submits the order to a real-time kitchen
endpoint. See [README.md](README.md) and
[docs/NUMO_RESEARCH.md](docs/NUMO_RESEARCH.md) for the webhook contract.

## Commands

```sh
bun install                     # deps (bun.lock is the lockfile)
bun run db:generate             # prisma client types (after schema edits)
bun run dev                     # next dev on :3000 (writes dev.log)
bun test                        # unit tests (the per-PR battery)
bun run typecheck               # tsc --noEmit
bun run lint                    # eslint .
bun run db:push                 # sqlite schema push (local dev db)
```

`db:*` scripts and the kitchen mini-service need a local database — unit
tests and typecheck do not.

## Local CI gate

GitHub Actions is org-blocked; the per-PR gate is
[`scripts/pr-verify.sh`](scripts/pr-verify.sh) (fleet pattern:
Amperstrand/.github `workflow-templates/local-ci-gate.md`). From a review:

```sh
scripts/pr-verify.sh <PR-number>    # worktree checkout, legs, PR-comment stamp
scripts/pr-verify.sh origin/main    # ref mode, table only
```

Legs: hygiene / deps / typecheck / lint / unit-tests. Not covered: `next
build`, DB-connected scripts, kitchen-service runtime, anything
browser-visible.

## Bench touchpoints

None. This repo runs entirely on the host (no labgrid places, no devices);
the physical Numo phone work lives in the `Numo`/`numo-bridge` repos.

## Conventions

- Semantic commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- No secrets, no real mint keys — the mock mint is intentional.
- PRs carry a `### Local CI gate` stamp before merge.
