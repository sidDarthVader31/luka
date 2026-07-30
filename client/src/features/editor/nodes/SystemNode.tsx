import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NodeArchetype, NodeColor } from "../../../lib/api";

export type SystemNodeData = {
  label: string;
  archetype: NodeArchetype;
  color: NodeColor;
  properties: Record<string, number | undefined>;
  utilization?: number;
  utilizationLabel?: string;
  trafficLabel?: string;
  isBottleneck?: boolean;
  hasError?: boolean;
  connectSource?: boolean;
};

export function SystemNode({ data, selected }: NodeProps) {
  const typed = data as SystemNodeData;
  const util = typed.utilization ?? 0;
  const statusClass =
    util >= 1 ? "luka-node--saturated" : util >= 0.8 ? "luka-node--warming" : "";

  return (
    <div
      className={[
        "luka-node",
        `luka-node--${typed.archetype}`,
        statusClass,
        selected ? "selected" : "",
        typed.isBottleneck ? "luka-node--bottleneck" : "",
        typed.hasError ? "luka-node--error" : "",
        typed.connectSource ? "luka-node--connect-source" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Handle className="luka-handle luka-handle--target" type="target" position={Position.Left} />
      <div className="luka-node__eyebrow">
        <span>{typed.archetype.replaceAll("_", " ")}</span>
        {typed.isBottleneck ? <span>hot</span> : null}
      </div>
      <strong className="luka-node__label">{typed.label}</strong>
      {typed.utilizationLabel || typed.trafficLabel ? (
        <div className="luka-node__meta">
          {typed.utilizationLabel ? (
            <span
              className={`luka-node__pill${
                util >= 1 ? " luka-node__pill--danger" : util >= 0.8 ? " luka-node__pill--warn" : ""
              }`}
            >
              {typed.utilizationLabel}
            </span>
          ) : null}
          {typed.trafficLabel ? (
            <span className="luka-node__pill">{typed.trafficLabel}</span>
          ) : null}
        </div>
      ) : null}
      <Handle className="luka-handle luka-handle--source" type="source" position={Position.Right} />
    </div>
  );
}
