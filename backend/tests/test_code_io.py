"""
tests/test_code_io.py
---------------------
Unit tests for the code_io tools.  No API keys required — these are pure
file-system operations.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from src.tools.code_io import read_source_code, write_refactored_code, run_syntax_lint


# ---------------------------------------------------------------------------
# read_source_code
# ---------------------------------------------------------------------------

class TestReadSourceCode:
    def test_reads_valid_file(self, tmp_path: Path):
        f = tmp_path / "sample.py"
        f.write_text("print('hello')", encoding="utf-8")
        result = read_source_code(str(f))
        assert result == "print('hello')"

    def test_returns_error_for_missing_file(self):
        result = read_source_code("/nonexistent/path/file.py")
        assert result.startswith("ERROR:")

    def test_returns_error_for_directory(self, tmp_path: Path):
        result = read_source_code(str(tmp_path))
        assert result.startswith("ERROR:")


# ---------------------------------------------------------------------------
# write_refactored_code
# ---------------------------------------------------------------------------

class TestWriteRefactoredCode:
    def test_writes_and_reads_back(self, tmp_path: Path):
        dest = tmp_path / "output.py"
        code = "def foo():\n    return 42\n"
        result = write_refactored_code(str(dest), code)
        assert result.startswith("OK:")
        assert dest.read_text(encoding="utf-8") == code

    def test_creates_parent_directories(self, tmp_path: Path):
        dest = tmp_path / "nested" / "deep" / "output.py"
        result = write_refactored_code(str(dest), "x = 1\n")
        assert result.startswith("OK:")
        assert dest.exists()

    def test_overwrites_existing_file(self, tmp_path: Path):
        dest = tmp_path / "out.py"
        dest.write_text("old content")
        write_refactored_code(str(dest), "new content")
        assert dest.read_text() == "new content"


# ---------------------------------------------------------------------------
# run_syntax_lint
# ---------------------------------------------------------------------------

class TestRunSyntaxLint:
    def test_valid_python_passes(self, tmp_path: Path):
        f = tmp_path / "good.py"
        f.write_text("def add(a: int, b: int) -> int:\n    return a + b\n")
        result = run_syntax_lint(str(f))
        # Should be LINT_PASS or LINT_WARN (if linters not installed), never LINT_FAIL
        assert result.startswith("LINT_PASS") or result.startswith("LINT_WARN")

    def test_syntax_error_fails(self, tmp_path: Path):
        f = tmp_path / "bad.py"
        f.write_text("def broken(\n    return None\n")
        result = run_syntax_lint(str(f))
        # May be LINT_FAIL (flake8) or LINT_FAIL (py_compile)
        # At minimum it should not be LINT_PASS
        assert not result.startswith("LINT_PASS")

    def test_missing_file_returns_error(self):
        result = run_syntax_lint("/no/such/file.py")
        assert result.startswith("ERROR:")
