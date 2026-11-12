import { IconAlertTriangle, IconArrowLeft, IconPlayerPlay, IconTarget } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { TargetSummary } from "./lib/results";
import type { SaveState } from "./useDesignDocument";
import "./TopBar.css";

export type EditorIssue = {
  message: string;
  elementIds: string[];
  /** Errors (a failed run) are shown in red; the rest are warnings about ignored arrows. */
  severity: "error" | "warning";
};

type TopBarProps = {
  name: string;
  onNameChange: (name: string) => void;
  saveState: SaveState;
  issues: EditorIssue[];
  onIssueClick: (issue: EditorIssue) => void;
  running: boolean;
  onRun: () => void;
  /** Shown after a run of a problem design. */
  targets?: TargetSummary | null;
  onTargetsClick?: () => void;
};

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
};

export function TopBar(props: TopBarProps) {
  const [showIssues, setShowIssues] = useState(false);
  const hasError = props.issues.some((issue) => issue.severity === "error");

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
            data-blocking={hasError}
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
                    data-blocking={issue.severity === "error"}
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
      {props.targets ? (
        <button
          type="button"
          className="topbar__targets"
          data-passed={props.targets.allPassed}
          onClick={props.onTargetsClick}
        >
          <IconTarget size={16} aria-hidden />
          {props.targets.label}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn--primary"
        disabled={props.running}
        title="Simulate this design"
        onClick={props.onRun}
      >
        <IconPlayerPlay size={16} aria-hidden />
        {props.running ? "Running…" : "Run"}
      </button>
    </header>
  );
}
