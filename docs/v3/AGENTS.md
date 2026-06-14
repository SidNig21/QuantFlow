# docs/v3 — Agent Guide

This directory contains v3 authority and planning documents.

## What This Subtree Owns

Durable v3 reference documents:

- `README.md` — v3 index and build discipline pointer.
- `GLOSSARY.md` — canonical v3 term definitions.
- `KERNEL_SCHEMA_V1.md` — canonical table definitions, field lists, and relationships (Goal 1).
- `AUTHORITY_RULES.md` — detailed mutation rules, invariants, and violation signals (Goal 1).
- Future (later goals): `VAULT_OKF_SPEC.md`, `EVALS_SPEC.md`, `CLOUDFLARE_ROADMAP.md`.

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
