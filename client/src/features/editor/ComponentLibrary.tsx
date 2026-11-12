import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Catalog, CatalogItem } from "../../lib/api";
import { ComponentIcon } from "../../shared/icons/ComponentIcon";
import { COMPONENT_DRAG_TYPE } from "./Canvas";
import "./ComponentLibrary.css";

type ComponentLibraryProps = {
  catalog: Catalog;
  onInsert: (item: CatalogItem) => void;
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ComponentLibrary({ catalog, onInsert }: ComponentLibraryProps) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);

  // "/" focuses search unless the user is typing somewhere (including Excalidraw's text editor).
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        search.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, []);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = catalog.items.filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.kind.replace("_", " ").includes(needle),
    );
    return catalog.categories
      .map((category) => ({
        category,
        items: matches.filter((item) => item.category_id === category.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [catalog, query]);

  return (
    <aside className="library" aria-label="Component library">
      <label className="library__search">
        <IconSearch size={16} aria-hidden />
        <input
          ref={search}
          type="search"
          placeholder="Search components"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && groups[0]?.items[0]) {
              onInsert(groups[0].items[0]);
            }
          }}
        />
        <kbd>/</kbd>
      </label>
      <div className="library__groups">
        {groups.map(({ category, items }) => (
          <section key={category.id} className="library__group">
            <h3>{category.name}</h3>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="library__item"
                    title={`${item.name}: ${item.description}`}
                    aria-label={item.name}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(COMPONENT_DRAG_TYPE, item.id);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onInsert(item)}
                  >
                    <ComponentIcon name={item.icon} />
                    <span>{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 ? <p className="library__empty">No components match.</p> : null}
      </div>
      <p className="library__hint">
        Click to add, or drag onto the canvas. Draw arrows to connect.
      </p>
    </aside>
  );
}
