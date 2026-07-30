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

const RIM_SIDES: Array<{
  position: Position;
  sourceId: string;
  targetId: string;
  side: "top" | "right" | "bottom" | "left";
}> = [
  { position: Position.Top, sourceId: "out-top", targetId: "in-top", side: "top" },
  { position: Position.Right, sourceId: "out-right", targetId: "in-right", side: "right" },
  { position: Position.Bottom, sourceId: "out-bottom", targetId: "in-bottom", side: "bottom" },
  { position: Position.Left, sourceId: "out-left", targetId: "in-left", side: "left" },
];

/**
 * Interior = move node. Boundary rim (any side) = start/finish connection.
 * Handles sit slightly outside the box so arrowheads stay visible.
 */
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
      {RIM_SIDES.map((side) => (
        <Handle
          key={side.sourceId}
          className={`luka-rim-handle luka-rim-handle--source luka-rim-handle--${side.side} nodrag nopan`}
          type="source"
          position={side.position}
          id={side.sourceId}
        />
      ))}
      {RIM_SIDES.map((side) => (
        <Handle
          key={side.targetId}
          className={`luka-rim-handle luka-rim-handle--target luka-rim-handle--${side.side} nodrag nopan`}
          type="target"
          position={side.position}
          id={side.targetId}
        />
      ))}

      <div className="luka-node__body">
        <div className="luka-node__eyebrow">
          <span>{typed.archetype.replaceAll("_", " ")}</span>
          {typed.isBottleneck ? <span className="luka-node__hot">HOT</span> : null}
        </div>
        <strong className="luka-node__label">{typed.label}</strong>
        {typed.utilizationLabel || typed.trafficLabel ? (
          <div className="luka-node__meta">
            {typed.utilizationLabel ? (
              <span
                className={`luka-node__pill${
                  util >= 1
                    ? " luka-node__pill--danger"
                    : util >= 0.8
                      ? " luka-node__pill--warn"
                      : ""
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
      </div>
    </div>
  );
}
