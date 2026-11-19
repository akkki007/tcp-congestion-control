/*
 * A tiny, deterministic TCP sender simulation for the per-algorithm pages.
 *
 * One sender, one bottleneck router with a small FIFO buffer, one receiver. Every character of the
 * typed text is one segment. The sender is ACK-clocked and its congestion window is driven by the
 * real shape of each algorithm (textbook versions, not the kernel code):
 *
 *   RENO   slow start, then +1 segment per RTT; on 3 duplicate ACKs the window is halved.
 *   CUBIC  slow start, then the window follows W(t) = C·(t − K)³ + Wmax; on loss it drops to 0.7×.
 *   BBR    measures bottleneck bandwidth and min RTT and paces at that rate; loss is not a signal.
 *
 * Time is "visual" milliseconds: the animation runs at this clock, so the numbers are slowed down on
 * purpose so a person can follow individual packets.
 */

import type { Algo } from "@/lib/algorithms";

export const LEG = 700; // sender → router and router → receiver flight time
export const SERVICE = 320; // the bottleneck forwards one segment per SERVICE ms
export const ACK_LEG = 1300; // receiver → sender (the return path has no queue)
export const BUF = 6; // segments that can wait at the bottleneck
export const BASE_RTT = 2 * LEG + SERVICE + ACK_LEG;
export const BDP = BASE_RTT / SERVICE; // segments the pipe holds without any queue
const MIN_GAP = 70; // back-to-back sends are drawn this far apart
const DUPTHRESH = 3;
const C = 0.4; // CUBIC scaling constant
const BETA_CUBIC = 0.7;
const BBR_GAINS = [1.25, 0.75, 1, 1, 1, 1, 1, 1];
export const INITIAL_WINDOW = 4;

export type Segment = {
  seq: number;
  ch: string;
  sentAt: number;
  arriveRouter: number;
  retx: boolean;
  /** set when the router has seen it */
  routed: boolean;
  dropped: boolean;
  serviceStart: number;
  serviceEnd: number;
  arriveRecv: number;
  received: boolean;
  /** BBR delivery-rate bookkeeping */
  deliveredAtSend: number;
  deliveredTimeAtSend: number;
  /** visual x, owned by the renderer */
  x?: number;
};

export type Ack = { seq: number; sentAt: number; arrive: number; done: boolean; seg: Segment };

export type Mode = "Slow start" | "Congestion avoidance" | "Fast recovery" | "Timeout" | "Startup" | "Drain" | "Probe bandwidth" | "Idle" | "Done";

export type LogLine = { t: number; text: string; tone?: "loss" | "info" | "good" };

type Unacked = { seg: Segment; laterAcks: number; lost: boolean };

export class TcpSim {
  readonly cc: Algo;
  readonly text: string;
  t = 0;
  segments: Segment[] = [];
  acks: Ack[] = [];
  log: LogLine[] = [];
  history: { t: number; cwnd: number }[] = [];
  losses: number[] = [];

  cwnd = INITIAL_WINDOW;
  ssthresh = Infinity;
  mode: Mode = "Idle";
  sent = 0;
  retransmits = 0;
  drops = 0;
  /** receiver: which seqs arrived */
  got: boolean[];
  finishedAt: number | null = null;

  private nextSeq = 0;
  private retxQueue: number[] = [];
  private unacked = new Map<number, Unacked>();
  private nextSendAt = 0;
  private lastDeparture = 0;
  private recoveryUntil = -1; // segments sent before this time don't trigger another reduction
  private srtt = BASE_RTT;
  // CUBIC
  private wmax = 0;
  private epoch = 0;
  private K = 0;
  // BBR
  private delivered = 0;
  private deliveredTime = 0;
  private rateSamples: { t: number; r: number }[] = [];
  private minRtt = Infinity;
  private btlBw = 0;
  private fullBw = 0;
  private fullCnt = 0;
  private roundEnd = 0; // a round ends when a segment sent after this time is acked
  private cycle = 0;
  private lastSample = -1;
  private lastLossNote = -Infinity;
  private lastDropNote = -Infinity;

