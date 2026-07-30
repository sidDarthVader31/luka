import type { ComponentArchetype, NodeArchetype } from "../../../lib/api";

const ICONS: Record<NodeArchetype, string> = {
  client: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z",
  gateway: "M4 7h16v3H4Zm0 7h16v3H4ZM9 4h6v3H9Zm0 13h6v3H9Z",
  stateless_service: "M5 5h14v6H5Zm0 8h14v6H5Z",
  cache: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4Zm0 4h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 4h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 4c0 1.7 3.6 3 8 3s8-1.3 8-3M4 14c0 1.7 3.6 3 8 3s8-1.3 8-3M4 10v8c0 1.7 3.6 3 8 3s8-1.3 8-3v-8",
  queue: "M4 8h16v3H4Zm0 5h16v3H4Zm3-9h10v2H7Zm0 14h10v2H7Z",
  worker: "M7 4h10v4H7Zm-2 6h14v10H5Zm4 2v6m6-6v6",
};

export function ArchetypeIcon({ archetype }: { archetype: NodeArchetype }) {
  return (
    <svg className="palette-tile__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={ICONS[archetype]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ComponentPalette(props: {
  archetypes: ComponentArchetype[];
  hasClient: boolean;
  onDragStart: (archetype: ComponentArchetype) => void;
  onPlace: (archetype: ComponentArchetype) => void;
}) {
  return (
    <aside className="editor-palette">
      <p className="editor-palette__title">Components</p>
      <div className="editor-palette__grid">
        {props.archetypes.map((archetype) => {
          const disabled = archetype.archetype === "client" && props.hasClient;
          return (
            <button
              key={archetype.archetype}
              className="palette-tile"
              type="button"
              disabled={disabled}
              draggable={!disabled}
              title={
                disabled
                  ? "Only one Client node is supported"
                  : "Drag onto canvas or click to place"
              }
              onDragStart={(event) => {
                if (disabled) {
                  return;
                }
                event.dataTransfer.setData(
                  "application/luka-archetype",
                  archetype.archetype,
                );
                event.dataTransfer.effectAllowed = "move";
                props.onDragStart(archetype);
              }}
              onClick={() => {
                if (!disabled) {
                  props.onPlace(archetype);
                }
              }}
            >
              <ArchetypeIcon archetype={archetype.archetype} />
              <span className="palette-tile__name">{archetype.display_name}</span>
              <span className="palette-tile__hint">
                {disabled ? "Already placed" : "Drag or click"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
