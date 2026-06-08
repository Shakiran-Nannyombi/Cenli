"""
server.py
---------
FastAPI entry point for the Cenli DPE backend.

Exposes:
  POST /api/pipeline/submit   — trigger the full DPE agent pipeline
  GET  /api/pipeline/status   — health / readiness check
  POST /api/evaluate          — direct LLM-as-a-Judge call (no agent loop)

Run locally:
  uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.agent import process_pipeline_submission
from src.tools.validator import evaluate_code_quality

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Cenli DPE Agent API",
    description="Developer Productivity Engineering guardrail pipeline backed by Gemini + Arize Phoenix.",
    version="1.0.0",
)

# Allow the Lovable/Vite frontend dev server to call this API
_ALLOWED_ORIGINS = [
    "http://localhost:5173",   # Vite dev
    "http://localhost:3000",   # alternative dev port
    "https://dev-clarifier-ai.lovable.app",  # Lovable production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EvaluateRequest(BaseModel):
    original: str
    refactored: str


class PipelineSubmitRequest(BaseModel):
    """Submit inline code (as a string) rather than a file path."""
    filename: str = "submission.py"
    code: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/pipeline/status")
def pipeline_status() -> dict:
    """Health check — confirms the API is up and env vars are present."""
    gemini_ok = bool(os.getenv("GEMINI_API_KEY"))
    phoenix_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces")
    return {
        "status": "ok",
        "gemini_configured": gemini_ok,
        "phoenix_endpoint": phoenix_endpoint,
        "version": "1.0.0",
    }


@app.post("/api/pipeline/submit")
async def submit_pipeline(body: PipelineSubmitRequest) -> dict:
    """
    Accept raw AI-generated code as a string, persist it to a temp file,
    run the full DPE agent pipeline, and return the structured result.

    The response shape maps directly to the frontend ``Commit`` schema:
    {
      "status":        "approved" | "rejected" | "error",
      "lint":          "<lint result string>",
      "judge_report":  { ...judge JSON... },
      "agent_summary": { ...agent final JSON block... },
      "refactored_path": "<path>"   // present when status == "approved"
    }
    """
    # Write submitted code to a temp file so the agent's file tools work
    suffix = Path(body.filename).suffix or ".py"
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=suffix,
        prefix="dpe_submission_",
        delete=False,
        encoding="utf-8",
    ) as tmp:
        tmp.write(body.code)
        tmp_path = tmp.name

    logger.info("Received pipeline submission → temp file: %s", tmp_path)

    try:
        result = process_pipeline_submission(tmp_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline error for %s", tmp_path)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        # Clean up the temp input file — the refactored output file (if any)
        # lives at a predictable path and is intentionally kept.
        Path(tmp_path).unlink(missing_ok=True)

    return result


@app.post("/api/pipeline/upload")
async def upload_pipeline(file: UploadFile = File(...)) -> dict:
    """
    Accept a file upload directly (multipart/form-data) and run the pipeline.
    Useful for CI integrations that pipe files rather than JSON payloads.
    """
    content = await file.read()
    try:
        code = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded source code.") from exc

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

    logger.info("File upload received → %s (%d bytes)", file.filename, len(content))

    try:
        result = process_pipeline_submission(tmp_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline error for uploaded file %s", file.filename)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return result


@app.post("/api/evaluate")
def evaluate(body: EvaluateRequest) -> dict:
    """
    Direct LLM-as-a-Judge endpoint — skips the full agent loop.
    Useful for the Evaluations page to re-score any commit diff.

    Returns the structured judge JSON parsed into a dict.
    """
    import json

    judge_json = evaluate_code_quality(body.original, body.refactored)
    try:
        return json.loads(judge_json)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Judge parse error: {exc}") from exc
