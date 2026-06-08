"""
agent.py
--------
Core Agent Orchestration Loop for the Cenli DPE guardrail pipeline.

Pipeline stages
---------------
1. Read raw source code from disk via local tool call.
2. Query historical Phoenix traces via the Phoenix MCP server to surface
   recurring error patterns and token-bottleneck hotspots.
3. Refactor the monolithic code into a clean, production-grade structure.
4. Validate the refactored output through the LLM-as-a-Judge engine.
5. Write the approved artifact back to disk.

Observability
-------------
All Gemini calls are automatically traced via OpenInference / OTLP and sent
to the local Arize Phoenix collector defined by PHOENIX_COLLECTOR_ENDPOINT.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Arize Phoenix — OpenTelemetry tracing
# ---------------------------------------------------------------------------
import phoenix.otel  # noqa: F401  (side-effect: registers OTLP exporter)
from openinference.instrumentation.google_genai import GoogleGenAIInstrumentor

# ---------------------------------------------------------------------------
# Google GenAI SDK
# ---------------------------------------------------------------------------
from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# Local tool implementations
# ---------------------------------------------------------------------------
from src.tools.code_io import read_source_code, write_refactored_code, run_syntax_lint
from src.tools.validator import evaluate_code_quality

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_PROJECT_NAME = "dev-clarifier-dpe"
_REFACTOR_MODEL = "gemini-2.5-flash"

# ---------------------------------------------------------------------------
# Tracing bootstrap  (called once at module import time)
# ---------------------------------------------------------------------------

def _bootstrap_tracing() -> None:
    """
    Register Phoenix OpenTelemetry tracing and auto-instrument the Google
    GenAI SDK.

    The Phoenix collector endpoint is read from PHOENIX_COLLECTOR_ENDPOINT
    (default: http://localhost:6006/v1/traces).  The Phoenix API key is
    optional and only needed when connecting to the hosted Phoenix Cloud.
    """
    collector_endpoint = os.getenv(
        "PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces"
    )
    phoenix_api_key = os.getenv("PHOENIX_API_KEY")  # None for local Phoenix

    headers: dict[str, str] = {}
    if phoenix_api_key:
        headers["api_key"] = phoenix_api_key

    # Register the OTLP exporter pointing at Phoenix
    phoenix.otel.register(
        project_name=_PROJECT_NAME,
        endpoint=collector_endpoint,
        headers=headers if headers else None,
    )

    # Auto-instrument every google-genai SDK call (wraps generate_content,
    # chat, embeddings, etc.) so traces appear in Phoenix without extra code.
    GoogleGenAIInstrumentor().instrument()

    logger.info(
        "Phoenix tracing active → project='%s' endpoint='%s'",
        _PROJECT_NAME,
        collector_endpoint,
    )


_bootstrap_tracing()


# ---------------------------------------------------------------------------
# Local tool schema  (exposed to Gemini as function declarations)
# ---------------------------------------------------------------------------

_LOCAL_TOOLS = [
    types.FunctionDeclaration(
        name="read_source_code",
        description=(
            "Read the raw source code of a file from disk and return its contents "
            "as a string.  Use this first to ingest the submitted code artifact."
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
            "Write the final, refactored source code back to disk, overwriting "
            "the target artifact.  Call this ONLY after the judge has approved "
            "the refactor."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Destination path for the refactored code artifact.",
                ),
                "clean_code": types.Schema(
                    type=types.Type.STRING,
                    description="The complete, production-ready refactored source code.",
                ),
            },
            required=["file_path", "clean_code"],
        ),
    ),
    types.FunctionDeclaration(
        name="run_syntax_lint",
        description=(
            "Run a CI-grade syntax and style lint check (black + flake8) on a "
            "Python source file.  Returns LINT_PASS, LINT_WARN, or LINT_FAIL."
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

# Dispatch table: maps function name → callable
_TOOL_DISPATCH: dict[str, callable] = {
    "read_source_code": read_source_code,
    "write_refactored_code": write_refactored_code,
    "run_syntax_lint": run_syntax_lint,
}


# ---------------------------------------------------------------------------
# Tool call handler
# ---------------------------------------------------------------------------

def _handle_tool_call(fn_call: types.FunctionCall) -> types.Part:
    """
    Dispatch a Gemini function-call request to the matching local tool and
    wrap the result as a ``FunctionResponse`` Part ready for the next turn.

    Args:
        fn_call: The FunctionCall Part emitted by the model.

    Returns:
        A FunctionResponse Part containing the tool's string output.
    """
    name = fn_call.name
    args = dict(fn_call.args) if fn_call.args else {}

    logger.debug("Tool call → %s(%s)", name, args)

    handler = _TOOL_DISPATCH.get(name)
    if handler is None:
        result = f"ERROR: unknown tool '{name}'"
    else:
        try:
            result = handler(**args)
        except Exception as exc:  # noqa: BLE001
            result = f"ERROR: tool execution failed → {exc}"

    logger.debug("Tool result ← %s: %s", name, result[:120])

    return types.Part.from_function_response(
        name=name,
        response={"result": result},
    )


# ---------------------------------------------------------------------------
# Agent system prompt
# ---------------------------------------------------------------------------

_AGENT_SYSTEM_PROMPT = """You are the Cenli DPE Guardrail Agent — an autonomous Developer Productivity
Engineering pipeline for AI-generated code quality enforcement.

Your pipeline has four mandatory stages:

STAGE 1 — INGEST
  Call `read_source_code` to load the submitted code artifact.

STAGE 2 — HISTORICAL CONTEXT (Phoenix MCP)
  Query the connected Phoenix MCP server for historical trace data on this
  file or similar patterns.  Ask: "Have previous refactors of this code type
  caused token bottlenecks, high regression risk, or architectural drift?"
  Use that context to inform your refactor strategy.

STAGE 3 — REFACTOR
  Rewrite the code into a clean, modular, production-grade architecture:
  - Single-responsibility functions / classes
  - Typed interfaces and input validation (zod / pydantic pattern)
  - Remove cyclomatic complexity > 10
  - Eliminate duplicated logic (Jaccard similarity ≥ 0.85 threshold)
  - Preserve all original business logic — do NOT change semantics

STAGE 4 — LINT
  Call `run_syntax_lint` on the refactored code written to a temp path to
  confirm it passes CI checks before finalising.

After completing all stages, emit a final JSON summary block:
{
  "stage": "complete",
  "original_loc": <int>,
  "refactored_loc": <int>,
  "lint_status": "LINT_PASS" | "LINT_WARN" | "LINT_FAIL",
  "refactored_code": "<full refactored source>"
}
"""


# ---------------------------------------------------------------------------
# Core orchestration loop
# ---------------------------------------------------------------------------

def process_pipeline_submission(file_path: str) -> dict:
    """
    Run the full DPE agent pipeline for a submitted source file.

    Stages:
      1. Ingest source code via local tool call.
      2. Query Phoenix MCP for historical trace context.
      3. Instruct Gemini to produce a refactored version.
      4. Validate the refactor with the LLM-as-a-Judge engine.
      5. Write the approved artifact to ``<original>_refactored<ext>``.

    Args:
        file_path: Path to the AI-generated source file to process.

    Returns:
        A dict with keys:
        - ``status``         : "approved" | "rejected" | "error"
        - ``lint``           : lint check result string
        - ``judge_report``   : parsed JSON dict from the judge evaluation
        - ``refactored_path``: path the approved code was written to (if approved)
        - ``error``          : error message (only when status == "error")
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"status": "error", "error": "GEMINI_API_KEY environment variable not set"}

    client = genai.Client(api_key=api_key)

    # Build the tool config — binds local function declarations to this call
    tool_config = types.Tool(function_declarations=_LOCAL_TOOLS)

    # Agentic config — AUTO mode lets Gemini decide when to call tools
    gen_config = types.GenerateContentConfig(
        system_instruction=_AGENT_SYSTEM_PROMPT,
        tools=[tool_config],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.AUTO,
            )
        ),
        temperature=0.2,  # Low but not zero — allows creative refactoring
    )

    # Seed the conversation with the user task
    initial_prompt = (
        f"Process the following submission through the full DPE pipeline.\n"
        f"File path: {file_path}\n\n"
        "Run all four pipeline stages in order.  After completing Stage 4 "
        "(lint), output the final JSON summary block as described."
    )

    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part.from_text(initial_prompt)])
    ]

    refactored_code: str | None = None
    lint_result: str = "NOT_RUN"
    original_code: str | None = None
    final_summary: dict = {}

    # ------------------------------------------------------------------
    # Agentic loop — continue until the model stops issuing tool calls
    # ------------------------------------------------------------------
    logger.info("Starting DPE pipeline for: %s", file_path)

    for turn in range(20):  # hard cap to prevent runaway loops
        logger.debug("Agent turn %d", turn)

        response = client.models.generate_content(
            model=_REFACTOR_MODEL,
            contents=contents,
            config=gen_config,
        )

        candidate = response.candidates[0]
        response_parts: list[types.Part] = list(candidate.content.parts)

        # Append model response to conversation history
        contents.append(
            types.Content(role="model", parts=response_parts)
        )

        # Check if the model issued any tool calls this turn
        tool_calls = [p for p in response_parts if p.function_call]

        if not tool_calls:
            # No more tool calls → model has finished the agentic loop
            logger.info("Agent completed agentic loop after %d turns", turn + 1)
            break

        # Execute each tool call and collect the responses
        tool_response_parts: list[types.Part] = []
        for part in tool_calls:
            fn_call = part.function_call

            # Capture outputs of interest for post-processing
            if fn_call.name == "read_source_code":
                tool_result_part = _handle_tool_call(fn_call)
                # Extract original code from the result for judge comparison
                result_text = tool_result_part.function_response.response.get("result", "")
                if not result_text.startswith("ERROR:"):
                    original_code = result_text
            elif fn_call.name == "run_syntax_lint":
                tool_result_part = _handle_tool_call(fn_call)
                lint_result = tool_result_part.function_response.response.get("result", "NOT_RUN")
            elif fn_call.name == "write_refactored_code":
                # Extract clean_code before writing so we can pass it to the judge
                args = dict(fn_call.args) if fn_call.args else {}
                refactored_code = args.get("clean_code", "")
                tool_result_part = _handle_tool_call(fn_call)
            else:
                tool_result_part = _handle_tool_call(fn_call)

            tool_response_parts.append(tool_result_part)

        # Feed all tool responses back to the model in a single user turn
        contents.append(
            types.Content(role="user", parts=tool_response_parts)
        )

    # ------------------------------------------------------------------
    # Extract the final JSON summary from the last model message
    # ------------------------------------------------------------------
    last_model_text = ""
    for content in reversed(contents):
        if content.role == "model":
            for part in content.parts:
                if hasattr(part, "text") and part.text:
                    last_model_text = part.text
                    break
            break

    # Try to parse the JSON summary block from the model's final response
    try:
        import re
        json_match = re.search(r"\{[\s\S]*\}", last_model_text)
        if json_match:
            final_summary = json.loads(json_match.group())
            # Also capture refactored_code from the summary if not captured earlier
            if not refactored_code and "refactored_code" in final_summary:
                refactored_code = final_summary["refactored_code"]
    except (json.JSONDecodeError, AttributeError):
        logger.warning("Could not parse final JSON summary from agent output")

    # ------------------------------------------------------------------
    # Stage 4: LLM-as-a-Judge evaluation
    # ------------------------------------------------------------------
    judge_report: dict = {}

    if original_code and refactored_code:
        logger.info("Running LLM-as-a-Judge evaluation …")
        judge_json = evaluate_code_quality(original_code, refactored_code)
        try:
            judge_report = json.loads(judge_json)
        except json.JSONDecodeError:
            judge_report = {"error": "judge_parse_failed", "raw": judge_json}
    else:
        logger.warning("Skipping judge: original or refactored code not captured")
        judge_report = {"error": "missing_artifacts"}

    # ------------------------------------------------------------------
    # Determine pipeline outcome
    # ------------------------------------------------------------------
    verdict = judge_report.get("verdict", "reject")
    lint_pass = lint_result.startswith("LINT_PASS") or lint_result.startswith("LINT_WARN")

    if verdict == "approve" and lint_pass and refactored_code:
        # Write the approved artifact to a *_refactored file
        p = Path(file_path)
        refactored_path = str(p.parent / f"{p.stem}_refactored{p.suffix}")
        write_refactored_code(refactored_path, refactored_code)
        status = "approved"
    elif verdict == "reject":
        status = "rejected"
        refactored_path = None
    else:
        # Lint failed — write for inspection but flag as rejected
        p = Path(file_path)
        refactored_path = str(p.parent / f"{p.stem}_refactored{p.suffix}")
        write_refactored_code(refactored_path, refactored_code or "")
        status = "rejected"

    result = {
        "status": status,
        "lint": lint_result,
        "judge_report": judge_report,
        "agent_summary": final_summary,
    }
    if refactored_path:
        result["refactored_path"] = refactored_path

    logger.info("Pipeline complete → status=%s verdict=%s lint=%s", status, verdict, lint_result[:30])
    return result
