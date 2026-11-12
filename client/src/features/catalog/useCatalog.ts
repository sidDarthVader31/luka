import { useEffect, useState } from "react";

import { type Catalog, getCatalog } from "../../lib/api";

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: Catalog }
  | { status: "error"; message: string };

let cached: Promise<Catalog> | null = null;

function loadCatalog(): Promise<Catalog> {
  cached ??= getCatalog().catch((error: unknown) => {
    // Let the next mount retry.
    cached = null;
    throw error;
  });
  return cached;
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((catalog) => active && setState({ status: "ready", catalog }))
      .catch(
        (error: unknown) =>
          active &&
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load components",
          }),
      );
    return () => {
      active = false;
    };
  }, []);
  return state;
}
