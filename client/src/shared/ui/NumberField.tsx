import { useEffect, useId, useState } from "react";

type NumberFieldProps = {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  unit?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

/**
 * Number input that commits on blur or Enter rather than per keystroke, so each edit is a single
 * undo step. Empty commits `undefined`; out-of-range values are clamped.
 */
export function NumberField(props: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(props.value === undefined ? "" : String(props.value));

  useEffect(() => {
    setDraft(props.value === undefined ? "" : String(props.value));
  }, [props.value]);

  function commit() {
    if (draft.trim() === "") {
      if (props.value !== undefined) {
        props.onCommit(undefined);
      }
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(props.value === undefined ? "" : String(props.value));
      return;
    }
    const clamped = Math.min(
      props.max ?? Number.POSITIVE_INFINITY,
      Math.max(props.min ?? 0, parsed),
    );
    setDraft(String(clamped));
    if (clamped !== props.value) {
      props.onCommit(clamped);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="field__control">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={draft}
          min={props.min}
          max={props.max}
          step={props.step}
          placeholder={props.placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
            }
          }}
        />
        {props.unit ? <span className="field__unit">{props.unit}</span> : null}
      </div>
      {props.help ? <small className="field__help">{props.help}</small> : null}
    </div>
  );
}
