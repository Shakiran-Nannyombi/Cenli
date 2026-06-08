from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)


# ---------------------------------------------------------------------------
# Lifespan: load .env before anything else touches os.getenv
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load environment variables and bootstrap tracing on startup."""
    load_dotenv()  # reads backend/.env if it exists
    logger.info("Environment loaded — GEMINI_API_KEY present: %s", bool(os.getenv("GEMINI_API_KEY")))

    # Import here (after dotenv) so _bootstrap_tracing() sees the real env
    # This is the only place the agent module is imported at server scope
    global _process_pipeline, _evaluate_quality
    from src.agent import process_pipeline_submission as _pp
    from src.tools.validator import evaluate_code_quality as _eq
    _process_pipeline = _pp
    _evaluate_quality = _eq

    yield
    logger.info("Server shutdown")


# Placeholders — replaced during lifespan startup
_process_pipeline = None  # type: ignore[assignment]
_evaluate_quality = None   # type: ignore[assignment]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Cenli DPE Agent API",
    description=(
        "Developer Productivity Engineering guardrail pipeline.\n"
        "Gemini 2.5 Flash · Arize Phoenix OpenInference · FastAPI"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Lovable/Vite frontend to reach this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://dev-clarifier-ai.lovable.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PipelineSubmitRequest(BaseModel):
    """Submit inline source code as a JSON payload."""
    filename: str = Field(default="submission.py", description="Original filename (used for extension detection).")
    code: str = Field(..., description="Raw AI-generated source code to process.")


class EvaluateRequest(BaseModel):
    """Direct judge evaluation — no full pipeline run."""
    original: str = Field(..., description="Raw AI-generated code (before refactor).")
    refactored: str = Field(..., description="DPE agent refactored output.")


# ---------------------------------------------------------------------------
# Helper: run synchronous pipeline in thread pool (FastAPI is async)
# ---------------------------------------------------------------------------

async def _run_pipeline_async(file_path: str) -> dict:
    """Execute the blocking pipeline function in a thread pool executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_pipeline, file_path)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/pipeline/status", tags=["pipeline"])
def pipeline_status() -> dict:
    """
    Health check.

    Returns readiness of required environment variables and the Phoenix
    collector endpoint being used for this session.
    """
    phoenix_api_key = os.getenv("PHOENIX_API_KEY", "")
    collector = os.getenv(
        "PHOENIX_COLLECTOR_ENDPOINT",
        "https://app.phoenix.arize.com/v1/traces" if phoenix_api_key else "http://localhost:6006/v1/traces",
    )
    return {
        "status": "ok",
        "version": "1.0.0",
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "phoenix_mode": "cloud" if phoenix_api_key else "local",
        "phoenix_collector": collector,
        "project": "dev-clarifier-dpe",
    }


@app.post("/api/pipeline/submit", tags=["pipeline"])
async def submit_pipeline(body: PipelineSubmitRequest) -> dict:
    """
    Accept raw AI-generated code as a JSON payload, run the full DPE
    agent pipeline, and return the structured result.

    Pipeline stages: Ingest → Phoenix MCP Introspect → Refactor → Lint → Judge

    Response shape matches the Cenli frontend ``Commit`` schema:
    ```json
    {
      "status": "approved" | "rejected" | "error",
      "lint":   "LINT_PASS: ...",
      "judge_report": {
        "technical_debt_reduction_percentage": 62,
        "cyclomatic_complexity": "Low",
        "architectural_drift_risk": "None",
        "modularity_ratio": "Highly Modular",
        "verdict": "approve",
        "confidence_pct": 91,
        "summary": "..."
      },
      "agent_summary": { "stage": "complete", ... },
      "refactored_path": "/tmp/dpe_submission_refactored.py"
    }
    ```
    """
    if _process_pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not initialised — check server startup logs")

    # Persist submitted code to a temp file (agent tools operate on files)
    suffix = Path(body.filename).suffix or ".py"
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=suffix,
        prefix="dpe_submit_",
        delete=False,
        encoding="utf-8",
    ) as tmp:
        tmp.write(body.code)
        tmp_path = tmp.name

    logger.info("Pipeline submission → %s (%d chars)", tmp_path, len(body.code))

    try:
        result = await _run_pipeline_async(tmp_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline error for %s", tmp_path)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return result


@app.post("/api/pipeline/upload", tags=["pipeline"])
async def upload_pipeline(file: UploadFile = File(...)) -> dict:
    """
    Accept a source file upload (multipart/form-data) and run the pipeline.

    Suitable for CI integrations that POST files directly.
    """
    if _process_pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not initialised")

    raw_bytes = await file.read()
    try:
        code = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="File must be UTF-8 encoded source code"
        ) from exc

    suffix = Path(file.filename or "upload.py").suffix or ".py"
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=suffix,
        prefix="dpe_upload_",
        delete=False,
        encoding="utf-8",
    ) as tmp:
        tmp.write(code)
        tmp_path = tmp.name

    logger.info("File upload → %s (%d bytes)", file.filename, len(raw_bytes))

    try:
        result = await _run_pipeline_async(tmp_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline error for %s", file.filename)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return result


@app.post("/api/evaluate", tags=["evaluation"])
async def evaluate(body: EvaluateRequest) -> dict:
    """
    Run a direct LLM-as-a-Judge evaluation without the full agent loop.

    Useful for the frontend Evaluations page to re-score any commit diff
    on demand.  Also usable from CI to validate a known before/after pair.
    """
    if _evaluate_quality is None:
        raise HTTPException(status_code=503, detail="Evaluator not initialised")

    loop = asyncio.get_event_loop()
    judge_json: str = await loop.run_in_executor(
        None, _evaluate_quality, body.original, body.refactored
    )

    try:
        return json.loads(judge_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Judge parse error: {exc}") from exc


# ---------------------------------------------------------------------------
# Phoenix proxy endpoints — expose trace data to the Cenli frontend
# ---------------------------------------------------------------------------

def _phoenix_base_url() -> str:
    """Derive the Phoenix REST API base URL from the collector endpoint."""
    collector = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces")
    # Strip the /v1/traces path → get the Phoenix UI/API root
    if "/v1/traces" in collector:
        return collector.replace("/v1/traces", "")
    return collector.rstrip("/")


def _phoenix_headers() -> dict[str, str]:
    """Build auth headers for Phoenix API calls."""
    key = os.getenv("PHOENIX_API_KEY", "").strip()
    return {"Authorization": f"Bearer {key}"} if key else {}


@app.get("/api/traces", tags=["observability"])
async def list_traces(limit: int = 20, project: str = "dev-clarifier-dpe") -> dict:
    """
    Proxy: return recent traces from Phoenix for the given project.

    Allows the Cenli frontend to render live trace data without exposing
    Phoenix API keys to the browser.
    """
    base = _phoenix_base_url()
    url = f"{base}/v1/traces"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                headers=_phoenix_headers(),
                params={"project_name": project, "limit": limit},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Phoenix unreachable at {base} — is it running? ({exc})",
        ) from exc


@app.get("/api/traces/{trace_id}/spans", tags=["observability"])
async def get_trace_spans(trace_id: str) -> dict:
    """
    Proxy: return all spans for a specific trace from Phoenix.

    The Cenli TraceView component calls this to render the nested
    waterfall for a real agent execution.
    """
    base = _phoenix_base_url()
    url = f"{base}/v1/traces/{trace_id}/spans"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=_phoenix_headers())
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Phoenix unreachable: {exc}") from exc
