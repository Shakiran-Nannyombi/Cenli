"""
tests/test_server.py
--------------------
Integration tests for the FastAPI server endpoints.
The pipeline/submit route is mocked so no real Gemini API key is needed.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src.server import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_status_returns_ok(self):
        response = client.get("/api/pipeline/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "gemini_configured" in data
        assert "phoenix_endpoint" in data


class TestEvaluateEndpoint:
    def test_evaluate_returns_judge_schema(self):
        mock_judge = {
            "technical_debt_reduction_percentage": 55,
            "cyclomatic_complexity": "Low",
            "architectural_drift_risk": "None",
            "modularity_ratio": "Highly Modular",
            "verdict": "approve",
            "confidence_pct": 87,
            "summary": "Significant improvement in structure.",
        }
        with patch("src.server.evaluate_code_quality", return_value=__import__("json").dumps(mock_judge)):
            response = client.post(
                "/api/evaluate",
                json={"original": "def f(): pass", "refactored": "def f() -> None: pass"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["verdict"] in ("approve", "reject")
        assert "technical_debt_reduction_percentage" in data


class TestSubmitEndpoint:
    def test_submit_returns_pipeline_result(self):
        mock_result = {
            "status": "approved",
            "lint": "LINT_PASS: black: formatted ✓",
            "judge_report": {"verdict": "approve", "confidence_pct": 90},
            "agent_summary": {},
            "refactored_path": "/tmp/dpe_submission_refactored.py",
        }
        with patch("src.server.process_pipeline_submission", return_value=mock_result):
            response = client.post(
                "/api/pipeline/submit",
                json={"filename": "test.py", "code": "x = 1\n"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("approved", "rejected", "error")
