# docs/v3 — Agent Guide

This directory contains v3 authority and planning documents.

## What This Subtree Owns

Durable v3 reference documents:

- `README.md` — v3 index and build discipline pointer.
- `STATUS.md` — current state + per-goal history; agent orientation (read first).
- `INCOMING_GOALS.md` — dogfooding backlog/intake; candidates, NOT authority until promoted into `BUILD_PLAN_V3.md`.
- `GLOSSARY.md` — canonical v3 term definitions.
- `KERNEL_SCHEMA_V1.md` — canonical table definitions, field lists, and relationships (Goal 1).
- `AUTHORITY_RULES.md` — detailed mutation rules, invariants, and violation signals (Goal 1).
- `WORKER_RECONCILIATION.md` — binding worker spawn/status authority spec for Goal 6A before Conductor actions.
- `VAULT_OKF_SPEC.md` — Kernel→Obsidian OKF export authority model, naming, frontmatter, and shapes (Goal 8).
- `EVALS_SPEC.md` — evaluation-layer rubrics, evidence inputs, scoring scale, determinism/anti-gaming/human-review rules, and the storage/aggregation decisions still pending verifier approval (Goal 9 gate; spec only, no runtime).
- Future (later goals): `CLOUDFLARE_ROADMAP.md`.

## What This Subtree Must Not Do

- Do not put executable or runtime code here.
- Do not duplicate content already in root `BUILD_PLAN_V3.md`.
- Do not create new vocabulary that conflicts with `GLOSSARY.md`.
- Do not treat docs here as execution authority above `BUILD_PLAN_V3.md`.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. The specific doc you are editing

## DOX Rule

Before editing any file in this subtree: walk this chain.

After meaningful changes: update this file if the subtree's scope or rules changed.
