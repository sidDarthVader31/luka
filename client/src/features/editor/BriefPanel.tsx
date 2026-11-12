import { IconChevronDown, IconChevronUp, IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { useState } from "react";

import type { Problem, TargetResult } from "../../lib/api";
import { BriefMarkdown } from "../problems/BriefMarkdown";
import { formatTargetValue } from "./lib/results";
import "./BriefPanel.css";

type BriefPanelProps = {
  problem: Problem;
  /** Target results from the latest run, if any. */
  results?: TargetResult[];
};

const NARROW_QUERY = "(max-width: 1279px)";

/** The problem's brief and targets, floating over the top-left of the canvas. */
export function BriefPanel({ problem, results }: BriefPanelProps) {
  // On a narrow window the open brief would cover most of the canvas; start it collapsed there.
  const [open, setOpen] = useState(() => !window.matchMedia(NARROW_QUERY).matches);
  const byId = new Map(results?.map((result) => [result.target_id, result]));

  return (
    <section className="brief" data-open={open} aria-label="Problem brief">
      <button
        type="button"
        className="brief__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="brief__kicker">Brief</span>
          <strong>{problem.title}</strong>
        </span>
        {open ? <IconChevronUp size={16} aria-hidden /> : <IconChevronDown size={16} aria-hidden />}
      </button>
      {open ? (
        <div className="brief__body">
          <div className="brief__markdown">
            <BriefMarkdown source={problem.brief} />
          </div>
          {problem.targets.length > 0 ? (
            <>
              <h4>Targets</h4>
              <ul className="brief__targets">
                {problem.targets.map((target) => {
                  const result = byId.get(target.id);
                  return (
                    <li key={target.id} data-passed={result?.passed}>
                      {result ? (
                        result.passed ? (
                          <IconCircleCheck size={14} aria-label="Passed" />
                        ) : (
                          <IconCircleX size={14} aria-label="Failed" />
                        )
                      ) : (
                        <span className="brief__dot" aria-hidden />
                      )}
                      <span>{target.label}</span>
                      <span className="brief__value">
                        {target.comparison === "at_most" ? "≤" : "≥"}{" "}
                        {formatTargetValue(target.metric, target.value)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
