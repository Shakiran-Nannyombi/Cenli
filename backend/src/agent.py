"""
agent.py — Cenli DPE Core Agent Orchestration Loop
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Arize Phoenix — OpenTelemetry tracing (BatchSpanProcessor, production-grade)
# ---------------------------------------------------------------------------
from opentelemetry import trace as otel_trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import SpanKind

# ---------------------------------------------------------------------------
# Google GenAI SDK
# ---------------------------------------------------------------------------
from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# Local tools + Phoenix MCP client
# ---------------------------------------------------------------------------
from src.mcp_client import PhoenixMCPClient
from src.tools.code_io import read_source_code, run_syntax_lint, write_refactored_code
from src.tools.validator import evaluate_code_quality

logger = logging.getLogger(__name__)

_PROJECT_NAME = "dev-clarifier-dpe"
_REFACTOR_MODEL = "gemini-2.5-flash"
_MAX_TURNS = 25


# ===========================================================================
# Tracing bootstrap
# ===========================================================================

def _bootstrap_tracing() -> None:
    """
    Register Phoenix OTLP tracing using BatchSpanProcessor.

    BatchSpanProcessor buffers spans and exports them in background batches —
    eliminates the SimpleSpanProcessor warning in production logs.

    Mode: set PHOENIX_API_KEY -> Phoenix Cloud; leave blank -> local Phoenix.
    """
    phoenix_api_key = os.getenv("PHOENIX_API_KEY", "").strip()
    collector_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "").strip()

    is_cloud = "app.phoenix.arize.com" in collector_endpoint
    if not collector_endpoint:
        is_cloud = len(phoenix_api_key) > 100
        collector_endpoint = (
            "https://app.phoenix.arize.com/v1/traces"
            if is_cloud
            else "http://localhost:6006/v1/traces"
        )

    headers: dict[str, str] = {}
    if phoenix_api_key:
        headers["Authorization"] = f"Bearer {phoenix_api_key}"

    # Build provider with BatchSpanProcessor — no SimpleSpanProcessor warning
    exporter = OTLPSpanExporter(endpoint=collector_endpoint, headers=headers)
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    otel_trace.set_tracer_provider(provider)

    mode = "cloud" if is_cloud else "local"
    logger.info(
        "Phoenix %s tracing active (BatchSpanProcessor) — project='%s' collector='%s'",
        mode,
        _PROJECT_NAME,
        collector_endpoint,
    )


_bootstrap_tracing()

# Module-level tracer
_tracer = otel_trace.get_tracer("cenli.dpe.agent")


# ===========================================================================
# Traced generate_content wrapper
# ===========================================================================

def _traced_generate_content(
    client: genai.Client,
    *,
    model: str,
    contents: list,
    config: types.GenerateContentConfig,
    span_name: str = "llm.generate_content",
) -> types.GenerateContentResponse:
    """Wrap generate_content in an OTel span with LLM attributes."""
    with _tracer.start_as_current_span(span_name, kind=SpanKind.CLIENT) as span:
        span.set_attribute("llm.model_name", model)
        span.set_attribute("dpe.project", _PROJECT_NAME)
        span.set_attribute("openinference.span.kind", "LLM")

        response = client.models.generate_content(
            model=model, contents=contents, config=config,
        )

        if hasattr(response, "usage_metadata") and response.usage_metadata:
            um = response.usage_metadata
            if getattr(um, "prompt_token_count", None):
                span.set_attribute("llm.token_count.prompt", um.prompt_token_count)
            if getattr(um, "candidates_token_count", None):
                span.set_attribute("llm.token_count.completion", um.candidates_token_count)
            if getattr(um, "total_token_count", None):
                span.set_attribute("llm.token_count.total", um.total_token_count)

        return response


# ===========================================================================
# Local function declarations
# ===========================================================================

_LOCAL_TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="read_source_code",
        description="Read the raw source code of a file from disk. Call this first in Stage 1.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Absolute or relative path to the source file.",
                )
            },
            required=["file_path"],
        ),
    ),
    types.FunctionDeclaration(
        name="write_refactored_code",
        description="Write the final refactored source code to disk. Call ONLY after lint passes.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Destination path for the refactored artifact.",
                ),
                "clean_code": types.Schema(
                    type=types.Type.STRING,
                    description="The complete refactored source code.",
                ),
            },
            required=["file_path", "clean_code"],
        ),
    ),
    types.FunctionDeclaration(
        name="run_syntax_lint",
        description="Run black + flake8 CI-grade checks. Returns LINT_PASS, LINT_WARN, or LINT_FAIL.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Path to the Python source file to validate.",
                )
            },
            required=["file_path"],
        ),
    ),
]

_LOCAL_TOOL_DISPATCH: dict[str, Any] = {
    "read_source_code": read_source_code,
    "write_refactored_code": write_refactored_code,
    "run_syntax_lint": run_syntax_lint,
}


# ===========================================================================
# Local tool dispatcher
# ===========================================================================

def _dispatch_local_tool(fn_call: types.FunctionCall) -> types.Part:
    """Execute a local tool call and return a FunctionResponse Part."""
    name = fn_call.name
    args = dict(fn_call.args) if fn_call.args else {}
    logger.debug("-> local tool: %s(%s)", name, args)

    handler = _LOCAL_TOOL_DISPATCH.get(name)
    if handler is None:
        result = f"ERROR: unknown tool '{name}'"
    else:
        try:
            result = handler(**args)
        except Exception as exc:  # noqa: BLE001
            result = f"ERROR: {exc}"

    logger.debug("<- tool result [%s]: %.120s", name, result)
    return types.Part.from_function_response(name=name, response={"result": result})


# ===========================================================================
# Agent system prompt
# ===========================================================================

_AGENT_SYSTEM_PROMPT = """\
You are the Cenli DPE Guardrail Agent — an autonomous code-quality pipeline
that intercepts AI-generated code before it reaches production.

