"""End-to-end live demo of mid-flow congestion-control switching.

Starts the ACCC daemon, a TCP sink, and an unmodified workload process with
LD_PRELOAD=libaccc.so. Prints every decision and switch as it happens, then
verifies that the connection survived and every byte arrived.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

from accc.daemon import Controller, available_algorithms, serve
from accc.features import FEATURE_NAMES
from accc.guard import StabilityGuard
from accc.policy import HeuristicPolicy

ROOT = Path(__file__).resolve().parent.parent
SHIM = ROOT / "shim" / "libaccc.so"
LOG = ROOT / "results" / "demo_events.jsonl"


def sink(srv: socket.socket, result: dict) -> None:
    conn, _ = srv.accept()
    total = 0
    while data := conn.recv(1 << 20):
        total += len(data)
    result["received"] = total
    conn.send(b"k")
    conn.close()


async def main() -> int:
    if not SHIM.exists():
        print("build the shim first: make shim", file=sys.stderr)
        return 1
    avail = available_algorithms()
    interactive = "vegas" if "vegas" in avail else "reno"
    print(f"kernel CC algorithms available: {' '.join(sorted(avail))}")
    LOG.parent.mkdir(exist_ok=True)
    logf = LOG.open("w")
    t0 = time.monotonic()
    ix = {n: i for i, n in enumerate(FEATURE_NAMES)}

    def on_event(e: dict) -> None:
        logf.write(json.dumps(e) + "\n")
        t = e["ts"] - t0
        if e["event"] == "register":
            print(f"[{t:5.2f}s] REGISTER  fd={e['fd']} {e['src']} -> {e['dst']} cc={e['cc']}")
        elif e["event"] == "decision" and (e["switch"] or int(t * 20) % 10 == 0):
            f = e["features"]
            tag = "SWITCH -> " + e["target"] if e["switch"] else "keep"
            print(f"[{t:5.2f}s] cc={e['cc']:<6} tput={f[ix['tput_mbps']]:8.1f} Mb/s "
                  f"idle={f[ix['idle_frac']]:.2f} rtt={f[ix['rtt_mean_ms']]:.3f}ms  {tag:<16} ({e['reason']})")
        elif e["event"] == "ack":
            print(f"[{t:5.2f}s] ACK       setsockopt(TCP_CONGESTION, {e['cc']}) ok={e['ok']}")

    controller = Controller(HeuristicPolicy(interactive),
                            StabilityGuard(margin=0.15, dwell_s=0.2, allowed=avail),
                            on_event=on_event)
    sock_path = os.path.join(tempfile.mkdtemp(), "accc.sock")
    server = await serve(controller, sock_path)

    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    port = srv.getsockname()[1]
    result: dict = {}
    th = threading.Thread(target=sink, args=(srv, result), daemon=True)
    th.start()

    env = dict(os.environ, LD_PRELOAD=str(SHIM), ACCC_SOCK=sock_path, ACCC_INTERVAL_MS="50")
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "demo.workload", "127.0.0.1", str(port),
        env=env, cwd=ROOT, stdout=asyncio.subprocess.PIPE)
    out_lines = []
    while line := await proc.stdout.readline():
        s = line.decode().strip()
        out_lines.append(s)
        if s.startswith("PHASE"):
            _, name, ts = s.split()
            print(f"[{float(ts) - t0:5.2f}s] ===== application phase: {name.upper()} =====")
    await proc.wait()
    th.join(5)
    server.close()
    logf.close()

    done = next(l for l in out_lines if l.startswith("DONE"))
    sent = int(done.split()[1].split("=")[1])
    final_cc = done.split()[2].split("=")[1]
    events = [json.loads(l) for l in LOG.read_text().splitlines()]
    switches = [e for e in events if e["event"] == "ack" and e["ok"]]
    print("\n--- summary ---")
    print(f"switches performed mid-flow : {len(switches)} "
          f"({' -> '.join(['cubic'] + [e['cc'] for e in switches])})")
    print(f"bytes sent / received       : {sent} / {result.get('received')}")
    print(f"connection survived intact  : {sent == result.get('received')}")
    print(f"final CC seen by the app    : {final_cc}")
    print(f"event log                   : {LOG.relative_to(ROOT)}")
    return 0 if sent == result.get("received") and switches else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
