"""Terminal demo of mid-flow congestion-control switching.

Runs the scenario from ``demo.runner`` and prints each decision and switch as
it happens, then verifies the connection survived and every byte arrived.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from accc.features import FEATURE_NAMES
from demo.runner import ROOT, run_scenario

LOG = ROOT / "results" / "demo_events.jsonl"
IX = {n: i for i, n in enumerate(FEATURE_NAMES)}


def printer(logf):
    def on_event(e: dict) -> None:
        logf.write(json.dumps(e) + "\n")
        t, kind = e["t"], e["event"]
        if kind == "start":
            print(f"kernel CC algorithms available: {' '.join(e['available'])}")
        elif kind == "phase":
            print(f"[{t:5.2f}s] ===== application phase: {e['phase'].upper()} =====")
        elif kind == "register":
            print(f"[{t:5.2f}s] REGISTER  fd={e['fd']} {e['src']} -> {e['dst']} cc={e['cc']}")
        elif kind == "decision" and (e["switch"] or int(t * 20) % 10 == 0):
            f = e["features"]
            tag = "SWITCH -> " + e["target"] if e["switch"] else "keep"
            print(f"[{t:5.2f}s] cc={e['cc']:<6} tput={f[IX['tput_mbps']]:8.1f} Mb/s "
                  f"idle={f[IX['idle_frac']]:.2f} rtt={f[IX['rtt_mean_ms']]:.3f}ms  "
                  f"{tag:<16} ({e['reason']})")
        elif kind == "ack":
            print(f"[{t:5.2f}s] ACK       setsockopt(TCP_CONGESTION, {e['cc']}) ok={e['ok']}")
    return on_event


async def main() -> int:
    LOG.parent.mkdir(exist_ok=True)
    with LOG.open("w") as logf:
        s = await run_scenario(printer(logf))
    print("\n--- summary ---")
    print(f"switches performed mid-flow : {s['switches']}")
    print(f"bytes sent / received       : {s['bytes_sent']} / {s['bytes_received']}")
    print(f"connection survived intact  : {s['intact']}")
    print(f"final CC seen by the app    : {s['final_cc']}")
    print(f"event log                   : {Path(LOG).relative_to(ROOT)}")
    return 0 if s["intact"] and s["switches"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
