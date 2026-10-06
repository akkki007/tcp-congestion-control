"""Decision policies that map a feature vector to CC-algorithm probabilities.

``HeuristicPolicy`` is a transparent rule-based stand-in used until the trained
classifier (Fig. 1, ref. 104) is available; it exposes the same interface.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from .features import FEATURE_NAMES


class Policy(Protocol):
    classes: tuple[str, ...]

    def predict_proba(self, x: np.ndarray) -> dict[str, float]: ...


class HeuristicPolicy:
    """Bulk, steady flows -> BBR; sparse interactive flows -> delay-friendly CC; else CUBIC."""

    def __init__(self, interactive_cc: str = "reno") -> None:
        self.interactive_cc = interactive_cc
        self.classes = ("cubic", "bbr", interactive_cc)
        self._ix = {n: i for i, n in enumerate(FEATURE_NAMES)}

    def predict_proba(self, x: np.ndarray) -> dict[str, float]:
        f = lambda name: float(x[self._ix[name]])  # noqa: E731
        if f("idle_frac") >= 0.4 or (f("tput_mbps") < 1.0 and f("app_limited_frac") > 0.5):
            winner = self.interactive_cc
        elif f("tput_mbps") >= 50.0 and f("idle_frac") < 0.2:
            winner = "bbr"
        else:
            winner = "cubic"
        return {c: (0.8 if c == winner else 0.2 / (len(self.classes) - 1)) for c in self.classes}
