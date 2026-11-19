"use client";

import { Play } from "lucide-react";

import { CoreArchitecture } from "@/components/accc/core-architecture";
import { Topbar } from "@/components/app/topbar";
import { Eyebrow } from "@/components/ui/chip";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useAcccStream } from "@/lib/use-accc-stream";

/** The default section: ACCC's core architecture, and nothing else. */
export function Dashboard() {
  const { state, run } = useAcccStream();
  const { config, points, phases, switches, flow, running, connected } = state;

  const start = async () => {
    const ok = await run();
    if (!ok) toast.error("A run is already in progress");
  };

  return (
    <>
      <Topbar
        workspace="ACCC"
        object="Core architecture"
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-pos-fg" : "bg-ink-faint")} />
            {connected ? "Controller connected" : "Demo mode (no backend)"}
          </span>
        }
        actions={
          connected && (
            <button
              type="button"
              onClick={start}
              disabled={running}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={2} />
              {running ? "Running…" : "Run real controller"}
            </button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4 sm:p-6">
          <div>
            <Eyebrow>Adaptive Congestion Control Controller</Eyebrow>
            <h1 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">Core architecture</h1>
            <p className="mt-1 max-w-[760px] text-[13px] leading-[1.6] text-ink-muted">
              An unmodified app sends data through a normal TCP socket. A preloaded shim streams the socket&rsquo;s telemetry to the ACCC controller, which decides which
              congestion-control algorithm fits the traffic and switches the live socket — without dropping the connection.
            </p>
          </div>

          <CoreArchitecture config={config} flow={flow} last={points[points.length - 1]} phase={phases[phases.length - 1]?.phase} switches={switches} running={running} />
        </div>
      </div>
    </>
  );
}
