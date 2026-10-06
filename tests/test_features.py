import numpy as np
import pytest

from accc.features import FEATURE_NAMES, N_FEATURES, FlowWindow, extract
from accc.telemetry import TelemetrySample


def mk(i, *, dt=0.05, rate=1_000_000, rtt=10_000, retx_every=0, idle=False, base_acked=0):
    acked = base_acked + (0 if idle else int(rate * dt * i))
    return TelemetrySample(
        ts=i * dt,
        srtt_us=rtt,
        rttvar_us=rtt // 10,
        min_rtt_us=rtt // 2,
        snd_cwnd=10 + i,
        total_retrans=(i // retx_every) if retx_every else 0,
        segs_out=100 * i,
        bytes_acked=acked,
    )


def test_vector_shape_and_names():
    v = extract([mk(i) for i in range(10)])
    assert v.shape == (N_FEATURES,) == (len(FEATURE_NAMES),)
    assert np.all(np.isfinite(v))


def test_bulk_flow_features():
    v = dict(zip(FEATURE_NAMES, extract([mk(i, rate=12_500_000) for i in range(10)])))
    assert v["tput_mbps"] == pytest.approx(100.0, rel=1e-6)
    assert v["rtt_inflation"] == pytest.approx(2.0)
    assert v["loss_ratio"] == 0
    assert v["idle_frac"] == 0
    assert v["burst_cv"] == pytest.approx(0, abs=1e-9)
    assert v["cwnd_slope"] > 0


def test_loss_ratio():
    v = dict(zip(FEATURE_NAMES, extract([mk(i, retx_every=1) for i in range(11)])))
    assert v["loss_ratio"] == pytest.approx(10 / 1000)


def test_idle_flow():
    v = dict(zip(FEATURE_NAMES, extract([mk(i, idle=True, base_acked=500) for i in range(10)])))
    assert v["tput_mbps"] == 0 and v["idle_frac"] == 1.0 and v["burst_cv"] == 0


def test_window_requires_full():
    w = FlowWindow(size=4)
    for i in range(3):
        w.push(mk(i))
        assert w.features() is None
    w.push(mk(3))
    assert w.features() is not None
    w.push(mk(3))  # duplicate ts ignored
    assert len(w) == 4


def test_extract_rejects_short():
    with pytest.raises(ValueError):
        extract([mk(0)])