  constructor(cc: Algo, text: string) {
    this.cc = cc;
    this.text = text;
    this.got = Array(text.length).fill(false);
    this.mode = cc === "bbr" ? "Startup" : "Slow start";
    this.say(cc === "bbr" ? "Startup: BBR doubles its sending rate every round trip to find the bottleneck bandwidth." : `Slow start: ${cc.toUpperCase()} begins with a window of ${INITIAL_WINDOW} segments and doubles it every round trip.`, "info");
    this.trySend(0);
  }

  get inflight() {
    let n = 0;
    for (const u of this.unacked.values()) if (!u.lost) n++;
    return n;
  }
  get bdpEstimate() {
    return this.btlBw && Number.isFinite(this.minRtt) ? this.btlBw * this.minRtt : 0;
  }
  get bottleneckRate() {
    return this.btlBw * 1000; // segments per visual second
  }
  get done() {
    return this.finishedAt !== null;
  }
  /** Contiguous prefix the receiver can hand to the app. */
  get deliveredPrefix() {
    let i = 0;
    while (i < this.got.length && this.got[i]) i++;
    return i;
  }

  private say(text: string, tone?: LogLine["tone"]) {
    this.log.push({ t: this.t, text, tone });
    if (this.log.length > 40) this.log.shift();
  }

  /** Advance the simulation to time `until`, handling every event in time order. */
  advance(until: number) {
    for (let guard = 0; guard < 5000; guard++) {
      const e = this.nextEvent();
      if (!e || e.time > until) break;
      this.t = e.time;
      e.run();
    }
    this.t = until;
    if (this.lastSample < 0 || until - this.lastSample >= 100) {
      this.lastSample = until;
      this.history.push({ t: until, cwnd: this.effectiveWindow() });
    }
  }

  /** The window that actually limits sending, for the chart. */
  effectiveWindow() {
    if (this.cc === "bbr" && this.mode === "Probe bandwidth") return Math.min(this.cwnd, this.bdpEstimate * BBR_GAINS[this.cycle]);
    return this.cwnd;
  }

  private nextEvent(): { time: number; run: () => void } | null {
    let best: { time: number; run: () => void } | null = null;
    const consider = (time: number, run: () => void) => {
      if (!best || time < best.time) best = { time, run };
    };
    for (const s of this.segments) {
      if (!s.routed && !s.dropped) consider(s.arriveRouter, () => this.route(s));
      else if (s.routed && !s.dropped && !s.received) consider(s.arriveRecv, () => this.receive(s));
    }
    for (const a of this.acks) if (!a.done) consider(a.arrive, () => this.onAck(a));
    if (this.canSend() && this.nextSendAt > this.t) consider(this.nextSendAt, () => this.trySend(this.nextSendAt));
    // Retransmission timeout for a lost tail (no later ACKs to signal it)
    for (const u of this.unacked.values()) {
      if (!u.lost) consider(u.seg.sentAt + this.rto(), () => this.timeout(u));
    }
    return best;
  }

  private rto() {
    return Math.max(1.6 * BASE_RTT, 2 * this.srtt);
  }

  private hasData() {
    return this.retxQueue.length > 0 || this.nextSeq < this.text.length;
  }

  private windowAllows() {
    const w = this.cc === "bbr" && this.mode === "Probe bandwidth" ? Math.max(4, 2 * this.bdpEstimate) : this.cwnd;
    if (this.cc === "bbr" && this.mode === "Drain") return this.inflight < Math.max(4, this.bdpEstimate);
    return this.inflight < Math.max(1, Math.floor(w + 1e-9));
  }

  private canSend() {
    return this.hasData() && this.windowAllows();
  }

  private pacingGap() {
    if (this.cc !== "bbr" || this.mode !== "Probe bandwidth" || !this.btlBw) return MIN_GAP;
    return Math.max(MIN_GAP, 1 / (BBR_GAINS[this.cycle] * this.btlBw));
  }

  private trySend(now: number) {
    while (this.canSend() && now >= this.nextSendAt) {
      const retx = this.retxQueue.length > 0;
      const seq = retx ? this.retxQueue.shift()! : this.nextSeq++;
      const seg: Segment = {
        seq,
        ch: this.text[seq],
        sentAt: now,
        arriveRouter: now + LEG,
        retx,
        routed: false,
        dropped: false,
        serviceStart: 0,
        serviceEnd: 0,
        arriveRecv: 0,
        received: false,
        deliveredAtSend: this.delivered,
        deliveredTimeAtSend: this.deliveredTime || now,
      };
      this.segments.push(seg);
      this.unacked.set(seq, { seg, laterAcks: 0, lost: false });
      this.sent++;
      if (retx) this.retransmits++;
      this.nextSendAt = now + this.pacingGap();
    }
  }

