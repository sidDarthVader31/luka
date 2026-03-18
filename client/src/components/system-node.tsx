import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NodeArchetype } from "../lib/api";

export type SystemNodeData = {
  label: string;
  archetype: NodeArchetype;
  color: "blue" | "green" | "yellow" | "red";
  status: "idle" | "active" | "bottleneck";
  utilizationLabel?: string;
  trafficLabel?: string;
};

export function SystemNode({ data, selected }: NodeProps) {
  const typedData = data as SystemNodeData;

  return (
    <div
      className={`system-node system-node--${typedData.color} system-node--${typedData.status}${
        selected ? " selected" : ""
      }`}
    >
      <Handle className="system-handle" type="target" position={Position.Left} />
      <div className="system-node__eyebrow">
        <span className="system-node__type">{typedData.archetype}</span>
        <span className="system-node__status">{typedData.status}</span>
      </div>
      <strong>{typedData.label}</strong>
      {typedData.utilizationLabel || typedData.trafficLabel ? (
        <div className="system-node__meta">
          {typedData.utilizationLabel ? (
            <span>{typedData.utilizationLabel}</span>
          ) : null}
          {typedData.trafficLabel ? <span>{typedData.trafficLabel}</span> : null}
        </div>
      ) : null}
      <Handle
        className="system-handle"
        type="source"
        position={Position.Right}
      />
    </div>
  );
}
