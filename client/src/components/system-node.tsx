import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NodeArchetype } from "../lib/api";

export type SystemNodeData = {
  label: string;
  archetype: NodeArchetype;
};

export function SystemNode({ data, selected }: NodeProps) {
  const typedData = data as SystemNodeData;

  return (
    <div className={`system-node${selected ? " selected" : ""}`}>
      <Handle className="system-handle" type="target" position={Position.Left} />
      <div className="system-node__type">{typedData.archetype}</div>
      <strong>{typedData.label}</strong>
      <Handle
        className="system-handle"
        type="source"
        position={Position.Right}
      />
    </div>
  );
}
