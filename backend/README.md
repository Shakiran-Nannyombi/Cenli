# Cenli DPE — Backend

Production-grade Python backend for the Dev Clarifier AI pipeline.  
Gemini 2.5 Flash · Arize Phoenix OpenInference · FastAPI

---

## Architecture

```
POST /api/pipeline/submit
        │
        ▼
  agent.py  ─── Stage 1: read_source_code()   ← local tool
        │
        ├─── Stage 2: Phoenix MCP query        ← @arizeai/phoenix-mcp
        │           (historical trace context)
        │
        ├─── Stage 3: Gemini refactor loop     ← gemini-2.5-flash
        │           (multi-turn agentic)
        │
        ├─── Stage 4: run_syntax_lint()        ← black + flake8
        │
        └─── validator.py LLM-as-a-Judge       ← gemini-2.5-flash (temp=0.1)
                    │
                    └── JSON → frontend schema
```

All Gemini calls are auto-instrumented via `openinference-instrumentation-google-genai`
and traced to Arize Phoenix using OTLP.

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- Node.js 18+ (for the Phoenix MCP server via `npx`)
- A running [Arize Phoenix](https://docs.arize.com/phoenix) instance  
  (`docker run -p 6006:6006 arizephoenix/phoenix:latest`)

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
# Edit .env and fill in your GEMINI_API_KEY
```

### 4. Start Phoenix (local Docker)

```bash
docker run -p 6006:6006 arizephoenix/phoenix:latest
# Dashboard → http://localhost:6006
```

### 5. Run the API server

```bash
uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
```

### 6. Test

```bash
pytest tests/ -v
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/pipeline/status` | Health check — confirms env vars and version |
| `POST` | `/api/pipeline/submit` | Submit code as JSON `{filename, code}` for full pipeline |
| `POST` | `/api/pipeline/upload` | Submit code as a file upload (multipart) |
| `POST` | `/api/evaluate`        | Direct LLM-as-a-Judge call `{original, refactored}` |

### `POST /api/pipeline/submit` — request

```json
{
  "filename": "users_controller.py",
  "code": "def getUsers(req, res):\n    ..."
}
```

### `POST /api/pipeline/submit` — response

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
    "summary": "Well-structured refactor with clear SRP boundaries."
  },
  "agent_summary": {
    "stage": "complete",
    "original_loc": 18,
    "refactored_loc": 24,
    "lint_status": "LINT_PASS",
    "refactored_code": "..."
  },
  "refactored_path": "/tmp/dpe_submission_refactored.py"
}
```

---

## MCP Configuration

`mcp_config.json` wires the Phoenix MCP server to the agent.  
The agent uses it to query historical trace data for self-correction.

To use the MCP server, ensure `npx` is available and Phoenix is running:

```bash
# The agent calls this automatically; you can test it manually:
npx -y @arizeai/phoenix-mcp@latest --baseUrl http://localhost:6006
```

---

## File Structure

```
backend/
├── src/
│   ├── agent.py          # Core orchestration loop
│   ├── server.py         # FastAPI HTTP server
│   └── tools/
│       ├── code_io.py    # File read/write/lint tools
│       └── validator.py  # LLM-as-a-Judge engine
├── tests/
│   ├── test_code_io.py   # File tool unit tests
│   └── test_server.py    # API integration tests
├── mcp_config.json       # Phoenix MCP server config
├── .env.example          # Environment variable template
├── requirements.txt      # Python dependencies
└── pyproject.toml        # Tool configuration
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ | — | Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `PHOENIX_COLLECTOR_ENDPOINT` | ❌ | `http://localhost:6006/v1/traces` | OTLP endpoint for Phoenix |
| `PHOENIX_API_KEY` | ❌ | — | Only needed for Phoenix Cloud |
| `HOST` | ❌ | `0.0.0.0` | uvicorn bind host |
| `PORT` | ❌ | `8000` | uvicorn bind port |