  /** Router: tail-drop FIFO with BUF waiting slots. */
  private route(s: Segment) {
    const waiting = this.segments.filter((o) => o.routed && !o.dropped && o.serviceStart > this.t).length;
    if (waiting >= BUF) {
      s.dropped = true;
      this.drops++;
      this.losses.push(this.t);
      if (this.t - this.lastDropNote > 2500) this.say(`Queue full: segment “${show(s.ch)}” (#${s.seq + 1}) is dropped at the bottleneck.`, "loss");
      this.lastDropNote = this.t;
      return;
    }
    s.routed = true;
    s.serviceStart = Math.max(this.t, this.lastDeparture);
    s.serviceEnd = s.serviceStart + SERVICE;
    this.lastDeparture = s.serviceEnd;
    s.arriveRecv = s.serviceEnd + LEG;
  }

  private receive(s: Segment) {
    s.received = true;
    this.got[s.seq] = true;
    this.acks.push({ seq: s.seq, sentAt: this.t, arrive: this.t + ACK_LEG, done: false, seg: s });
  }

  private onAck(a: Ack) {
    a.done = true;
    const u = this.unacked.get(a.seq);
    if (u && u.seg === a.seg) {
      this.unacked.delete(a.seq);
      const rtt = this.t - a.seg.sentAt;
      this.srtt = 0.875 * this.srtt + 0.125 * rtt;
      this.delivered++;
      this.deliveredTime = this.t;
      if (this.cc === "bbr") this.bbrOnAck(a.seg, rtt);
      else this.lossBasedOnAck();
    } else if (u) {
      // ACK for an earlier transmission of a segment we already retransmitted: count it as delivered
      this.unacked.delete(a.seq);
    }

    // Duplicate-ACK style loss detection: 3 later segments acked → the earlier one is lost.
    for (const o of this.unacked.values()) {
      if (o.lost || o.seg.seq >= a.seq || o.seg.sentAt > a.seg.sentAt) continue;
      if (++o.laterAcks >= DUPTHRESH) this.markLost(o, false);
    }

    if (!this.hasData() && this.unacked.size === 0 && this.finishedAt === null) {
      this.finishedAt = this.t;
      this.mode = "Done";
      this.say(`All ${this.text.length} characters delivered in ${(this.t / 1000).toFixed(1)} s.`, "good");
    }
    this.trySend(this.t);
  }

  private timeout(u: Unacked) {
    if (u.lost || !this.unacked.has(u.seg.seq)) return;
    this.markLost(u, true);
    this.trySend(this.t);
  }

  private markLost(u: Unacked, rto: boolean) {
    u.lost = true;
    this.retxQueue.push(u.seg.seq);
    this.retxQueue.sort((a, b) => a - b);
    if (this.cc === "bbr") {
      if (this.mode === "Startup") {
        // BBRv2/v3 also leave startup when the queue overflows: the pipe is evidently full.
        this.mode = "Drain";
        this.say(`Loss during startup means the pipe is full (bottleneck ≈ ${(this.btlBw * 1000).toFixed(1)} segments/s). BBR drains the queue it built.`, "info");
      }
      if (this.t - this.lastLossNote > 4000) {
        this.lastLossNote = this.t;
        this.say(`Segment “${show(u.seg.ch)}” lost → resent. BBR does not treat loss as congestion, so its sending rate stays the same.`, "info");
      }
      return;
    }
    if (u.seg.sentAt < this.recoveryUntil) return; // one reduction per window of data
    this.recoveryUntil = this.t;
    const old = this.cwnd;
    if (rto) {
      this.ssthresh = Math.max(2, old / 2);
      this.cwnd = 1;
      this.mode = "Timeout";
      this.say(`Timeout waiting for “${show(u.seg.ch)}”: ${this.cc.toUpperCase()} resets its window to 1 and slow-starts again.`, "loss");
      return;
    }
    if (this.cc === "reno") {
      this.ssthresh = Math.max(2, old / 2);
      this.cwnd = this.ssthresh;
      this.say(`3 duplicate ACKs → “${show(u.seg.ch)}” resent. RENO halves its window: ${old.toFixed(1)} → ${this.cwnd.toFixed(1)}.`, "loss");
    } else {
      this.wmax = old;
      this.cwnd = Math.max(2, old * BETA_CUBIC);
      this.ssthresh = this.cwnd;
      this.epoch = this.t;
      this.K = Math.cbrt((this.wmax * (1 - BETA_CUBIC)) / C);
      this.say(`3 duplicate ACKs → “${show(u.seg.ch)}” resent. CUBIC cuts to 70 %: ${old.toFixed(1)} → ${this.cwnd.toFixed(1)}, and remembers ${old.toFixed(1)} as the old maximum.`, "loss");
    }
    this.mode = "Fast recovery";
  }

