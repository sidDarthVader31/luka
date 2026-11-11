import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import type { GraphEdge, RequestClass, Workload } from "../../lib/api";
import { NumberField } from "../../shared/ui/NumberField";
import {
  addCustomPath,
  allTrafficTemplate,
  pathCoverageWarnings,
  pathPercents,
  readWriteSplitTemplate,
  removePath,
  renamePath,
  setPathPercent,
} from "./lib/traffic-paths";
import "./TrafficBar.css";

type TrafficBarProps = {
  workload: Workload;
  onWorkloadChange: (next: Workload) => void;
  requestClasses: RequestClass[];
  onRequestClassesChange: (next: RequestClass[]) => void;
  edges: GraphEdge[];
};

export function TrafficBar(props: TrafficBarProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Workload>) => props.onWorkloadChange({ ...props.workload, ...patch });

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="traffic" ref={root}>
      {open ? <TrafficPopover {...props} onSet={set} onClose={() => setOpen(false)} /> : null}
      <div className="traffic__bar" aria-label="Traffic">
        <span className="traffic__title">Traffic</span>
        <InlineNumber
          label="Requests/sec"
          value={props.workload.requests_per_second}
          min={1}
          onCommit={(value) => set({ requests_per_second: value })}
        />
        <InlineNumber
          label="Payload KB"
          value={props.workload.payload_kb ?? 1}
          min={0.1}
          onCommit={(value) => set({ payload_kb: value })}
        />
        <button
          type="button"
          className="btn btn--ghost btn--small"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <IconAdjustmentsHorizontal size={16} aria-hidden />
          More
        </button>
      </div>
    </div>
  );
}

function InlineNumber(props: {
  label: string;
  value: number;
  min: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed >= props.min) {
      props.onCommit(parsed);
    } else {
      setDraft(String(props.value));
    }
  };
  return (
    <label className="traffic__field">
      <input
        type="number"
        inputMode="decimal"
        min={props.min}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <span>{props.label}</span>
    </label>
  );
}

function TrafficPopover(
  props: TrafficBarProps & { onSet: (patch: Partial<Workload>) => void; onClose: () => void },
) {
  const percents = pathPercents(props.requestClasses);
  const coverage = pathCoverageWarnings(props.requestClasses, props.edges);
  const paths = props.requestClasses;
  const change = props.onRequestClassesChange;

  return (
    <section className="traffic__popover" aria-label="More traffic settings">
      <header>
        <h3>Traffic settings</h3>
        <button type="button" className="btn btn--icon" aria-label="Close" onClick={props.onClose}>
          <IconX size={16} />
        </button>
      </header>
      <div className="traffic__grid">
        <NumberField
          label="Concurrent users"
          min={0}
          step={1000}
          value={props.workload.concurrent_users}
          onCommit={(value) => props.onSet({ concurrent_users: value ?? 0 })}
        />
        <NumberField
          label="Read/write ratio"
          help="Reads per write."
          min={0.1}
          step={0.5}
          value={props.workload.read_write_ratio}
          onCommit={(value) => props.onSet({ read_write_ratio: value ?? 1 })}
        />
        <NumberField
          label="Async fan-out"
          help="Multiplies enqueue connections."
          min={1}
          step={1}
          value={props.workload.fanout_count}
          onCommit={(value) => props.onSet({ fanout_count: value ?? 1 })}
        />
      </div>

      <h4>Traffic paths</h4>
      <p className="traffic__hint">
        Split requests into named paths, then pick each connection's paths in the inspector.
      </p>
      <ul className="traffic__paths">
        {paths.map((path) => (
          <li key={path.id}>
            <input
              aria-label="Path name"
              value={path.name}
              onChange={(event) => change(renamePath(paths, path.id, event.target.value))}
            />
            <input
              aria-label="Share of traffic"
              type="number"
              min={1}
              max={99}
              value={percents.get(path.id) ?? 0}
              disabled={paths.length === 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  change(setPathPercent(paths, path.id, value));
                }
              }}
            />
            <span>%</span>
            {paths.length > 1 ? (
              <button
                type="button"
                className="btn btn--icon"
                aria-label={`Remove ${path.name}`}
                onClick={() => change(removePath(paths, path.id))}
              >
                <IconX size={14} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {coverage.map((warning) => (
        <p key={warning.pathId} className="traffic__warn">
          {warning.message}
        </p>
      ))}
      <div className="traffic__actions">
        {paths.length === 1 ? (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => change(readWriteSplitTemplate())}
          >
            Split read / write
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => change(allTrafficTemplate())}
          >
            Reset to one path
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => change(addCustomPath(paths))}
        >
          Add path
        </button>
      </div>
    </section>
  );
}
