"""One socket-level telemetry sample, mirroring the relevant ``tcp_info`` fields."""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Any, Mapping


@dataclass(frozen=True)
class TelemetrySample:
    ts: float  # seconds, monotonic clock of the sampler
    srtt_us: int  # smoothed RTT (tcpi_rtt)
    rttvar_us: int  # RTT variance (tcpi_rttvar)
    min_rtt_us: int  # tcpi_min_rtt
    snd_cwnd: int  # congestion window, segments
    total_retrans: int  # cumulative retransmitted segments
    segs_out: int  # cumulative segments sent
    bytes_acked: int  # cumulative bytes acknowledged
    bytes_received: int = 0  # cumulative bytes received
    delivery_rate: int = 0  # bytes/s, kernel estimate
    app_limited: bool = False
    last_data_sent_ms: int = 0  # ms since last data sent (tcpi_last_data_sent)

    @classmethod
    def from_mapping(cls, m: Mapping[str, Any]) -> "TelemetrySample":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in m.items() if k in names})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
