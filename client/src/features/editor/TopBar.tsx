import { IconAlertTriangle, IconArrowLeft, IconPlayerPlay } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { SaveState } from "./useDesignDocument";
import "./TopBar.css";

export type EditorIssue = {
  message: string;
  elementIds: string[];
  /** Blocking issues stop Run; the rest are warnings about ignored arrows. */
  blocking: boolean;
};

type TopBarProps = {
  name: string;
  onNameChange: (name: string) => void;
  saveState: SaveState;
  issues: EditorIssue[];
  onIssueClick: (issue: EditorIssue) => void;
  running: boolean;
  onRun: () => void;
};

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
};

export function TopBar(props: TopBarProps) {
  const [showIssues, setShowIssues] = useState(false);
  const blocking = props.issues.some((issue) => issue.blocking);

  return (
    <header className="topbar">
      <Link className="btn btn--icon" to="/" aria-label="Back to home">
        <IconArrowLeft size={18} />
      </Link>
      <input
        className="topbar__name"
        aria-label="Design name"
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      />
      <span className="topbar__save" data-state={props.saveState}>
        {SAVE_LABELS[props.saveState]}
      </span>
      <div className="topbar__spacer" />
      {props.issues.length > 0 ? (
        <div className="topbar__issues">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            data-blocking={blocking}
            aria-expanded={showIssues}
            onClick={() => setShowIssues((value) => !value)}
          >
            <IconAlertTriangle size={16} aria-hidden />
            {props.issues.length} {props.issues.length === 1 ? "issue" : "issues"}
          </button>
          {showIssues ? (
            <ul className="topbar__issue-list">
              {props.issues.map((issue) => (
                <li key={`${issue.message}-${issue.elementIds.join(",")}`}>
                  <button
                    type="button"
                    data-blocking={issue.blocking}
                    disabled={issue.elementIds.length === 0}
                    onClick={() => {
                      props.onIssueClick(issue);
                      setShowIssues(false);
                    }}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn--primary"
        disabled={props.running || blocking}
        title={blocking ? "Fix the issues first" : "Simulate this design"}
        onClick={props.onRun}
      >
        <IconPlayerPlay size={16} aria-hidden />
        {props.running ? "Running…" : "Run"}
      </button>
    </header>
  );
}
