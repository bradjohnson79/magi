# Magi Guardrail — AI Matrix & Self-Evolution

- Magi orchestrates multiple models; each model has a **designated role** (codegen, schema design, auth integration, QA, etc).
- All model runs must be logged in `model_runs` with metadata: model_id, prompt_hash, confidence, provenance.
- Use **ensemble verification** for high-risk outputs (DB schemas, infra commands).
- Self-evolution pipeline:
  - Capture feedback.
  - Aggregate metrics (error %, correction %).
  - Trigger retrain/canary only when thresholds are crossed.
- Always respect **privacy/consent**: no user data for training unless explicitly opted-in.
