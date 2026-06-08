from __future__ import annotations

import json
import logging
import os

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Judge configuration
# ---------------------------------------------------------------------------
_JUDGE_MODEL = "gemini-3.0"

# JSON response schema — enforces the exact shape the frontend expects.
# Using response_schema in addition to response_mime_type gives us
# server-side validation from Gemini rather than relying on post-processing.
_RESPONSE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "technical_debt_reduction_percentage": types.Schema(
            type=types.Type.INTEGER,
            description="Estimated percentage of technical debt eliminated (0 = none, 100 = all).",
        ),
        "cyclomatic_complexity": types.Schema(
            type=types.Type.STRING,
            enum=["Low", "Medium", "High"],
            description="Cyclomatic complexity level of the REFACTORED code.",
        ),
        "architectural_drift_risk": types.Schema(
            type=types.Type.STRING,
            enum=["None", "Low", "High"],
            description=(
                "Risk that the refactored code deviates from idiomatic patterns "
                "for its language / framework."
            ),
        ),
        "modularity_ratio": types.Schema(
            type=types.Type.STRING,
            enum=["Highly Modular", "Partially Modular", "Monolithic"],
            description="Degree to which the refactored code follows single-responsibility principles.",
        ),
        "verdict": types.Schema(
            type=types.Type.STRING,
            enum=["approve", "reject"],
            description=(
                "'approve' when debt_reduction ≥ 40% AND drift_risk ≠ High; "
                "otherwise 'reject'."
            ),
        ),
        "confidence_pct": types.Schema(
            type=types.Type.INTEGER,
            description="Judge's confidence in this evaluation (0-100).",
        ),
        "summary": types.Schema(
            type=types.Type.STRING,
            description="One sentence justification for the verdict.",
        ),
    },
    required=[
        "technical_debt_reduction_percentage",
        "cyclomatic_complexity",
        "architectural_drift_risk",
        "modularity_ratio",
        "verdict",
        "confidence_pct",
        "summary",
    ],
)

_JUDGE_SYSTEM_PROMPT = """\
You are a strict, automated code-quality auditor for the Cenli DPE guardrail
pipeline.  Your role is LLM-as-a-Judge: compare two versions of a code
artifact and return a structured quality verdict.

SCORING RULES
─────────────
technical_debt_reduction_percentage
  0  = refactor made no measurable improvement
  100 = all identifiable technical debt was eliminated
  Score based on: reduced duplication, improved naming, removed dead code,
  added type annotations, simplified control flow.

cyclomatic_complexity
  Assess the REFACTORED code only.
  Low    → no function exceeds complexity 5
  Medium → some functions reach 6-10
  High   → any function exceeds 10

architectural_drift_risk
  None → refactor is idiomatic for the detected language/framework
  Low  → minor stylistic divergence, no structural concerns
  High → significant deviation from standard patterns (e.g. invented
         abstractions that don't follow the language's idioms)

modularity_ratio
  Highly Modular   → all units follow SRP, clear separation of concerns
  Partially Modular → some SRP violations remain
  Monolithic        → logic is still bundled into large undivided units

verdict
  "approve" when ALL of:
    - technical_debt_reduction_percentage ≥ 40
    - architectural_drift_risk ≠ "High"
  Otherwise "reject".

confidence_pct
  Your certainty in this evaluation (0-100).  Reflect genuine uncertainty
  when the diff is ambiguous.

Return ONLY the JSON object matching the schema.  No prose, no markdown.
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_code_quality(original: str, refactored: str) -> str:
    """
    Run the LLM-as-a-Judge evaluation comparing *original* to *refactored*.

    Uses ``response_mime_type="application/json"`` and a strict
    ``response_schema`` so the output is always machine-parseable.
    Temperature is set to 0.1 for deterministic, reproducible scoring.

    The returned JSON maps directly to the Cenli frontend's ``Commit``
    schema fields (modularity, drift, techDebt, complexity).

    Args:
        original:
            The raw, unoptimised source code submitted to the pipeline
            (what the AI generated before DPE intervention).
        refactored:
            The cleaned, modular output produced by the DPE refactor agent.

    Returns:
        A JSON string matching the judge schema, or a JSON-encoded error
        dict with an ``"error"`` key if the call fails.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return json.dumps({"error": "GEMINI_API_KEY not set"})

    if not original.strip() or not refactored.strip():
        return json.dumps({"error": "empty_input", "detail": "both original and refactored must be non-empty"})

    client = genai.Client(api_key=api_key)

    user_prompt = (
        "## ORIGINAL CODE (raw AI-generated, pre-DPE)\n"
        f"```\n{original}\n```\n\n"
        "## REFACTORED CODE (DPE agent output)\n"
        f"```\n{refactored}\n```\n\n"
        "Evaluate the refactored code according to your scoring rules and "
        "return the JSON object."
    )

    try:
        response = client.models.generate_content(
            model=_JUDGE_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=_JUDGE_SYSTEM_PROMPT,
                temperature=0.1,
                # Force structured JSON output — safe for frontend schema
                response_mime_type="application/json",
                response_schema=_RESPONSE_SCHEMA,
            ),
        )

        raw = response.text.strip()

        # Validate the response round-trips cleanly before returning
        parsed: dict = json.loads(raw)

        logger.info(
            "Judge evaluation complete → verdict=%s debt_reduction=%s%% confidence=%s%%",
            parsed.get("verdict"),
            parsed.get("technical_debt_reduction_percentage"),
            parsed.get("confidence_pct"),
        )

        return json.dumps(parsed, indent=2)

    except json.JSONDecodeError as exc:
        logger.error("Judge returned non-JSON: %s", exc)
        return json.dumps({
            "error": "judge_non_json",
            "detail": str(exc),
            "raw_preview": (response.text[:200] if "response" in dir() else ""),
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("Judge call failed")
        return json.dumps({"error": "judge_call_failed", "detail": str(exc)})
