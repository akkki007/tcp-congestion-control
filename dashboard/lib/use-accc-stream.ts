"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FEATURE_NAMES,
  type Config,
  type FeatureName,
  type Flow,
  type Phase,
  type Point,
  type Summary,
  type SwitchEvent,
} from "@/lib/accc";

export type StreamState = {
  connected: boolean;
  running: boolean;
  config: Config | null;
  flow: Flow | null;
  phases: Phase[];
  points: Point[];
  switches: SwitchEvent[];
  summary: Summary | null;
  error: string | null;
};

const EMPTY: Omit<StreamState, "connected" | "config"> = {
  running: false,
  flow: null,
  phases: [],
  points: [],
  switches: [],
  summary: null,
  error: null,
};

type Ev = Record<string, unknown> & { event: string; t?: number };

/**
 * Subscribes to the backend's SSE stream and folds events into dashboard state.
 * Events are batched per animation frame so a 20 Hz stream re-renders once per frame.
 */
export function useAcccStream() {
  const [state, setState] = useState<StreamState>({ connected: false, config: null, ...EMPTY });
  const queue = useRef<Ev[]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const batch = queue.current;
    queue.current = [];
    setState((s) => batch.reduce(reduce, s));
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((c: Config & { running: boolean }) =>
        setState((s) => ({ ...s, config: s.config ?? c, running: c.running })),
      )
      .catch(() => setState((s) => ({ ...s, error: "Backend not reachable — run `python -m demo.server`" })));

    const es = new EventSource("/api/events");
    es.onopen = () => setState((s) => ({ ...s, connected: true, error: null }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    es.onmessage = (m) => {
      queue.current.push(JSON.parse(m.data));
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    };
    return () => {
      es.close();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [flush]);

  const run = useCallback(async () => {
    const r = await fetch("/api/run", { method: "POST" });
    return r.ok;
  }, []);

  return { state, run };
}

function reduce(s: StreamState, e: Ev): StreamState {
  const t = e.t ?? 0;
  switch (e.event) {
    case "reset":
      return { ...s, ...EMPTY, running: true };
    case "start":
      return { ...s, running: true, config: e as unknown as Config };
    case "phase":
      return { ...s, phases: [...s.phases, { t, phase: e.phase as string }] };
    case "register":
      return {
        ...s,
        flow: { fd: e.fd as number, src: e.src as string, dst: e.dst as string, cc: e.cc as string, t },
      };
    case "decision": {
      const raw = e.features as number[];
      const features = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, raw[i]])) as Record<
        FeatureName,
        number
      >;
      const p: Point = {
        t,
        cc: e.cc as string,
        tput: features.tput_mbps,
        rtt: features.rtt_mean_ms,
        idle: features.idle_frac,
        cwnd: features.cwnd_mean,
        proba: e.proba as Record<string, number>,
        switch: e.switch as boolean,
        target: e.target as string,
        reason: e.reason as string,
        features,
      };
      return { ...s, points: [...s.points, p], flow: s.flow && { ...s.flow, cc: p.cc } };
    }
    case "ack": {
      const from = s.flow?.cc ?? "?";
      const sw = { t, from, to: e.cc as string, ok: e.ok as boolean };
      return {
        ...s,
        switches: [...s.switches, sw],
        flow: s.flow && e.ok ? { ...s.flow, cc: sw.to } : s.flow,
      };
    }
    case "summary":
      return { ...s, running: false, summary: e as unknown as Summary };
    case "error":
      return { ...s, running: false, error: e.message as string };
    default:
      return s;
  }
}
