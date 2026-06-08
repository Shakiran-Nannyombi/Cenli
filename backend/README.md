# Cenli DPE — Backend

**Arize Hackathon Track: Build Gemini Agents with Full Observability and Self-Introspection via MCP**

Production-grade Python backend for the Dev Clarifier AI pipeline.

| Component | Technology |
|-----------|-----------|
| Agent runtime | `google-genai` SDK (Gemini 2.5 Flash) |
| Instrumentation | `openinference-instrumentation-google-genai` |
| Trace collector | Arize Phoenix (Cloud or self-hosted) |
| Runtime introspection | `@arizeai/phoenix-mcp` via npx |
| Evaluation | LLM-as-a-Judge (structured JSON, temp=0.1) |
| HTTP server | FastAPI + uvicorn |

---

## Hackathon Criteria Checklist

| Requirement | Implementation |
|-------------|---------------|
| ✅ Code-owned agent runtime | `google-genai` SDK — `client.models.generate_content`, not Agent Builder |
| ✅ OpenInference instrumentation | `GoogleGenAIInstrumentor().instrument()` in `agent.py` |
| ✅ Phoenix Cloud **or** self-hosted | Env-switched: set `PHOENIX_API_KEY` → Cloud, leave blank → local Docker |
| ✅ Phoenix MCP as runtime tool | `mcp_config.json` + agent Stage 2 explicitly calls phoenix MCP tools |
| ✅ LLM-as-a-Judge evaluations | `validator.py` with `response_schema` + `response_mime_type="application/json"` |
| ✅ Eval scores logged back to Phoenix | `_annotate_span_with_evaluation()` writes `eval.*` attributes onto the active span |
| ✅ Self-improvement loop | Agent Stage 2 queries its own prior `eval.verdict` + `eval.technical_debt_reduction_pct` scores to calibrate refactor strategy |

---

## Pipeline Architecture

```
POST /api/pipeline/submit
        │
        ▼
  agent.py — process_pipeline_submission()
        │
        ├── STAGE 1 INGEST
        │     read_source_code()  ← local function call
        │
        ├── STAGE 2 SELF-INTROSPECT  ← Phoenix MCP server
        │     phoenix_search_spans("prior refactor sessions")
        │     phoenix_get_traces(project="dev-clarifier-dpe")
        │     → Synthesise Refactor Strategy from historical eval scores
        │
        ├── STAGE 3 REFACTOR
        │     Gemini rewrites code guided by Stage 2 context
        │
        ├── STAGE 4 LINT
        │     run_syntax_lint()  ← black + flake8 local call
        │     write_refactored_code()
        │
        └── STAGE 5 JUDGE + ANNOTATE
              validator.evaluate_code_quality()   ← separate Gemini call, temp=0.1
              _annotate_span_with_evaluation()    → writes eval.* to Phoenix span
```

Every `generate_content` call in stages 1-4 is **automatically traced** via
`GoogleGenAIInstrumentor` → OpenInference OTLP → Phoenix. No manual span
creation required.

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- Node.js 18+ (for `npx @arizeai/phoenix-mcp`)
- Gemini API key from [AI Studio](https://aistudio.google.com/apikey)
- Phoenix Cloud account **or** Docker for local Phoenix

### 2. Install

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env:
#   GEMINI_API_KEY=...
#   PHOENIX_API_KEY=...   (for Phoenix Cloud)
#   or leave PHOENIX_API_KEY blank for local Docker
```

### 4. Start Phoenix

**Option A — Phoenix Cloud (recommended)**
```
Sign up at https://app.phoenix.arize.com → get API key → set PHOENIX_API_KEY in .env
```

**Option B — Local Docker**
```bash
docker run -p 6006:6006 arizephoenix/phoenix:latest
# Dashboard: http://localhost:6006
```

### 5. Run the server

```bash
uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
# API docs: http://localhost:8000/docs
```

### 6. Run tests

```bash
pytest tests/ -v
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/pipeline/status` | Health + env readiness check |
| `POST` | `/api/pipeline/submit` | Full pipeline (JSON body `{filename, code}`) |
| `POST` | `/api/pipeline/upload` | Full pipeline (multipart file upload) |
| `POST` | `/api/evaluate` | Direct LLM-as-a-Judge `{original, refactored}` |
| `GET`  | `/api/traces` | Proxy: recent Phoenix traces |
| `GET`  | `/api/traces/{id}/spans` | Proxy: spans for a trace |

### Submit response shape

```json
{
  "status": "approved",
  "lint": "LINT_PASS: black: formatted ✓ | flake8: no violations ✓",
  "judge_report": {
    "technical_debt_reduction_percentage": 62,
    "cyclomatic_complexity": "Low",
    "architectural_drift_risk": "None",
    "modularity_ratio": "Highly Modular",
    "verdict": "approve",
    "confidence_pct": 91,
    "summary": "Clear SRP decomposition with full type coverage."
  },
  "agent_summary": {
    "stage": "complete",
    "original_loc": 18,
    "refactored_loc": 26,
    "lint_status": "LINT_PASS",
    "refactor_strategy": "Historical traces showed token bottlenecks from deeply nested loops; flattened to list comprehensions.",
    "refactored_code": "..."
  },
  "refactored_path": "/tmp/dpe_submit_refactored.py"
}
```

---

## MCP Configuration

`mcp_config.json` contains two server entries:

| Entry | `--baseUrl` | When to use |
|-------|-------------|-------------|
| `phoenix` | `http://localhost:6006` | Local Docker (default, `disabled: false`) |
| `phoenix-cloud` | `https://app.phoenix.arize.com` | Phoenix Cloud (`disabled: true` by default) |

To use Phoenix Cloud: set `"disabled": false` on `phoenix-cloud` and `"disabled": true` on `phoenix`, then set `PHOENIX_API_KEY` in your `.env`.

The agent's Stage 2 system prompt instructs Gemini to call `phoenix_search_spans` and `phoenix_get_traces` to retrieve prior evaluation scores before deciding on a refactor strategy.

---

## File Structure

```
backend/
├── src/
│   ├── agent.py          # Core orchestration loop — all 6 stages
│   ├── server.py         # FastAPI HTTP server + Phoenix proxy routes
│   └── tools/
│       ├── code_io.py    # read / write / lint file tools
│       └── validator.py  # LLM-as-a-Judge with response_schema
├── tests/
│   ├── test_code_io.py
│   └── test_server.py
├── mcp_config.json       # Phoenix MCP server config (local + cloud)
├── .env.example          # Environment variable template
├── requirements.txt
└── pyproject.toml
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | From [AI Studio](https://aistudio.google.com/apikey) |
| `PHOENIX_API_KEY` | Cloud only | From app.phoenix.arize.com → Settings |
| `PHOENIX_COLLECTOR_ENDPOINT` | ❌ | Auto-set based on `PHOENIX_API_KEY` |
| `HOST` | ❌ | uvicorn bind host (default `0.0.0.0`) |
| `PORT` | ❌ | uvicorn bind port (default `8000`) |
