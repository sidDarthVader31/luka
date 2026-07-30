import { Link, useParams } from "react-router-dom";

export function CompareRunsPage() {
  const { designId = "" } = useParams();

  return (
    <main className="library-page">
      <div className="library-page__inner">
        <header className="library-page__header">
          <p className="brand">Luka</p>
          <h1>Compare runs</h1>
          <p className="lead">
            Persisted run comparison is not available yet. Use in-editor baseline compare
            after a live Run for now.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
            <Link className="btn" to={`/designs/${designId}`}>
              Back to editor
            </Link>
            <Link className="btn btn--ghost" to="/">
              Library
            </Link>
          </div>
        </header>

        <div className="coming-soon-wrap" style={{ minHeight: "12rem" }}>
          <div className="coming-soon-wrap__overlay">
            <span className="coming-soon-chip">Coming soon</span>
          </div>
          <div className="coming-soon-wrap__content">
            <div className="metric-strip">
              <div className="metric-strip__kicker">Saved runs</div>
              <strong>Per-node utilization deltas between persisted runs</strong>
              <p>This page will unlock once saved-run history ships.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
