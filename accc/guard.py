"""Stability guard (Fig. 1, ref. 105).

Filters classifier output so a socket's congestion control algorithm only
changes when (a) the predicted algorithm beats the active one by a confidence
margin and (b) the active algorithm has been in place for a minimum dwell time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

DEFAULT_MARGIN = 0.15
DEFAULT_DWELL_S = 0.200


@dataclass(frozen=True)
class Decision:
    switch: bool
    target: str
    reason: str


class StabilityGuard:
    def __init__(
        self,
        margin: float = DEFAULT_MARGIN,
        dwell_s: float = DEFAULT_DWELL_S,
        allowed: set[str] | None = None,
    ) -> None:
        if not 0.0 <= margin <= 1.0:
            raise ValueError("margin must be in [0, 1]")
        if dwell_s < 0:
            raise ValueError("dwell_s must be >= 0")
        self.margin = margin
        self.dwell_s = dwell_s
        self.allowed = allowed

    def decide(
        self,
        proba: Mapping[str, float],
        active: str,
        last_switch_ts: float,
        now: float,
    ) -> Decision:
        """Return whether to switch from ``active`` given class probabilities."""
        if not proba:
            return Decision(False, active, "no-prediction")
        candidates = {
            alg: p for alg, p in proba.items() if self.allowed is None or alg in self.allowed
        }
        if not candidates:
            return Decision(False, active, "no-allowed-candidate")
        target = max(candidates, key=candidates.__getitem__)
        if target == active:
            return Decision(False, active, "already-active")
        # An active algorithm the model does not know gets probability 0, so any
        # sufficiently confident prediction may replace it.
        gap = candidates[target] - proba.get(active, 0.0)
        if gap < self.margin:
            return Decision(False, active, f"margin {gap:.3f}<{self.margin:.3f}")
        dwelt = now - last_switch_ts
        if dwelt < self.dwell_s:
            return Decision(False, active, f"dwell {dwelt * 1000:.0f}ms<{self.dwell_s * 1000:.0f}ms")
        return Decision(True, target, f"gap {gap:.3f}")
