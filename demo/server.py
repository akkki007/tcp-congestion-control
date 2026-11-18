"""Dashboard backend: runs demo scenarios and streams events over SSE.

    python -m demo.server            # http://127.0.0.1:8765
    python -m demo.server --sim      # force the simulated socket/kernel (any OS)

Endpoints (stdlib asyncio only, no web framework):
    GET  /api/status   kernel CC list, guard config, whether a run is active
    POST /api/run      start a scenario (409 if one is already running)
    GET  /api/events   text/event-stream; replays the current run, then live events
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os

from demo.runner import run_scenario, scenario_config

log = logging.getLogger("accc.server")


class Hub:
    def __init__(self) -> None:
        self.history: list[dict] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def publish(self, e: dict) -> None:
        self.history.append(e)
        for q in self.subscribers:
            q.put_nowait(e)

    def start(self) -> bool:
        if self.running:
            return False
        self.history = []
        self.publish({"event": "reset"})
        self.task = asyncio.create_task(self._run())
        return True

    async def _run(self) -> None:
        try:
            await run_scenario(self.publish)
        except Exception as exc:  # surfaced to the UI rather than lost in a log
            log.exception("scenario failed")
            self.publish({"event": "error", "message": str(exc)})


def _response(status: str, body: dict) -> bytes:
    data = json.dumps(body).encode()
    return (f"HTTP/1.1 {status}\r\nContent-Type: application/json\r\n"
            f"Content-Length: {len(data)}\r\nAccess-Control-Allow-Origin: *\r\n"
            "Connection: close\r\n\r\n").encode() + data


async def handle(hub: Hub, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        request = await reader.readline()
        while (await reader.readline()) not in (b"\r\n", b"\n", b""):
            pass  # headers are not needed
        method, path, *_ = request.decode().split()
        path = path.split("?")[0]
        if method == "OPTIONS":
            writer.write(b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\n"
                         b"Access-Control-Allow-Methods: GET, POST\r\nConnection: close\r\n\r\n")
        elif method == "GET" and path == "/api/status":
            writer.write(_response("200 OK", {**scenario_config(), "running": hub.running}))
        elif method == "POST" and path == "/api/run":
            ok = hub.start()
            writer.write(_response("202 Accepted" if ok else "409 Conflict", {"started": ok}))
        elif method == "GET" and path == "/api/events":
            await stream(hub, writer)
        else:
            writer.write(_response("404 Not Found", {"error": "not found"}))
        await writer.drain()
    except (ConnectionError, ValueError):
        pass
    finally:
        writer.close()


async def stream(hub: Hub, writer: asyncio.StreamWriter) -> None:
    writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n"
                 b"Cache-Control: no-cache, no-transform\r\nX-Accel-Buffering: no\r\nAccess-Control-Allow-Origin: *\r\n"
                 b"Connection: keep-alive\r\n\r\n: connected\n\n")
    q: asyncio.Queue = asyncio.Queue()
    for e in hub.history:
        q.put_nowait(e)
    hub.subscribers.add(q)
    try:
        while True:
            try:
                e = await asyncio.wait_for(q.get(), timeout=15)
                writer.write(f"data: {json.dumps(e)}\n\n".encode())
            except asyncio.TimeoutError:
                writer.write(b": keep-alive\n\n")
            await writer.drain()
    finally:
        hub.subscribers.discard(q)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--sim", action="store_true", help="force the simulated scenario (no shim needed)")
    args = ap.parse_args()
    if args.sim:
        os.environ["ACCC_MODE"] = "simulated"
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    hub = Hub()
    server = await asyncio.start_server(lambda r, w: handle(hub, r, w), args.host, args.port)
    log.info("dashboard backend on http://%s:%d (%s mode)", args.host, args.port, scenario_config()["mode"])
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