  private lossBasedOnAck() {
    if (this.mode === "Fast recovery" || this.mode === "Timeout") {
      this.mode = this.cwnd < this.ssthresh ? "Slow start" : "Congestion avoidance";
    }
    if (this.cwnd < this.ssthresh) {
      const before = Math.floor(this.cwnd);
      this.cwnd += 1;
      if (Math.floor(this.cwnd) >= this.ssthresh) this.mode = "Congestion avoidance";
      else this.mode = "Slow start";
      if (Math.log2(this.cwnd) % 1 === 0 && this.cwnd > before && this.cwnd > INITIAL_WINDOW) this.say(`Slow start: window grew to ${this.cwnd} segments.`, "info");
      return;
    }
    this.mode = "Congestion avoidance";
    if (this.cc === "reno") {
      this.cwnd += 1 / this.cwnd;
    } else {
      const T = (this.t - this.epoch) / this.srtt; // time since the last loss, in round trips
      const target = C * Math.pow(T - this.K, 3) + this.wmax;
      this.cwnd += target > this.cwnd ? Math.min(1, (target - this.cwnd) / this.cwnd) : 0.02 / this.cwnd;
    }
  }

  private bbrOnAck(seg: Segment, rtt: number) {
    if (rtt < this.minRtt) this.minRtt = rtt;
    const interval = this.t - seg.deliveredTimeAtSend;
    if (interval > 0) {
      const r = (this.delivered - seg.deliveredAtSend) / interval;
      this.rateSamples.push({ t: this.t, r });
    }
    const horizon = this.t - 8 * this.srtt;
    this.rateSamples = this.rateSamples.filter((s) => s.t >= horizon);
    this.btlBw = Math.max(0, ...this.rateSamples.map((s) => s.r));

    const roundDone = seg.sentAt >= this.roundEnd;
    if (roundDone) this.roundEnd = this.t;

    if (this.mode === "Startup") {
      // cwnd gain 2.89: never more than ~2.89 × the measured pipe size in flight
      this.cwnd = Math.min(this.cwnd + 1, Math.max(INITIAL_WINDOW, 2.89 * this.bdpEstimate));
      if (roundDone && this.btlBw > 0) {
        if (this.btlBw >= this.fullBw * 1.25) {
          this.fullBw = this.btlBw;
          this.fullCnt = 0;
        } else if (++this.fullCnt >= 2) {
          this.mode = "Drain";
          this.say(`Bandwidth stopped growing: bottleneck ≈ ${(this.btlBw * 1000).toFixed(1)} segments/s. BBR drains the queue it built.`, "info");
        }
      }
    }
    if (this.mode === "Drain" && this.inflight <= this.bdpEstimate) {
      this.mode = "Probe bandwidth";
      this.cycle = 0;
      this.cwnd = 2 * this.bdpEstimate;
      this.say(`Pacing at the bottleneck rate with ≈${this.bdpEstimate.toFixed(1)} segments in flight. The queue stays nearly empty.`, "good");
    } else if (this.mode === "Probe bandwidth") {
      this.cwnd = 2 * this.bdpEstimate;
      if (roundDone) this.cycle = (this.cycle + 1) % BBR_GAINS.length;
    }
  }
}

export const show = (ch: string) => (ch === " " ? "␣" : ch === "\n" ? "↵" : ch);
