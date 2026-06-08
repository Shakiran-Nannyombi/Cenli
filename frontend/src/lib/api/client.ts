/**
 * client.ts
 * ---------
 * Typed API client for the Cenli DPE backend.
 *
 * Base URL is read from VITE_API_URL at build time.
 * Falls back to the deployed Cloud Run URL so the frontend works
 * without any config in development too.
 */

const BASE_URL =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    "https://cenli-dpe-backend-183690574774.europe-west2.run.app";

// ---------------------------------------------------------------------------
// Types — mirror the backend response shapes
// ---------------------------------------------------------------------------

export interface JudgeReport {
    technical_debt_reduction_percentage: number;
    cyclomatic_complexity: "Low" | "Medium" | "High";
    architectural_drift_risk: "None" | "Low" | "High";
    modularity_ratio: "Highly Modular" | "Partially Modular" | "Monolithic";
    verdict: "approve" | "reject";
    confidence_pct: number;
    summary: string;
    error?: string;
}

export interface PipelineResult {
    status: "approved" | "rejected" | "error";
    lint: string;
    judge_report: JudgeReport;
    agent_summary: {
        stage?: string;
        original_loc?: number;
        refactored_loc?: number;
        lint_status?: string;
        refactor_strategy?: string;
        refactored_code?: string;
    };
    refactored_path?: string;
    error?: string;
}

export interface BackendStatus {
    status: string;
    version: string;
    gemini_configured: boolean;
    phoenix_mode: "cloud" | "local";
    phoenix_collector: string;
    project: string;
}

export interface PhoenixSpanAttr {
    key: string;
    value: string | number;
}

export interface PhoenixSpan {
    name: string;
    spanId: string;
    traceId: string;
    parentSpanId?: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    statusCode: "OK" | "ERROR" | "UNSET";
    attributes?: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Health check — confirms backend is up and Gemini is configured. */
export async function getBackendStatus(): Promise<BackendStatus> {
    return apiFetch<BackendStatus>("/api/pipeline/status");
}

/**
 * Submit code for the full DPE pipeline.
 * Stages: Ingest → Phoenix MCP → Refactor → Lint → Judge → Annotate
 */
export async function submitPipeline(
    code: string,
    filename = "submission.py",
): Promise<PipelineResult> {
    return apiFetch<PipelineResult>("/api/pipeline/submit", {
        method: "POST",
        body: JSON.stringify({ filename, code }),
    });
}

/**
 * Direct LLM-as-a-Judge evaluation — no agent loop.
 * Used by the Evaluations page to re-score any commit diff.
 */
export async function evaluateCode(
    original: string,
    refactored: string,
): Promise<JudgeReport> {
    return apiFetch<JudgeReport>("/api/evaluate", {
        method: "POST",
        body: JSON.stringify({ original, refactored }),
    });
}

/**
 * Fetch recent traces from Phoenix (proxied through the backend
 * so the API key is never exposed to the browser).
 */
export async function getTraces(limit = 20): Promise<unknown> {
    return apiFetch(`/api/traces?limit=${limit}`);
}

/**
 * Fetch all spans for a specific trace.
 */
export async function getTraceSpans(traceId: string): Promise<unknown> {
    return apiFetch(`/api/traces/${traceId}/spans`);
}