LOCAL TOOLS (always available):
  - read_source_code(file_path)              — ingest the submission
  - run_syntax_lint(file_path)               — black + flake8 CI gate
  - write_refactored_code(file_path, code)   — persist the final artifact

PHOENIX MCP TOOLS (prefixed phoenix_):
  - phoenix_search_spans — search historical trace spans by attribute/value
  - phoenix_get_traces   — list recent traces for this project
  - phoenix_get_span     — inspect a specific span's attributes and eval scores

MANDATORY PIPELINE:

STAGE 1 - INGEST
  Call read_source_code(file_path).
  Note: language, LOC count, obvious structural issues.

STAGE 2 - SELF-INTROSPECTION (Phoenix MCP - DO NOT SKIP)
  Call phoenix_search_spans to find prior runs with eval.verdict = "reject".
  Also call phoenix_get_traces to see recent project history.
  Write a one-sentence Refactor Strategy from the results.
  If Phoenix returns no data, state "No prior history - using default strategy".
  NEVER fabricate trace data.

STAGE 3 - REFACTOR
  Rewrite the code using the Refactor Strategy:
    - Single-responsibility functions (SRP)
    - Type annotations on all signatures
    - Cyclomatic complexity <= 10 per function
    - Preserve all original business logic exactly

STAGE 4 - LINT
  Write refactored code to a temp path, call run_syntax_lint.
  If LINT_FAIL: fix violations and re-lint (max 2 retries).
  Once LINT_PASS or LINT_WARN: call write_refactored_code with final code.

STAGE 5 - SUMMARY
  Output ONLY this JSON block (no markdown, no extra text):
  {
    "stage": "complete",
    "original_loc": <int>,
    "refactored_loc": <int>,
    "lint_status": "LINT_PASS" | "LINT_WARN" | "LINT_FAIL",
    "refactor_strategy": "<one sentence from Stage 2>",
    "refactored_code": "<complete refactored source>"
  }
