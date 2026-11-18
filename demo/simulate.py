"""Simulated scenario for hosts that cannot run the LD_PRELOAD shim (Windows, macOS, no Linux TCP).

The *controller is real*: synthetic ``tcp_info`` samples are fed into
``accc.daemon.Controller.process`` exactly as the shim would send them, so the
feature extractor, the policy and the stability guard all run unchanged. Only
the socket and the kernel are modelled:

* a 100 Mb/s bottleneck with a 20 ms propagation RTT;
* per-algorithm steady states (CUBIC fills the queue and sees some loss, BBR
  keeps the queue short, Reno runs a lower AIMD sawtooth);
* the same application phases as ``demo.workload``: bulk -> interactive -> bulk.

Samples are produced every 50 ms in real time, so the dashboard animates live.
"""

from __future__ import annotations

import asyncio
import math
import random
import time
from typing import Callable

from accc.daemon import Controller
from accc.guard import StabilityGuard
from accc.policy import HeuristicPolicy
from demo.workload import PHASES

SIM_ALGORITHMS = ["bbr", "cubic", "reno"]
MSS = 1448
LINK_MBPS = 100.0
MIN_RTT_MS = 20.0
INTERACTIVE_MSG = 200  # bytes, every 150 ms, as in demo.workload

# Steady state per algorithm while the app is sending in bulk:
#   (share of link, queueing delay in ms, retransmitted fraction of segments)
PROFILE = {
    "cubic": (0.93, 18.0, 0.004),
    "bbr": (0.97, 2.5, 0.0005),
    "reno": (0.82, 12.0, 0.003),
    "vegas": (0.78, 1.5, 0.0),
}


async def run_simulation(on_event: Callable[[dict], None], cfg: dict, margin: float,
                         dwell_s: float, interval_s: float = 0.05) -> dict:
    t0 = time.monotonic()
    rng = random.Random(7)

    def emit(e: dict) -> None:
        e = dict(e)
        e["t"] = round(e.get("ts", time.monotonic()) - t0, 4)
        on_event(e)

    emit({"event": "start", **cfg})
    controller = Controller(
        HeuristicPolicy(cfg["interactive_cc"]),
        StabilityGuard(margin=margin, dwell_s=dwell_s, allowed=set(cfg["available"])),
        window=cfg["window"],
        on_event=emit,
    )
    owned: set = set()
    pid, fd = 4242, 3
    cc = "cubic"
    controller.process({"t": "reg", "pid": pid, "fd": fd, "src": "10.0.0.2:53230",
                        "dst": "10.0.0.9:5201", "cc": cc}, owned)

    rate = 0.0  # Mb/s, current delivery rate
    acked = segs = retrans = 0
    pending: str | None = None
    next_msg = 0.0

    for phase, dur in PHASES:
        start = time.monotonic()
        emit({"event": "phase", "phase": phase, "ts": start})
        while (now := time.monotonic()) < start + dur:
            if pending:  # the shim applies the command on its next tick and acks it
                cc, pending = pending, None
                controller.process({"t": "ack", "pid": pid, "fd": fd, "cc": cc, "ok": True}, owned)
                rate *= 0.85  # new algorithm re-probes the path

            share, queue_ms, loss = PROFILE.get(cc, PROFILE["cubic"])
            if phase == "bulk":
                target = LINK_MBPS * share
                rate += (target - rate) * (1 - math.exp(-interval_s / 0.25))
                rate_now = max(0.0, rate * (1 + rng.gauss(0, 0.03)))
                # CUBIC/Reno sawtooth: periodic dips after a loss event.
                if cc in ("cubic", "reno") and rng.random() < 0.06:
                    rate_now *= 0.7
                sent = int(rate_now * 1e6 / 8 * interval_s)
                q = queue_ms * min(1.0, rate / LINK_MBPS) * (1 + rng.gauss(0, 0.15))
                app_limited = False
            else:
                rate = 0.0
                sent = 0
                while next_msg <= now:
                    sent += INTERACTIVE_MSG
                    next_msg = (next_msg or now) + 0.15
                q, loss = 0.3, 0.0
                app_limited = True
            if phase == "bulk":
                next_msg = 0.0

            new_segs = math.ceil(sent / MSS) if sent else 0
            segs += new_segs
            retrans += sum(rng.random() < loss for _ in range(min(new_segs, 400)))
            acked += sent
            srtt_ms = MIN_RTT_MS + max(0.0, q)
            cwnd = max(10, int((rate * 1e6 / 8) * (srtt_ms / 1000) / MSS)) if phase == "bulk" else 10

            cmd = controller.process({
                "t": "tel", "pid": pid, "fd": fd, "cc": cc, "ts": now,
                "srtt_us": int(srtt_ms * 1000), "rttvar_us": int(abs(rng.gauss(q / 2 + 0.5, 0.3)) * 1000),
                "min_rtt_us": int(MIN_RTT_MS * 1000), "snd_cwnd": cwnd,
                "total_retrans": retrans, "segs_out": segs, "bytes_acked": acked,
                "delivery_rate": int(rate * 1e6 / 8), "app_limited": app_limited,
                "last_data_sent_ms": 0 if sent else int(interval_s * 1000),
            }, owned)
            if cmd and cmd.get("t") == "set":
                pending = cmd["cc"]
            await asyncio.sleep(max(0.0, interval_s - (time.monotonic() - now)))

    controller.process({"t": "unreg", "pid": pid, "fd": fd}, owned)
    summary = {
        "event": "summary",
        "bytes_sent": acked,
        "bytes_received": acked,
        "intact": True,
        "final_cc": cc,
        "switches": controller.total_switches,
        "duration_s": round(time.monotonic() - t0, 2),
    }
    emit(summary)
    return summary
