from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from typing import Any

from google.genai import types

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MCP wire protocol helpers
# ---------------------------------------------------------------------------

def _make_request(method: str, params: dict | None = None, req_id: int = 1) -> bytes:
    """Encode a JSON-RPC 2.0 request as a newline-terminated UTF-8 bytes."""
    msg = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params:
        msg["params"] = params
    return (json.dumps(msg) + "\n").encode("utf-8")


async def _read_response(reader: asyncio.StreamReader) -> dict:
    """Read one newline-delimited JSON-RPC response from the stream."""
    raw = await asyncio.wait_for(reader.readline(), timeout=30.0)
    return json.loads(raw.decode("utf-8").strip())


# ---------------------------------------------------------------------------
# MCP type → Gemini Schema mapping
# ---------------------------------------------------------------------------

_MCP_TYPE_MAP: dict[str, types.Type] = {
    "string":  types.Type.STRING,
    "integer": types.Type.INTEGER,
    "number":  types.Type.NUMBER,
    "boolean": types.Type.BOOLEAN,
    "array":   types.Type.ARRAY,
    "object":  types.Type.OBJECT,
}


def _mcp_schema_to_gemini(mcp_schema: dict) -> types.Schema:
    """
    Convert a JSON Schema fragment (from MCP tool inputSchema) to a
    Gemini ``types.Schema`` object.

    Handles nested properties, required arrays, and array item schemas.
    Gemini 3 requires array types to always have an items field.
    """
    schema_type = _MCP_TYPE_MAP.get(
        mcp_schema.get("type", "string"), types.Type.STRING
    )
    props: dict[str, types.Schema] = {}
    required: list[str] = mcp_schema.get("required", [])

    for prop_name, prop_schema in mcp_schema.get("properties", {}).items():
        props[prop_name] = _mcp_schema_to_gemini(prop_schema)

    # Gemini 3 requires items schema for array types — default to STRING
    items_schema: types.Schema | None = None
    if schema_type == types.Type.ARRAY:
        raw_items = mcp_schema.get("items", {})
        items_schema = _mcp_schema_to_gemini(raw_items) if raw_items else types.Schema(type=types.Type.STRING)

    if props:
        return types.Schema(
            type=schema_type,
            properties=props,
            required=required if required else None,
            description=mcp_schema.get("description"),
            items=items_schema,
        )

    return types.Schema(
        type=schema_type,
        description=mcp_schema.get("description"),
        enum=mcp_schema.get("enum"),
        items=items_schema,
    )


# ---------------------------------------------------------------------------
# Phoenix MCP Client
# ---------------------------------------------------------------------------

