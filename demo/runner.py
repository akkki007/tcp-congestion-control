"""Reusable demo scenario: daemon + TCP sink + LD_PRELOADed workload.

Used by both the terminal demo (``demo.live_switch``) and the dashboard
backend (``demo.server``). Emits every controller event, application phase
change and a final summary through ``on_event``.
"""

from __future__ import annotations

import asyncio
import os
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Callable

from accc.daemon import Controller, available_algorithms, serve
from accc.guard import StabilityGuard
from accc.policy import HeuristicPolicy
from demo.simulate import SIM_ALGORITHMS, run_simulation

ROOT = Path(__file__).resolve().parent.parent
SHIM = ROOT / "shim" / "libaccc.so"


def scenario_mode() -> str:
    """``live`` drives a real socket through the shim; ``simulated`` models the socket and kernel.

    Live mode needs Linux and a built shim. ``ACCC_MODE=live|simulated`` overrides the choice.
    """
    forced = os.environ.get("ACCC_MODE")
    if forced in ("live", "simulated"):
        return forced
    return "live" if sys.platform.startswith("linux") and SHIM.exists() else "simulated"


def _sink(srv: socket.socket, result: dict) -> None:
    conn, _ = srv.accept()
    total = 0
    while data := conn.recv(1 << 20):
        total += len(data)
    result["received"] = total
    conn.send(b"k")
    conn.close()


def scenario_config(margin: float = 0.15, dwell_s: float = 0.2) -> dict:
    mode = scenario_mode()
    avail = available_algorithms() if mode == "live" else set(SIM_ALGORITHMS)
    return {
        "mode": mode,
        "available": sorted(avail),
        "interactive_cc": "vegas" if "vegas" in avail else "reno",
        "margin": margin,
        "dwell_ms": int(dwell_s * 1000),
        "interval_ms": 50,
        "window": 10,
    }


async def run_scenario(on_event: Callable[[dict], None], margin: float = 0.15,
                       dwell_s: float = 0.2) -> dict:
    cfg = scenario_config(margin, dwell_s)
    if cfg["mode"] == "simulated":
        return await run_simulation(on_event, cfg, margin, dwell_s)
    if not SHIM.exists():
        raise FileNotFoundError(f"{SHIM} missing; run `make shim`")
    avail = set(cfg["available"])
    t0 = time.monotonic()

    def emit(e: dict) -> None:
        e = dict(e)
        e["t"] = round(e.get("ts", time.monotonic()) - t0, 4)
        on_event(e)

    emit({"event": "start", **cfg})
    controller = Controller(HeuristicPolicy(cfg["interactive_cc"]),
                            StabilityGuard(margin=margin, dwell_s=dwell_s, allowed=avail),
                            window=cfg["window"], on_event=emit)
    sock_path = os.path.join(tempfile.mkdtemp(), "accc.sock")
    server = await serve(controller, sock_path)

    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    port = srv.getsockname()[1]
    result: dict = {}
    th = threading.Thread(target=_sink, args=(srv, result), daemon=True)
    th.start()

    env = dict(os.environ, LD_PRELOAD=str(SHIM), ACCC_SOCK=sock_path,
               ACCC_INTERVAL_MS=str(cfg["interval_ms"]))
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "demo.workload", "127.0.0.1", str(port),
        env=env, cwd=ROOT, stdout=asyncio.subprocess.PIPE)
    sent, final_cc = 0, "?"
    while line := await proc.stdout.readline():
        parts = line.decode().split()
        if parts and parts[0] == "PHASE":
            emit({"event": "phase", "phase": parts[1], "ts": float(parts[2])})
        elif parts and parts[0] == "DONE":
            sent = int(parts[1].split("=")[1])
            final_cc = parts[2].split("=")[1]
    await proc.wait()
    await asyncio.to_thread(th.join, 5)
    server.close()
    srv.close()

    summary = {
        "event": "summary",
        "bytes_sent": sent,
        "bytes_received": result.get("received", 0),
        "intact": sent == result.get("received"),
        "final_cc": final_cc,
        "switches": controller.total_switches,
        "duration_s": round(time.monotonic() - t0, 2),
    }
    emit(summary)
    return summary

