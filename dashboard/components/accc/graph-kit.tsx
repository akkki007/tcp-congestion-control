"use client";

import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * The visual language of kaizen's graph map (github.com/akkki007/kaizen, ui/components/graph-map.tsx):
 * square icon tiles, hairline frames with a mono label sitting on the border, dashed orthogonal
 * connectors, a dash pulsing along the edge the story is about, and a plain-language explanation
 * of whatever node was clicked, shown under the diagram.
 *
 * These diagrams are drawn on a fixed canvas: every tile is placed by its centre point, so the
 * connectors are plain coordinates and never have to be measured from the DOM.
 */

export const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.06em]";
export const TILE = 52;

/** Absolutely positioned by centre. */
export function At({ x, y, children, className }: { x: number; y: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute -translate-x-1/2 -translate-y-1/2", className)} style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

export function Tile<T extends string>({
  id,
  icon,
  label,
  fill,
  tone,
  selected = false,
  size = TILE,
  onClick,
}: {
  id: T;
  icon: ReactNode;
  label: string;
  fill?: string;
  tone?: "amber" | "green" | "red";
  selected?: boolean;
  size?: number;
  onClick?: (id: T) => void;
}) {
  return (
    <button
      type="button"
      data-tile={id}
      aria-label={`${label} — explain`}
      aria-pressed={selected}
      onClick={() => onClick?.(id)}
      style={{ width: size, height: size, ...(fill ? { background: fill, borderColor: "transparent" } : {}) }}
      className={cn(
        "relative z-10 grid shrink-0 cursor-pointer place-items-center border transition-[box-shadow,transform,background-color,border-color] duration-300 hover:-translate-y-px hover:shadow-e2",
        fill ? "text-white" : "border-line-strong bg-surface text-ink",
        !fill && tone === "amber" && "border-[#d9a400] text-[#a87f00]",
        !fill && tone === "green" && "border-pos-fg text-pos-fg",
        !fill && tone === "red" && "border-neg-fg text-neg-fg",
        selected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-surface",
      )}
    >
      {icon}
    </button>
  );
}

/** A tile with its caption and a live sub-line, centred on (x, y) = the tile's centre. */
export function NodeAt<T extends string>({
  x,
  y,
  caption,
  sub,
  ...tile
}: { x: number; y: number; caption: string; sub?: ReactNode } & Parameters<typeof Tile<T>>[0]) {
  const size = tile.size ?? TILE;
  return (
    <div className="absolute flex w-[120px] -translate-x-1/2 flex-col items-center" style={{ left: x, top: y - size / 2 }}>
      <Tile {...tile} />
      <span className={cn(LABEL, "mt-1.5 h-4 whitespace-nowrap text-ink-2")}>{caption}</span>
      <span className="h-5 whitespace-nowrap text-[11px] text-ink-muted">{sub}</span>
    </div>
  );
}

/** A hairline region with its label sitting on the top border. */
export function FrameAt({
  x,
  y,
  w,
  h,
  label,
  icon,
  note,
  dashed,
  style,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  icon?: ReactNode;
  note?: string;
  dashed?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute border", dashed ? "border-dashed border-ink-faint" : "border-line-strong")}
      style={{ left: x, top: y, width: w, height: h, ...style }}
    >
      <p
        className={cn(
          LABEL,
          "absolute -top-2 left-3 inline-flex items-center gap-1.5 bg-surface px-1.5 whitespace-nowrap",
          dashed ? "text-[9.5px] text-ink-faint" : "font-semibold text-ink",
        )}
      >
        {icon}
        {label}
        {note && <span className="font-normal normal-case tracking-normal text-ink-faint">{note}</span>}
      </p>
    </div>
  );
}

/** Small mono annotation on a connector. */
export function Tag({ x, y, children, align = "c", tone }: { x: number; y: number; children: ReactNode; align?: "l" | "c" | "r"; tone?: "violet" }) {
  return (
    <span
      aria-hidden
      className={cn(
        LABEL,
        "pointer-events-none absolute text-[9.5px] whitespace-nowrap",
        tone === "violet" ? "text-violet-500" : "text-ink-faint",
        align === "c" && "-translate-x-1/2",
        align === "r" && "-translate-x-full",
      )}
      style={{ left: x, top: y }}
    >
      {children}
    </span>
  );
}

export type Explanation = {
  kind: string;
  title: string;
  text: ReactNode;
  facts?: [string, ReactNode][];
  tone?: "violet" | "ink";
};

/** Plain-language explanation of the clicked node, under the diagram (kaizen's NodeExplain). */
export function ExplainPanel({ info, onClose }: { info: Explanation; onClose: () => void }) {
  return (
    <section aria-label={info.title} aria-live="polite" className="rounded-control border border-line bg-subtle">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={cn(LABEL, info.tone === "violet" ? "text-violet-500" : "text-ink-muted")}>{info.kind}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{info.title}</h3>
        </div>
        <button type="button" aria-label="Close explanation" onClick={onClose} className="grid size-7 place-items-center rounded-button text-ink-muted hover:bg-hover hover:text-ink">
          <X size={14} />
        </button>
      </header>
      <div className="px-4 pt-3 pb-3 text-[13px] leading-[1.65] text-ink-2">{info.text}</div>
      {info.facts && info.facts.length > 0 && (
        <dl className="grid gap-x-4 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          {info.facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className={cn(LABEL, "text-ink-muted")}>{k}</dt>
              <dd className="mt-0.5 text-[13px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}