class PhoenixMCPClient:
    """
    Async context manager that manages a @arizeai/phoenix-mcp subprocess
    and exposes its tools as Gemini FunctionDeclarations.

    Usage::

        async with PhoenixMCPClient() as mcp:
            declarations = mcp.get_tool_declarations()
            # add declarations to Gemini tool config...

            # inside agent loop:
            part = await mcp.dispatch(fn_call)
    """

    def __init__(self) -> None:
        self._process: asyncio.subprocess.Process | None = None
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._tools: list[dict] = []          # raw MCP tool descriptors
        self._req_counter: int = 0
        self._available: bool = False         # False if npx not found

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "PhoenixMCPClient":
        await self._start()
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._stop()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def _start(self) -> None:
        """Spawn the npx MCP process and perform the MCP handshake."""
        if not shutil.which("npx"):
            logger.warning(
                "npx not found — Phoenix MCP tools will be unavailable. "
                "Install Node.js 18+ to enable self-introspection."
            )
            self._available = False
            return

        phoenix_key = os.getenv("PHOENIX_API_KEY", "")
        # Respect explicit PHOENIX_BASE_URL first, then infer
        base_url = os.getenv("PHOENIX_BASE_URL", "").strip()
        if not base_url:
            is_cloud = phoenix_key and len(phoenix_key) > 100
            base_url = (
                "https://app.phoenix.arize.com"
                if is_cloud
                else "http://localhost:6006"
            )

        cmd = ["npx", "-y", "@arizeai/phoenix-mcp@latest", "--baseUrl", base_url]

        env = {**os.environ}
        if phoenix_key:
            env["PHOENIX_API_KEY"] = phoenix_key

        logger.info("Starting Phoenix MCP server → baseUrl=%s", base_url)

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except OSError as exc:
            logger.error("Failed to start Phoenix MCP process: %s", exc)
            self._available = False
            return

        self._reader = self._process.stdout  # type: ignore[assignment]
        self._writer_raw = self._process.stdin

        # MCP initialize handshake
        await self._send({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "cenli-dpe-agent", "version": "1.0.0"},
            },
        })

        init_resp = await self._recv()
        if "error" in init_resp:
            logger.error("MCP initialize failed: %s", init_resp["error"])
            self._available = False
            return

        # Send initialized notification (no response expected)
        await self._send({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        })

        # Discover available tools
        await self._send({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/list",
            "params": {},
        })

        tools_resp = await self._recv()
        self._tools = tools_resp.get("result", {}).get("tools", [])
        self._available = True
        logger.info("Phoenix MCP ready — %d tools available", len(self._tools))

    async def _stop(self) -> None:
        """Terminate the MCP subprocess."""
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self._process.kill()
        logger.debug("Phoenix MCP process stopped")

    # ------------------------------------------------------------------
    # JSON-RPC I/O
    # ------------------------------------------------------------------

    def _next_id(self) -> int:
        self._req_counter += 1
        return self._req_counter

    async def _send(self, msg: dict) -> None:
        if self._writer_raw is None:
            return
        data = (json.dumps(msg) + "\n").encode("utf-8")
        self._writer_raw.write(data)
        await self._writer_raw.drain()

    async def _recv(self) -> dict:
        if self._reader is None:
            return {}
        try:
            raw = await asyncio.wait_for(self._reader.readline(), timeout=30.0)
            return json.loads(raw.decode("utf-8").strip())
        except (asyncio.TimeoutError, json.JSONDecodeError) as exc:
            logger.error("MCP recv error: %s", exc)
            return {"error": str(exc)}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def is_available(self) -> bool:
        """True when the MCP subprocess started successfully."""
        return self._available

    def get_tool_declarations(self) -> list[types.FunctionDeclaration]:
        """
        Return the Phoenix MCP tools as Gemini FunctionDeclaration objects,
        ready to be included in a Tool() alongside the local tools.

        Tool names are prefixed with ``phoenix_`` to avoid collisions with
        the agent's local tools and to make Stage 2 tool calls identifiable
        in the dispatch loop.
        """
        if not self._available:
            return []

        declarations = []
        for tool in self._tools:
            name = f"phoenix_{tool['name']}"   # e.g. "phoenix_search_spans"
            desc = tool.get("description", f"Phoenix MCP tool: {tool['name']}")
            input_schema = tool.get("inputSchema", {"type": "object", "properties": {}})

            try:
                gemini_schema = _mcp_schema_to_gemini(input_schema)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not convert MCP schema for %s: %s", name, exc)
                gemini_schema = types.Schema(type=types.Type.OBJECT, properties={})

            declarations.append(
                types.FunctionDeclaration(
                    name=name,
                    description=desc,
                    parameters=gemini_schema,
                )
            )

        logger.debug("Exposing %d Phoenix MCP tools to Gemini", len(declarations))
        return declarations

    async def dispatch(self, fn_call: types.FunctionCall) -> types.Part:
        """
        Forward a Gemini phoenix_* function call to the MCP subprocess
        and return a FunctionResponse Part with the result.

        Strips the ``phoenix_`` prefix before sending to the MCP server.

        Args:
            fn_call: The FunctionCall Part emitted by Gemini for a phoenix_* tool.

        Returns:
            A FunctionResponse Part containing the tool result or an error string.
        """
        # Strip the "phoenix_" prefix to get the real MCP tool name
        mcp_tool_name = fn_call.name.removeprefix("phoenix_")
        args = dict(fn_call.args) if fn_call.args else {}

        logger.debug("→ Phoenix MCP call: %s(%s)", mcp_tool_name, args)

        if not self._available:
            result = "Phoenix MCP server is not available (npx not found or startup failed)"
            return types.Part.from_function_response(
                name=fn_call.name, response={"result": result}
            )

        req_id = self._next_id()
        await self._send({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": mcp_tool_name, "arguments": args},
        })

        resp = await self._recv()

        if "error" in resp:
            result = f"Phoenix MCP error: {resp['error']}"
            logger.warning("Phoenix MCP tool '%s' returned error: %s", mcp_tool_name, resp["error"])
        else:
            # MCP tools/call result shape: {"result": {"content": [{"type": "text", "text": "..."}]}}
            content_list = resp.get("result", {}).get("content", [])
            text_parts = [c.get("text", "") for c in content_list if c.get("type") == "text"]
            result = "\n".join(text_parts) or json.dumps(resp.get("result", {}))

        logger.debug("← Phoenix MCP result [%s]: %.200s", mcp_tool_name, result)

        return types.Part.from_function_response(
            name=fn_call.name,
            response={"result": result},
        )
