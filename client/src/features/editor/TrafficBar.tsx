import { IconLock } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import type { Workload } from "../../lib/api";
import { formatCompactNumber } from "../../lib/format";
import { DEFAULT_READ_SHARE, DEFAULT_PAYLOAD_KB } from "./useSimulation";
import "./TrafficBar.css";

type TrafficBarProps = {
  workload: Workload;
  onWorkloadChange: (next: Workload) => void;
  /** Set when the design belongs to a problem: its workload is fixed and shown read-only. */
  lockedBy?: string;
};

export function TrafficBar(props: TrafficBarProps) {
  const { workload } = props;
  const readShare = workload.read_share ?? DEFAULT_READ_SHARE;
  const payload = workload.payload_kb ?? DEFAULT_PAYLOAD_KB;
  const set = (patch: Partial<Workload>) => props.onWorkloadChange({ ...workload, ...patch });

  if (props.lockedBy) {
    return (
      <div
        className="traffic__bar traffic__bar--locked"
        aria-label="Traffic"
        title={`Set by the problem "${props.lockedBy}"`}
      >
        <span className="traffic__title">
          <IconLock size={14} aria-hidden /> Traffic
        </span>
        <span className="traffic__value">
          <strong>{formatCompactNumber(workload.requests_per_second)}</strong> req/s
        </span>
        <span className="traffic__value">
          <strong>{Math.round(readShare * 100)}%</strong> reads
        </span>
        <span className="traffic__value">
          <strong>{payload}</strong> KB
        </span>
        <span className="traffic__hint">Set by the problem</span>
      </div>
    );
  }

  return (
    <div className="traffic__bar" aria-label="Traffic">
      <span className="traffic__title">Traffic</span>
      <InlineNumber
        label="Requests/sec"
        value={workload.requests_per_second}
        min={1}
        onCommit={(value) => set({ requests_per_second: value })}
      />
      <label className="traffic__field traffic__share">
        <input
          type="range"
          aria-label="Read share slider"
          min={0}
          max={100}
          step={5}
          value={Math.round(readShare * 100)}
          onChange={(event) => set({ read_share: Number(event.target.value) / 100 })}
        />
        <InlineNumber
          label="% reads"
          value={Math.round(readShare * 1000) / 10}
          min={0}
          max={100}
          width={56}
          onCommit={(value) => set({ read_share: value / 100 })}
        />
      </label>
      <InlineNumber
        label="Payload KB"
        value={payload}
        min={0.01}
        width={64}
        onCommit={(value) => set({ payload_kb: value })}
      />
    </div>
  );
}

function InlineNumber(props: {
  label: string;
  value: number;
  min: number;
  max?: number;
  width?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed >= props.min && parsed <= (props.max ?? Infinity)) {
      props.onCommit(parsed);
    } else {
      setDraft(String(props.value));
    }
  };
  return (
    <span className="traffic__field">
      <input
        type="number"
        inputMode="decimal"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        value={draft}
        style={props.width ? { width: props.width } : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <span>{props.label}</span>
    </span>
  );
}
