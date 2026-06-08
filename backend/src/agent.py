from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Arize Phoenix — OpenTelemetry tracing
# ---------------------------------------------------------------------------
import phoenix.otel
from opentelemetry import trace as otel_trace
from opentelemetry.trace import SpanKind

# NOTE: openinference-instrumentation-google-genai has a broken import
# against google-genai >= 1.0 (expects google.genai._interactions which
# was removed). We instrument manually using the OpenTelemetry tracer
# that phoenix.otel.register() sets as the global provider.
# Phoenix auto-converts OTel GenAI semantic conventions to OpenInference.

# ---------------------------------------------------------------------------
# Google GenAI SDK
# ---------------------------------------------------------------------------
from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# Local tools + Phoenix MCP client
# ---------------------------------------------------------------------------
from src.tools.code_io import read_source_code, write_refactored_code, run_syntax_lint
from src.tools.validator import evaluate_code_quality
from src.mcp_client import PhoenixMCPClient

logger = logging.getLogger(__name__)

_PROJECT_NAME = "dev-clarifier-dpe"
_REFACTOR_MODEL = "gemini-2.5-flash"
_MAX_TURNS = 25


# ===========================================================================
# Tracing bootstrap — runs once at module import time
# ===========================================================================

def _bootstrap_tracing() -> None:
    """
    Register Phoenix OTLP tracing and auto-instrument the Google GenAI SDK.

    Mode selection
    ──────────────
    PHOENIX_API_KEY set   → Phoenix Cloud (app.phoenix.arize.com)
    PHOENIX_API_KEY unset → local self-hosted Phoenix (localhost:6006)

    GoogleGenAIInstrumentor wraps every client.models.generate_content call
    and emits OpenInference-compliant OTLP spans automatically.
    """
    phoenix_api_key = os.getenv("PHOENIX_API_KEY", "").strip()
    # PHOENIX_COLLECTOR_ENDPOINT always wins if explicitly set
    collector_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "").strip()

    # Detect cloud vs. local from the endpoint URL, not just key presence
    is_cloud = "app.phoenix.arize.com" in collector_endpoint

    if not collector_endpoint:
        # Not explicitly set — infer from whether this looks like Cloud
        # (Cloud keys are long JWTs; local system keys are shorter UUIDs)
        is_cloud = len(phoenix_api_key) > 100
        collector_endpoint = (
            "https://app.phoenix.arize.com/v1/traces"
            if is_cloud
            else "http://localhost:6006/v1/traces"
        )

    headers: dict[str, str] | None = None
    if phoenix_api_key:
        # Both Cloud and local self-hosted Phoenix accept Bearer auth
        headers = {"Authorization": f"Bearer {phoenix_api_key}"}
        mode = "cloud" if is_cloud else "local"
        logger.info("Phoenix %s mode — project='%s'", mode, _PROJECT_NAME)
    else:
        logger.info("Phoenix unauthenticated local mode — endpoint='%s'", collector_endpoint)

    phoenix.otel.register(
        project_name=_PROJECT_NAME,
        endpoint=collector_endpoint,
        headers=headers,
    )

    # We skip GoogleGenAIInstrumentor — it has a broken internal import
    # against google-genai >= 1.0. Manual OTEL spans are used instead
    # (see _traced_generate_content below). Phoenix accepts both styles.

    logger.info(
        "Tracing active → project='%s' collector='%s'",
        _PROJECT_NAME,
        collector_endpoint,
    )


_bootstrap_tracing()

# Module-level tracer — used by _traced_generate_content
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
    """
    Thin wrapper around client.models.generate_content that emits an
    OpenTelemetry span with LLM-grade attributes Phoenix understands.
    Uses OpenInference semantic conventions so Phoenix renders the span
    with full message bodies in the Traces UI.
    """
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
        description=(
            "Read the raw source code of a file from disk and return its full "
            "contents. Call this first in Stage 1 to ingest the submission."
        ),
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
        description=(
            "Write the final refactored source code to disk. Call this ONLY "
            "after run_syntax_lint confirms the code passes."
        ),
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
        description=(
            "Run black + flake8 CI-grade checks on a Python source file. "
            "Returns LINT_PASS, LINT_WARN, or LINT_FAIL."
        ),
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
    logger.debug("→ local tool: %s(%s)", name, args)

    handler = _LOCAL_TOOL_DISPATCH.get(name)
    if handler is None:
        result = f"ERROR: unknown tool '{name}'"
    else:
        try:
            result = handler(**args)
        except Exception as exc:  # noqa: BLE001
            result = f"ERROR: {exc}"

    logger.debug("← local tool result [%s]: %.120s", name, result)
    return types.Part.from_function_response(name=name, response={"result": result})