"""


# ===========================================================================
# Evaluation -> Phoenix span annotation
# ===========================================================================

def _annotate_span_with_evaluation(judge_report: dict) -> None:
    """Write judge scores onto the active OTel span to close the self-improvement loop."""
    span = otel_trace.get_current_span()
    if span is otel_trace.INVALID_SPAN:
        return

    attrs = {
        "eval.technical_debt_reduction_pct": judge_report.get("technical_debt_reduction_percentage"),
        "eval.cyclomatic_complexity": judge_report.get("cyclomatic_complexity"),
        "eval.architectural_drift_risk": judge_report.get("architectural_drift_risk"),
        "eval.modularity_ratio": judge_report.get("modularity_ratio"),
        "eval.verdict": judge_report.get("verdict"),
        "eval.confidence_pct": judge_report.get("confidence_pct"),
        "eval.summary": judge_report.get("summary"),
        "dpe.pipeline": _PROJECT_NAME,
    }

    for key, value in attrs.items():
        if value is not None:
            span.set_attribute(
                key,
                value if isinstance(value, (str, int, float, bool)) else str(value),
            )

    logger.info(
        "Span annotated -> verdict=%s debt_reduction=%s%%",
        judge_report.get("verdict"),
        judge_report.get("technical_debt_reduction_percentage"),
    )


# ===========================================================================
# Core orchestration loop
# ===========================================================================

async def _run_agent_loop(file_path: str) -> dict:
    """Internal async pipeline. Called by process_pipeline_submission."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"status": "error", "error": "GEMINI_API_KEY not set"}

    client = genai.Client(api_key=api_key)

    async with PhoenixMCPClient() as mcp:
        phoenix_declarations = mcp.get_tool_declarations()

        if phoenix_declarations:
            logger.info("Phoenix MCP connected — %d tools bound", len(phoenix_declarations))
        else:
            logger.warning("Phoenix MCP unavailable — Stage 2 text-only fallback")

        all_declarations = _LOCAL_TOOL_DECLARATIONS + phoenix_declarations

        gen_config = types.GenerateContentConfig(
            system_instruction=_AGENT_SYSTEM_PROMPT,
            tools=[types.Tool(function_declarations=all_declarations)],
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(
                    mode=types.FunctionCallingConfigMode.AUTO,
                )
            ),
            temperature=0.2,
        )

        contents: list[types.Content] = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=(
                    f"New DPE pipeline submission received.\n"
                    f"File path: {file_path}\n\n"
                    "Execute all five pipeline stages in order. "
                    "Do not skip Stage 2 — always call at least one Phoenix MCP tool."
                ))],
            )
        ]

        original_code: str | None = None
        refactored_code: str | None = None
        lint_result: str = "NOT_RUN"
        final_summary: dict = {}

        logger.info("DPE pipeline started -> %s", file_path)

        for turn in range(_MAX_TURNS):
            logger.debug("Turn %d/%d", turn + 1, _MAX_TURNS)

            response = _traced_generate_content(
                client,
                model=_REFACTOR_MODEL,
                contents=contents,
                config=gen_config,
                span_name=f"dpe.agent.turn_{turn + 1}",
            )

            candidate = response.candidates[0]
            response_parts = list(candidate.content.parts)
            contents.append(types.Content(role="model", parts=response_parts))

            tool_calls = [p for p in response_parts if p.function_call]
            if not tool_calls:
                logger.info("Agentic loop complete after %d turn(s)", turn + 1)
                break

            tool_response_parts: list[types.Part] = []
            for part in tool_calls:
                fn = part.function_call

                if fn.name.startswith("phoenix_"):
                    result_part = await mcp.dispatch(fn)
                else:
                    result_part = _dispatch_local_tool(fn)

                result_str: str = result_part.function_response.response.get("result", "")

                if fn.name == "read_source_code" and not result_str.startswith("ERROR:"):
                    original_code = result_str
                elif fn.name == "run_syntax_lint":
                    lint_result = result_str
                elif fn.name == "write_refactored_code":
                    refactored_code = (dict(fn.args) if fn.args else {}).get("clean_code", "")

                tool_response_parts.append(result_part)

            contents.append(types.Content(role="user", parts=tool_response_parts))

    # Parse final summary
    for content in reversed(contents):
        if content.role == "model":
            for part in content.parts:
                if hasattr(part, "text") and part.text:
                    match = re.search(r"\{[\s\S]*?\}", part.text)
                    if match:
                        try:
                            final_summary = json.loads(match.group())
                            if not refactored_code:
                                refactored_code = final_summary.get("refactored_code")
                        except json.JSONDecodeError:
                            pass
                    break
            break

    # LLM-as-a-Judge
    judge_report: dict = {}
    if original_code and refactored_code:
        logger.info("Running LLM-as-a-Judge...")
        try:
            judge_report = json.loads(evaluate_code_quality(original_code, refactored_code))
        except json.JSONDecodeError:
            judge_report = {"error": "parse_failed"}
    else:
        judge_report = {
            "error": "missing_artifacts",
            "original_captured": bool(original_code),
            "refactored_captured": bool(refactored_code),
        }

    _annotate_span_with_evaluation(judge_report)

    # Outcome
    verdict = judge_report.get("verdict", "reject")
    lint_ok = lint_result.startswith("LINT_PASS") or lint_result.startswith("LINT_WARN")
    refactored_path: str | None = None

    if verdict == "approve" and lint_ok and refactored_code:
        p = Path(file_path)
        refactored_path = str(p.parent / f"{p.stem}_refactored{p.suffix}")
        write_refactored_code(refactored_path, refactored_code)
        status = "approved"
        logger.info("Pipeline APPROVED -> %s", refactored_path)
    else:
        status = "rejected"
        logger.info("Pipeline REJECTED -> verdict=%s lint=%s", verdict, lint_result[:50])

    result: dict = {
        "status": status,
        "lint": lint_result,
        "judge_report": judge_report,
        "agent_summary": final_summary,
    }
    if refactored_path:
        result["refactored_path"] = refactored_path

    return result


def process_pipeline_submission(file_path: str) -> dict:
    """
    Synchronous entry point. Runs async pipeline in a fresh event loop
    so it works correctly inside a thread pool executor.
    """
    try:
        return asyncio.run(_run_agent_loop(file_path))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline exception for %s", file_path)
        return {"status": "error", "error": str(exc)}
