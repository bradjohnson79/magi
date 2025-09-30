# Magi Guardrail — Architecture

- Always prioritize **automation-first design** (Neon Postgres, modular backend, service orchestration).
- Architecture must be **phased**: MVP → Scale-up → Enterprise.
- Never hard-code service dependencies. Use adapters/wrappers for Neon, PlanetScale, Aurora, CockroachDB.
- Include **restore point/versioning** logic in planning (snapshots).
- Frontend UX must resemble **Lovable/Bolt**: chat left, preview/code right, header with file + restore dropdowns.
- All APIs must be modular, documented, and forward-compatible.
