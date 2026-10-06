import pytest

from accc.guard import StabilityGuard


def test_switches_when_margin_and_dwell_met():
    g = StabilityGuard(margin=0.15, dwell_s=0.2)
    d = g.decide({"cubic": 0.2, "bbr": 0.7}, active="cubic", last_switch_ts=0.0, now=1.0)
    assert d.switch and d.target == "bbr"


def test_blocks_below_margin():
    g = StabilityGuard(margin=0.15, dwell_s=0.0)
    d = g.decide({"cubic": 0.45, "bbr": 0.55}, active="cubic", last_switch_ts=0.0, now=1.0)
    assert not d.switch and d.target == "cubic" and "margin" in d.reason


def test_blocks_within_dwell():
    g = StabilityGuard(margin=0.0, dwell_s=0.2)
    d = g.decide({"cubic": 0.1, "bbr": 0.9}, active="cubic", last_switch_ts=1.0, now=1.1)
    assert not d.switch and "dwell" in d.reason


def test_no_switch_when_already_active():
    g = StabilityGuard()
    d = g.decide({"cubic": 0.1, "bbr": 0.9}, active="bbr", last_switch_ts=0.0, now=10.0)
    assert not d.switch


def test_unknown_active_counts_as_zero():
    g = StabilityGuard(margin=0.15, dwell_s=0.0)
    d = g.decide({"cubic": 0.3, "bbr": 0.7}, active="westwood", last_switch_ts=0.0, now=1.0)
    assert d.switch and d.target == "bbr"


def test_respects_allowed_set():
    g = StabilityGuard(margin=0.0, dwell_s=0.0, allowed={"cubic", "reno"})
    d = g.decide({"vegas": 0.8, "reno": 0.15, "cubic": 0.05}, "cubic", 0.0, 1.0)
    assert d.switch and d.target == "reno"


def test_suppresses_oscillation():
    """Alternating near-tie predictions must not cause a switch every window."""
    g = StabilityGuard(margin=0.15, dwell_s=0.2)
    active, last, switches = "cubic", 0.0, 0
    for i in range(100):
        now = 1.0 + i * 0.05
        proba = {"cubic": 0.45, "bbr": 0.55} if i % 2 else {"cubic": 0.55, "bbr": 0.45}
        d = g.decide(proba, active, last, now)
        if d.switch:
            active, last, switches = d.target, now, switches + 1
    assert switches == 0


def test_dwell_bounds_switch_rate():
    g = StabilityGuard(margin=0.0, dwell_s=0.2)
    active, last, switches = "cubic", -1.0, 0
    for i in range(200):  # 10 s at 50 ms, adversarial flip every window
        now = i * 0.05
        target = "bbr" if active == "cubic" else "cubic"
        d = g.decide({target: 1.0, active: 0.0}, active, last, now)
        if d.switch:
            active, last, switches = d.target, now, switches + 1
    assert switches <= 10 / 0.2 + 1


@pytest.mark.parametrize("kw", [{"margin": -0.1}, {"margin": 1.5}, {"dwell_s": -1}])
def test_rejects_bad_config(kw):
    with pytest.raises(ValueError):
        StabilityGuard(**kw)
