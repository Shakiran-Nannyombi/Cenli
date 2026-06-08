"""
tools/validator.py
------------------
LLM-as-a-Judge infrastructure.

Sends a strict, low-temperature structured-output request to Gemini to
evaluate the quality delta between the original AI-generated code and the
refactored output.  Returns a JSON string that maps 1-to-1 with the
Lovable frontend's ``Commit`` schema fields (modularity, drift, etc.).
"""

from __future__ import annotations

import json
import logging
import os

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Judge model — separate from the refactoring agent so bias is minimised
# ---------------------------------------------------------------------------
_JUDGE_MODEL = "gemini-2.5-flash"

# Evaluation rubric embedded in the system prompt so it survives across calls
_JUDGE_SYSTEM_PROMPT = """You are a strict, automated code-quality auditor — the LLM-as-a-Judge
for the Cenli DPE guardrail pipeline.

Your ONLY job is to compare two versions of a code artifact and return a
single JSON object that conforms EXACTLY to the schema below.  Do not add
prose, markdown fences, or any keys outside the schema.

SCHEMA:
{
  "technical_debt_reduction_percentage": <integer 0-100>,
  "cyclomatic_complexity":               "Low" | "Medium" | "High",
  "architectural_drift_risk":            "None" | "Low" | "High",
  "modularity_ratio":                    "Highly Modular" | "Partially Modular" | "Monolithic",
  "verdict":                             "approve" | "reject",
  "confidence_pct":                      <integer 0-100>,
  "summary":                             "<one sentence justification>"
}

SCORING RULES:
- technical_debt_reduction_percentage: 0 = no improvement, 100 = all debt eliminated.
- cyclomatic_complexity: assess the REFACTORED code only.
- architectural_drift_risk: how much does the refactored code deviate from
  idiomatic patterns for the detected language?
- modularity_ratio: is the refactored code properly decomposed into
  single-responsibility units?
- verdict: "approve" when technical_debt_reduction_percentage ≥ 40 AND
  architectural_drift_risk ≠ "High"; otherwise "reject".
- confidence_pct: your certainty in this evaluation (0-100).
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_code_quality(original: str, refactored: str) -> str:
    """
    Compare *original* (raw AI output) against *refactored* (agent output)
    and return a JSON string with structured quality metrics.

    The response is produced at temperature=0.1 with
    ``response_mime_type="application/json"`` so the output is always
    machine-parseable and can be fed directly to the frontend schema.

    Args:
        original:   The raw, unoptimised source code submitted to the pipeline.
        refactored: The cleaned, modular output produced by the refactor agent.

    Returns:
        A JSON string matching the judge schema, or a JSON-encoded error dict.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return json.dumps({"error": "GEMINI_API_KEY not set"})

    client = genai.Client(api_key=api_key)

    user_prompt = (
        "## ORIGINAL CODE (AI first-pass)\n"
        f"```\n{original}\n```\n\n"
        "## REFACTORED CODE (DPE agent output)\n"
        f"```\n{refactored}\n```\n\n"
        "Evaluate the refactored code against the original and return the "
        "JSON object as specified in your system instructions.  No other text."
    )

    try:
        response = client.models.generate_content(
            model=_JUDGE_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=_JUDGE_SYSTEM_PROMPT,
                # Low temperature → deterministic, consistent scoring
                temperature=0.1,
                # Force JSON output — safe for frontend schema consumption
                response_mime_type="application/json",
            ),
        )

        raw = response.text.strip()
        # Validate it round-trips to JSON before returning
        parsed = json.loads(raw)
        logger.info("Judge verdict: %s", parsed.get("verdict"))
        return json.dumps(parsed, indent=2)

    except json.JSONDecodeError as exc:
        logger.error("Judge returned non-JSON output: %s", exc)
        return json.dumps({"error": "judge_non_json", "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Judge call failed")
        return json.dumps({"error": "judge_call_failed", "detail": str(exc)})
