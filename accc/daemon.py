"""ACCC controller daemon.

Accepts connections from the LD_PRELOAD shim, keeps a sliding telemetry window
per socket, runs the policy + stability guard, and sends switch commands back.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from .features import DEFAULT_WINDOW, FlowWindow
from .guard import StabilityGuard
from .policy import Policy
from .telemetry import TelemetrySample

log = logging.getLogger("accc")


def available_algorithms() -> set[str]:
    try:
        with open("/proc/sys/net/ipv4/tcp_available_congestion_control") as f:
            return set(f.read().split())
    except OSError:
        return set()


@dataclass
class Flow:
    pid: int
    fd: int
    src: str
    dst: str
    cc: str
    window: FlowWindow
    last_switch_ts: float = field(default_factory=time.monotonic)
    pending: str | None = None
    switches: int = 0


class Controller:
    def __init__(
        self,
        policy: Policy,
        guard: StabilityGuard,
        window: int = DEFAULT_WINDOW,
        on_event: Callable[[dict], None] | None = None,
    ) -> None:
        self.policy = policy
        self.guard = guard
        self.window = window
        self.flows: dict[tuple[int, int], Flow] = {}
        self.total_switches = 0
        self.on_event = on_event or (lambda e: None)

    def _emit(self, **e) -> None:
        e.setdefault("ts", time.monotonic())
        self.on_event(e)

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        owned: set[tuple[int, int]] = set()
        try:
            while line := await reader.readline():
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cmd = self.process(msg, owned)
                if cmd:
                    writer.write((json.dumps(cmd, separators=(",", ":")) + "\n").encode())
                    await writer.drain()
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            for key in owned:
                self.flows.pop(key, None)
            writer.close()

    def process(self, msg: dict, owned: set[tuple[int, int]]) -> dict | None:
        t, key = msg.get("t"), (msg.get("pid"), msg.get("fd"))
        if t == "reg":
            self.flows[key] = Flow(key[0], key[1], msg["src"], msg["dst"], msg["cc"],
                                   FlowWindow(self.window))
            owned.add(key)
            self._emit(event="register", pid=key[0], fd=key[1], src=msg["src"], dst=msg["dst"], cc=msg["cc"])
        elif t == "unreg":
            flow = self.flows.pop(key, None)
            owned.discard(key)
            if flow:
                self._emit(event="unregister", pid=key[0], fd=key[1], switches=flow.switches)
        elif t == "ack":
            flow = self.flows.get(key)
            if flow and msg.get("ok"):
                flow.cc, flow.pending = msg["cc"], None
                flow.last_switch_ts = time.monotonic()
                flow.switches += 1
                self.total_switches += 1
            elif flow:
                flow.pending = None
            self._emit(event="ack", pid=key[0], fd=key[1], cc=msg.get("cc"), ok=msg.get("ok"))
        elif t == "tel":
            flow = self.flows.get(key)
            if flow is None:
                return None
            flow.cc = msg.get("cc", flow.cc)
            sample = TelemetrySample.from_mapping(msg)
            flow.window.push(sample)
            x = flow.window.features()
            if x is None or flow.pending:
                return None
            proba = self.policy.predict_proba(x)
            d = self.guard.decide(proba, flow.cc, flow.last_switch_ts, time.monotonic())
            self._emit(event="decision", pid=key[0], fd=key[1], cc=flow.cc, proba=proba,
                       switch=d.switch, target=d.target, reason=d.reason, features=x.tolist(),
                       sample=sample.to_dict())
            if d.switch:
                flow.pending = d.target
                return {"t": "set", "fd": key[1], "cc": d.target}
        return None


async def serve(controller: Controller, path: str) -> asyncio.AbstractServer:
    if os.path.exists(path):
        os.unlink(path)
    server = await asyncio.start_unix_server(controller.handle, path=path)
    os.chmod(path, 0o666)
    log.info("listening on %s", path)
    return server
