"""Feature extraction (Fig. 1, ref. 103).

Maintains a sliding window of telemetry samples per socket and turns it into a
fixed-length feature vector describing the flow's recent behaviour.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Iterable, Sequence

import numpy as np

from .telemetry import TelemetrySample

FEATURE_NAMES: tuple[str, ...] = (
    "rtt_mean_ms",  # mean smoothed RTT
    "rtt_std_ms",  # deviation of smoothed RTT across the window
    "min_rtt_ms",  # path propagation-delay estimate
    "rttvar_mean_ms",  # kernel RTT variance, averaged
    "rtt_inflation",  # rtt_mean / min_rtt: queueing delay indicator
    "loss_ratio",  # retransmitted / sent segments in the window
    "cwnd_mean",  # congestion window, segments
    "cwnd_slope",  # relative cwnd change per second
    "tput_mbps",  # goodput over the window
    "tput_trend",  # relative goodput slope per second
    "burst_cv",  # coefficient of variation of per-interval bytes (on/off pattern)
    "idle_frac",  # fraction of intervals with no data acknowledged
    "app_limited_frac",  # fraction of samples flagged application-limited
    "log_flow_bytes",  # log10 of cumulative bytes: flow-size proxy
)
N_FEATURES = len(FEATURE_NAMES)

DEFAULT_WINDOW = 10  # samples; 10 x 50 ms = 500 ms


def _slope(y: np.ndarray, t: np.ndarray) -> float:
    if len(y) < 2 or np.ptp(t) == 0:
        return 0.0
    return float(np.polyfit(t - t[0], y, 1)[0])


def extract(samples: Sequence[TelemetrySample]) -> np.ndarray:
    """Compute the feature vector for a window of >= 2 samples (oldest first)."""
    if len(samples) < 2:
        raise ValueError("need at least 2 samples")
    t = np.array([s.ts for s in samples], dtype=float)
    srtt = np.array([s.srtt_us for s in samples], dtype=float) / 1000.0
    rttvar = np.array([s.rttvar_us for s in samples], dtype=float) / 1000.0
    cwnd = np.array([s.snd_cwnd for s in samples], dtype=float)
    acked = np.array([s.bytes_acked for s in samples], dtype=float)
    first, last = samples[0], samples[-1]

    min_rtt_us = min((s.min_rtt_us for s in samples if s.min_rtt_us > 0), default=0)
    min_rtt = min_rtt_us / 1000.0
    rtt_mean = float(srtt.mean())

    d_sent = last.segs_out - first.segs_out
    d_retx = last.total_retrans - first.total_retrans
    loss = d_retx / d_sent if d_sent > 0 else 0.0

    dt = np.diff(t)
    db = np.diff(acked)
    span = float(t[-1] - t[0]) or 1e-9
    tput_mbps = float(acked[-1] - acked[0]) * 8 / span / 1e6
    rate = np.divide(db, dt, out=np.zeros_like(db), where=dt > 0)
    rate_mean = float(rate.mean())
    burst_cv = float(rate.std() / rate_mean) if rate_mean > 0 else 0.0
    tput_trend = _slope(rate, t[1:]) / rate_mean if rate_mean > 0 else 0.0
    cwnd_mean = float(cwnd.mean())
    cwnd_slope = _slope(cwnd, t) / cwnd_mean if cwnd_mean > 0 else 0.0

    flow_bytes = last.bytes_acked + last.bytes_received
    return np.array(
        [
            rtt_mean,
            float(srtt.std()),
            min_rtt,
            float(rttvar.mean()),
            rtt_mean / min_rtt if min_rtt > 0 else 1.0,
            loss,
            cwnd_mean,
            cwnd_slope,
            tput_mbps,
            tput_trend,
            burst_cv,
            float(np.mean(db <= 0)),
            float(np.mean([s.app_limited for s in samples])),
            math.log10(flow_bytes + 1),
        ],
        dtype=float,
    )


class FlowWindow:
    """Sliding window of the most recent samples for one socket."""

    def __init__(self, size: int = DEFAULT_WINDOW) -> None:
        if size < 2:
            raise ValueError("window size must be >= 2")
        self.size = size
        self._buf: deque[TelemetrySample] = deque(maxlen=size)

    def push(self, sample: TelemetrySample) -> None:
        if self._buf and sample.ts <= self._buf[-1].ts:
            return  # drop duplicates / out-of-order samples
        self._buf.append(sample)

    def extend(self, samples: Iterable[TelemetrySample]) -> None:
        for s in samples:
            self.push(s)

    @property
    def full(self) -> bool:
        return len(self._buf) == self.size

    def __len__(self) -> int:
        return len(self._buf)

    def features(self) -> np.ndarray | None:
        return extract(list(self._buf)) if self.full else None
