"""
tools/code_io.py
----------------
File-system and CI-pipeline tools exposed to the Gemini agent as
local function calls.  Every function returns a plain string so the
model can interpret the result directly without extra marshalling.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# File reading
# ---------------------------------------------------------------------------

def read_source_code(file_path: str) -> str:
    """
    Read raw source code from *file_path* and return it as a string.

    Returns a descriptive error string (never raises) so the agent can
    decide how to handle missing or unreadable files gracefully.

    Args:
        file_path: Absolute or relative path to the source file.

    Returns:
        The file contents, or an error message prefixed with "ERROR:".
    """
    path = Path(file_path)

    if not path.exists():
        return f"ERROR: file not found → {file_path}"

    if not path.is_file():
        return f"ERROR: path is not a regular file → {file_path}"

    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        return f"ERROR: could not read file → {exc}"


# ---------------------------------------------------------------------------
# File writing
# ---------------------------------------------------------------------------

def write_refactored_code(file_path: str, clean_code: str) -> str:
    """
    Overwrite *file_path* with *clean_code* (the agent's refactored output).

    Parent directories are created automatically.  The original file is
    *not* backed up here — callers should handle versioning upstream.

    Args:
        file_path:  Destination path for the refactored artifact.
        clean_code: The fully refactored, production-ready source code.

    Returns:
        A success message with the resolved path, or an "ERROR:" string.
    """
    path = Path(file_path)

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(clean_code, encoding="utf-8")
        return f"OK: refactored code written to {path.resolve()}"
    except OSError as exc:
        return f"ERROR: could not write file → {exc}"


# ---------------------------------------------------------------------------
# Syntax / lint check  (mocks CI pipeline step)
# ---------------------------------------------------------------------------

def run_syntax_lint(file_path: str) -> str:
    """
    Run a lightweight syntax + style lint check against *file_path* using
    **black** (formatter check) and **flake8** (style linter) when they are
    available on the system, falling back to the built-in ``py_compile``
    module for a pure syntax check.

    This mirrors the first gate in a typical CI pipeline.

    Args:
        file_path: Path to the Python source file to validate.

    Returns:
        A structured result string:
        - "LINT_PASS: <details>" when all checks succeed.
        - "LINT_WARN: <details>" when only the fallback check was available.
        - "LINT_FAIL: <details>" when any check reports violations.
        - "ERROR: <details>" for IO / invocation problems.
    """
    path = Path(file_path)

    if not path.exists():
        return f"ERROR: file not found → {file_path}"

    results: list[str] = []
    any_failure = False

    # ------------------------------------------------------------------
    # 1. black --check  (non-zero exit → formatting needed)
    # ------------------------------------------------------------------
    black_available = _tool_available("black")
    if black_available:
        proc = subprocess.run(
            [sys.executable, "-m", "black", "--check", "--quiet", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            results.append("black: formatted ✓")
        else:
            any_failure = True
            detail = proc.stdout.strip() or proc.stderr.strip() or "formatting issues detected"
            results.append(f"black: FAIL — {detail}")

    # ------------------------------------------------------------------
    # 2. flake8  (non-zero exit → style violations)
    # ------------------------------------------------------------------
    flake8_available = _tool_available("flake8")
    if flake8_available:
        proc = subprocess.run(
            [sys.executable, "-m", "flake8", "--max-line-length=100", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            results.append("flake8: no violations ✓")
        else:
            any_failure = True
            violations = proc.stdout.strip() or proc.stderr.strip()
            results.append(f"flake8: FAIL — {violations}")

    # ------------------------------------------------------------------
    # 3. Fallback: py_compile  (syntax-only)
    # ------------------------------------------------------------------
    if not black_available and not flake8_available:
        proc = subprocess.run(
            [sys.executable, "-m", "py_compile", str(path)],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0:
            results.append("py_compile: syntax OK ✓  (install black + flake8 for full CI check)")
            summary = "LINT_WARN"
        else:
            any_failure = True
            results.append(f"py_compile: FAIL — {proc.stderr.strip()}")
            summary = "LINT_FAIL"
        return f"{summary}: {' | '.join(results)}"

    summary = "LINT_FAIL" if any_failure else "LINT_PASS"
    return f"{summary}: {' | '.join(results)}"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tool_available(module_name: str) -> bool:
    """Return True if *module_name* can be imported (i.e. the tool is installed)."""
    import importlib.util
    return importlib.util.find_spec(module_name) is not None
