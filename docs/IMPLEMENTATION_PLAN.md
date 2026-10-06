# ACCC — Technical Implementation Plan

**Adaptive Congestion Control Controller**: application-aware, mid-flow switching of
TCP congestion control (CC) algorithms using socket-level telemetry and a
machine-learning classifier. Source: patent proposal (VIT/VIIT Pune).

## 1. Goals (from the proposal)

| # | Requirement | Source |
|---|-------------|--------|
| G1 | Pick a CC algorithm per socket at runtime, and re-pick mid-flow as flow behaviour changes | Obj. §6, Claim 1 |
| G2 | Avoid flapping: confidence margin (default 0.15) **and** minimum dwell time (default 200 ms) | Claim 4 |
| G3 | No kernel patches, no application source changes (eBPF + LD_PRELOAD + setsockopt) | Claim 8 |
| G4 | Offline-trained classical ML (Random Forest / XGBoost) over socket telemetry | Claim 3 |
| G5 | Switch without terminating/restarting the connection | Claim 7 |
| G6 | Evaluate: aggregate goodput and tail latency, ACCC on vs. static CC | §9 |

## 2. Architecture (maps to Figure 1)

```
 100 app  ──LD_PRELOAD──► 106 libaccc.so (C shim)
                            │  socket/connect/accept/close hooks
                            │  register fd + 4-tuple, sample TCP_INFO (fallback telemetry)
                            │  execute setsockopt(TCP_CONGESTION)  ──► 107 ──► 101 kernel (108: cubic/bbr/reno/vegas)
                            ▼ unix domain socket (/run/accc.sock), line-delimited JSON
                     accc daemon (Python)
   102 telemetry ──► 103 feature extractor ──► 104 classifier ──► 105 stability guard ──► actuator cmd
   (eBPF via BCC, or shim TCP_INFO samples)
```

### Components

| Ref | Module | Implementation |
|-----|--------|----------------|
| 102 | `accc/telemetry/` | `TelemetrySample` dataclass. Backends: **shim** (shim thread calls `getsockopt(TCP_INFO)` every 50 ms per registered fd and streams it), **ebpf** (BCC kprobe on `tcp_rcv_established`, reads `tcp_sock` fields, BPF ring buffer, rate-limited per socket). |
| 103 | `accc/features.py` | Per-socket sliding window of N samples → fixed 12-feature vector (RTT mean/std/min, RTT-var mean, loss ratio, retrans rate, cwnd mean & slope, throughput mean & trend, inter-send CV, cumulative bytes (flow-size proxy), app-limited fraction). |
| 104 | `accc/model.py` | scikit-learn `RandomForestClassifier` (XGBoost optional); `predict_proba` over the CC classes; joblib serialization with metadata (feature names, class list). |
| 105 | `accc/guard.py` | Pure, clock-injected `StabilityGuard`: switch iff `p(pred) − p(active) ≥ margin` AND `now − last_switch ≥ dwell`. Also refuses algorithms not in `tcp_available_congestion_control`. |
| 106 | `shim/libaccc.c` | `dlsym(RTLD_NEXT)` interposition of `socket`, `connect`, `accept`, `accept4`, `close`; background pthread owning the control channel; executes `setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, alg)`, acks result. Fails open: if daemon absent, the app runs unchanged. |
| — | `accc/daemon.py` | asyncio unix-socket server; registry of (pid, fd) → flow state; runs decision loop every window; logs decisions (JSONL) for auditing/eval. |
| — | `accc/datagen/` | Training-data pipeline: (a) **testbed collector** — runs workloads (bulk, video-like on/off, RPC, mixed) under each CC × each tc-netem profile and labels each window by max goodput; (b) **synthetic generator** — parametric flow model for environments without netem, used for unit tests/bootstrapping. |
| — | `bench/` | Workload generators (bulk, chunked "video", RPC ping-pong) + evaluation harness: static-cubic / static-bbr / static-reno / ACCC, report goodput and p50/p99 latency. |

### Wire protocol (shim ⇄ daemon), JSON lines
- shim→daemon: `{"t":"reg","pid","fd","src","dst","cc"}`, `{"t":"tel","pid","fd","ts", ...tcp_info fields}`, `{"t":"unreg","pid","fd"}`, `{"t":"ack","pid","fd","cc","ok","err"}`
- daemon→shim: `{"t":"set","fd","cc"}`
One connection per process; the shim's thread multiplexes all its fds.

## 3. Key design decisions

1. **Telemetry fallback.** BCC needs kernel headers; many hosts (incl. our dev container) lack them.
   The shim-sampled `TCP_INFO` path uses only standard socket APIs and provides the same fields
   (srtt, rttvar, min_rtt, cwnd, total_retrans, bytes_acked, delivery_rate, app_limited).
   The eBPF backend is kept as the patent's preferred embodiment and is selected with `--telemetry ebpf`.
2. **Actuation in the owning process** (as in the proposal) rather than passing fds to the daemon via
   `SCM_RIGHTS`: a daemon-held dup would keep sockets alive after the app's `close()`.
3. **Labels** = argmax goodput per window across CC runs of the *same* workload+network profile;
   ties within 2 % resolve to the incumbent (CUBIC) to bias toward not switching.
4. **Fail-open everywhere**: guard rejects on errors; shim ignores a missing daemon; unknown CC → no-op.
5. **Vegas** is supported if the kernel lists it; the class set is derived at runtime from
   `tcp_available_congestion_control` ∩ model classes.

## 4. Repository layout

```
accc/            Python package (daemon, telemetry, features, model, guard, cli)
shim/            libaccc.c + Makefile
accc/datagen/    synthetic + testbed data generation
bench/           workloads + evaluation harness
tests/           pytest (unit + integration with real shim on loopback)
docs/            this plan, architecture notes, results
```

## 5. Phased delivery

| Phase | Deliverable | Verification |
|-------|-------------|--------------|
| P0 | Plan, repo skeleton, packaging, Makefile, CI-able test layout | `pytest` runs |
| P1 | Stability guard (105) | Unit tests: margin, dwell, oscillation suppression |
| P2 | Telemetry model + feature extractor (103) | Unit tests on synthetic sample streams |
| P3 | LD_PRELOAD shim (106/107) + protocol | Integration: real TCP over loopback, CC changes mid-flow, connection survives, verified via `TCP_CONGESTION` getsockopt |
| P4 | Daemon (registry, decision loop, actuator) | Integration: daemon + shim + scripted policy switches a live flow |
| P5 | Data generation + training (104) | Synthetic dataset → RF model, held-out accuracy report; testbed collector script for real hosts with netem |
| P6 | eBPF telemetry backend (102) | Code + self-check; runs where BCC/headers exist |
| P7 | Benchmarks + evaluation harness | Static vs. ACCC comparison report |
| P8 | Docs: README, usage, results, limitations | — |

## 6. Environment notes (dev container)

- Kernel 6.18, CCs available: `reno bbr cubic` (no `vegas` module, no `modprobe`).
- No `sch_netem` → network impairment experiments must run on a real Linux host; the dev
  container covers loopback functional tests and synthetic-data training.
- No kernel headers → BCC cannot compile; eBPF backend is untested here.

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| Synthetic labels don't transfer to real networks | Testbed collector + retraining script; model metadata records data source |
| Switching mid-flow perturbs CC state (e.g. BBR model reset) | Dwell time + margin; evaluation measures switch cost |
| LD_PRELOAD bypass (static binaries, io_uring, Go) | Documented limitation; eBPF backend + daemon-side detection |
| Per-sample IPC overhead | 50 ms sampling, batched lines, only TCP sockets tracked |