# ===========================================================================
# Agent system prompt
# ===========================================================================

_AGENT_SYSTEM_PROMPT = """\
You are the Cenli DPE Guardrail Agent — an autonomous code-quality pipeline
that intercepts AI-generated code before it reaches production.

LOCAL TOOLS (always available):
  • read_source_code(file_path)              — ingest the submission
  • run_syntax_lint(file_path)               — black + flake8 CI gate
  • write_refactored_code(file_path, code)   — persist the final artifact

PHOENIX MCP TOOLS (prefixed phoenix_):
  • phoenix_search_spans — search historical trace spans by attribute/value
  • phoenix_get_traces   — list recent traces for this project
  • phoenix_get_span     — inspect a specific span's attributes and eval scores

━━━ MANDATORY PIPELINE ━━━

STAGE 1 — INGEST
  Call read_source_code(file_path).
  Note: language, LOC count, obvious structural issues.

STAGE 2 — SELF-INTROSPECTION (Phoenix MCP — DO NOT SKIP)
  Call phoenix_search_spans to search for prior runs with:
    - attribute "eval.verdict" = "reject"
    - attribute "dpe.pipeline" = "dev-clarifier-dpe"
  Also call phoenix_get_traces to see recent project history.
  From the results, extract:
    - What structural patterns caused rejections?
    - What average eval.technical_debt_reduction_pct was achieved?
    - Were there recurring eval.cyclomatic_complexity = "High" issues?
  Write a one-sentence "Refactor Strategy" based on this history.
  If Phoenix returns no data, state "No prior history — using default strategy"
  and continue. NEVER fabricate trace data.

STAGE 3 — REFACTOR
  Rewrite the code using the Refactor Strategy from Stage 2:
    ✓ Single-responsibility functions (SRP)
    ✓ Type annotations on all signatures
    ✓ Input validation (pydantic / dataclasses pattern)
    ✓ Cyclomatic complexity ≤ 10 per function
    ✓ No duplicated logic
    ✓ Preserve all original business logic exactly

STAGE 4 — LINT
  Write refactored code to a temp path, then call run_syntax_lint.
  If LINT_FAIL: fix violations and re-lint (max 2 retries).
  Once LINT_PASS or LINT_WARN: call write_refactored_code with final code.

STAGE 5 — SUMMARY
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
# Evaluation → Phoenix span annotation
# ===========================================================================

def _annotate_span_with_evaluation(judge_report: dict) -> None:
    """
    Write LLM-as-a-Judge scores as attributes on the active OTel span.

    This is what closes the self-improvement loop:
    - Stage 6 of this run writes eval.* attributes to the Phoenix span.
    - The next run's Stage 2 queries those attributes via phoenix_search_spans.
    - The agent calibrates its refactor strategy based on what worked before.
    """
    span = otel_trace.get_current_span()
    if span is otel_trace.INVALID_SPAN:
        logger.debug("No active span — eval annotation skipped")
        return

    attrs = {
        "eval.technical_debt_reduction_pct": judge_report.get("technical_debt_reduction_percentage"),
        "eval.cyclomatic_complexity":         judge_report.get("cyclomatic_complexity"),
        "eval.architectural_drift_risk":      judge_report.get("architectural_drift_risk"),
        "eval.modularity_ratio":              judge_report.get("modularity_ratio"),
        "eval.verdict":                       judge_report.get("verdict"),
        "eval.confidence_pct":               judge_report.get("confidence_pct"),
        "eval.summary":                       judge_report.get("summary"),
        "dpe.pipeline":                       _PROJECT_NAME,
    }

    for key, value in attrs.items():
        if value is not None:
            span.set_attribute(
                key,
                value if isinstance(value, (str, int, float, bool)) else str(value),
            )

    logger.info(
        "Span annotated with eval → verdict=%s debt_reduction=%s%%",
        judge_report.get("verdict"),
        judge_report.get("technical_debt_reduction_percentage"),
    )


# ===========================================================================
# Core orchestration loop (async — runs in thread pool from server.py)
# ===========================================================================

async def _run_agent_loop(file_path: str) -> dict:
    """
    Internal async implementation.  Called by process_pipeline_submission
    which wraps it in asyncio.run() for the synchronous FastAPI executor.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"status": "error", "error": "GEMINI_API_KEY not set"}

    client = genai.Client(api_key=api_key)

    # ------------------------------------------------------------------
    # Start Phoenix MCP client and get real tool declarations
    # ------------------------------------------------------------------
    async with PhoenixMCPClient() as mcp:
        phoenix_declarations = mcp.get_tool_declarations()

        if phoenix_declarations:
            logger.info(
                "Phoenix MCP connected — %d tools bound to agent",
                len(phoenix_declarations),
            )
        else:
            logger.warning(
                "Phoenix MCP unavailable — Stage 2 will use fallback text only"
            )

        # Combine local tools + live Phoenix MCP tools in one Tool object
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
            # Gemini 3 Flash: disable thinking entirely when using function calling.
            # The thought_signature requirement causes 400 errors in tool call loops.
            thinking_config=types.ThinkingConfig(
                thinking_budget=0,
                include_thoughts=False,
            ),
        )

        contents: list[types.Content] = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=(
                    f"New DPE pipeline submission received.\n"
                    f"File path: {file_path}\n\n"
                    "Execute all five pipeline stages in order. "
                    "IMPORTANT: Do not skip Stage 2 — always call at least "
                    "one Phoenix MCP tool, even if no history is returned."
                ))],
            )
        ]

        original_code: str | None = None
        refactored_code: str | None = None
        lint_result: str = "NOT_RUN"
        final_summary: dict = {}

        logger.info("DPE pipeline started → %s", file_path)

        # ------------------------------------------------------------------
        # Agentic loop
        # ------------------------------------------------------------------
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
                    # Route to live Phoenix MCP subprocess
                    result_part = await mcp.dispatch(fn)
                else:
                    # Route to local Python tool
                    result_part = _dispatch_local_tool(fn)

                result_str: str = result_part.function_response.response.get("result", "")

                # Capture outputs needed for post-loop stages
                if fn.name == "read_source_code" and not result_str.startswith("ERROR:"):
                    original_code = result_str
                elif fn.name == "run_syntax_lint":
                    lint_result = result_str
                elif fn.name == "write_refactored_code":
                    refactored_code = (dict(fn.args) if fn.args else {}).get("clean_code", "")

                tool_response_parts.append(result_part)

            contents.append(types.Content(role="user", parts=tool_response_parts))

    # ------------------------------------------------------------------
    # Parse the agent's final JSON summary
    # ------------------------------------------------------------------
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
                            logger.warning("Could not parse agent summary JSON")
                    break
            break

    # ------------------------------------------------------------------
    # LLM-as-a-Judge evaluation
    # ------------------------------------------------------------------
    judge_report: dict = {}

    if original_code and refactored_code:
        logger.info("Running LLM-as-a-Judge …")
        judge_json = evaluate_code_quality(original_code, refactored_code)
        try:
            judge_report = json.loads(judge_json)
        except json.JSONDecodeError:
            judge_report = {"error": "parse_failed", "raw": judge_json[:500]}
    else:
        judge_report = {
            "error": "missing_artifacts",
            "original_captured": bool(original_code),
            "refactored_captured": bool(refactored_code),
        }

    # ------------------------------------------------------------------
    # Annotate evaluation scores onto the active Phoenix span (Stage 6)
    # ------------------------------------------------------------------
    _annotate_span_with_evaluation(judge_report)

    # ------------------------------------------------------------------
    # Pipeline outcome
    # ------------------------------------------------------------------
    verdict = judge_report.get("verdict", "reject")
    lint_ok = lint_result.startswith("LINT_PASS") or lint_result.startswith("LINT_WARN")
    refactored_path: str | None = None

    if verdict == "approve" and lint_ok and refactored_code:
        p = Path(file_path)
        refactored_path = str(p.parent / f"{p.stem}_refactored{p.suffix}")
        write_refactored_code(refactored_path, refactored_code)
        status = "approved"
        logger.info("Pipeline APPROVED → %s", refactored_path)
    else:
        status = "rejected"
        logger.info(
            "Pipeline REJECTED → verdict=%s lint=%s",
            verdict,
            lint_result[:50],
        )

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
    Synchronous entry point for the DPE pipeline.

    Runs the async _run_agent_loop in a new event loop so it can be called
    from a thread pool executor without conflicting with the FastAPI event loop.

    Args:
        file_path: Path to the AI-generated source file to process.

    Returns:
        Pipeline result dict — see _run_agent_loop for key documentation.
    """
    try:
        return asyncio.run(_run_agent_loop(file_path))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline exception for %s", file_path)
        return {"status": "error", "error": str(exc)}
