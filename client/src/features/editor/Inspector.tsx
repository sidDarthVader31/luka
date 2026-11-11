import { useState } from "react";

import type {
  Catalog,
  CatalogItem,
  EdgeInteractionType,
  NodeProperties,
  RequestClass,
  RoutingRuleType,
} from "../../lib/api";
import { ComponentIcon } from "../../shared/icons/ComponentIcon";
import { NumberField } from "../../shared/ui/NumberField";
import { INTERACTION_LABELS, ROUTING_RULE_LABELS, edgeOptions } from "./scene/connection-rules";
import type { SelectionTarget } from "./scene/selection";
import type { ConnectionData } from "./scene/types";
import "./Inspector.css";

type InspectorProps = {
  target: SelectionTarget;
  catalog: Catalog;
  requestClasses: RequestClass[];
  onComponentChange: (elementId: string, properties: NodeProperties) => void;
  onConnectionChange: (elementId: string, patch: Partial<ConnectionData>) => void;
  onMakeComponent: (elementId: string, item: CatalogItem) => void;
};

export function Inspector(props: InspectorProps) {
  const { target } = props;
  if (!target) {
    return null;
  }
  return (
    <aside className="inspector" aria-label="Inspector">
      {target.kind === "component" ? (
        <ComponentSection
          key={target.element.id}
          target={target}
          onChange={(properties) => props.onComponentChange(target.element.id, properties)}
        />
      ) : null}
      {target.kind === "connection" ? (
        <ConnectionSection
          key={target.element.id}
          target={target}
          requestClasses={props.requestClasses}
          onChange={(patch) => props.onConnectionChange(target.element.id, patch)}
        />
      ) : null}
      {target.kind === "shape" ? (
        <MakeComponentSection
          key={target.element.id}
          catalog={props.catalog}
          onPick={(item) => props.onMakeComponent(target.element.id, item)}
        />
      ) : null}
    </aside>
  );
}

function ComponentSection(props: {
  target: Extract<SelectionTarget, { kind: "component" }>;
  onChange: (properties: NodeProperties) => void;
}) {
  const { item, node } = props.target;
  const primary = item.fields.filter((field) => field.primary);
  const more = item.fields.filter((field) => !field.primary);
  const renderField = (field: CatalogItem["fields"][number]) => (
    <NumberField
      key={field.key}
      label={field.label}
      unit={field.unit}
      help={field.help}
      min={field.min}
      max={field.max}
      step={field.step}
      value={node.properties[field.key]}
      onCommit={(value) => props.onChange({ ...node.properties, [field.key]: value })}
    />
  );

  return (
    <>
      <header className="inspector__header">
        <ComponentIcon name={item.icon} />
        <div>
          <h2>{node.label}</h2>
          <p>{item.name}</p>
        </div>
      </header>
      {item.fields.length === 0 ? (
        <p className="inspector__note">
          Traffic enters here. Set requests per second in the traffic bar.
        </p>
      ) : null}
      <div className="inspector__fields">{primary.map(renderField)}</div>
      {more.length > 0 ? (
        <details className="inspector__more">
          <summary>More settings</summary>
          <div className="inspector__fields">{more.map(renderField)}</div>
        </details>
      ) : null}
      <p className="inspector__note">Double-click the box on the canvas to rename it.</p>
    </>
  );
}

function ConnectionSection(props: {
  target: Extract<SelectionTarget, { kind: "connection" }>;
  requestClasses: RequestClass[];
  onChange: (patch: Partial<ConnectionData>) => void;
}) {
  const { edge, sourceItem } = props.target;
  const options = edgeOptions(sourceItem);
  const requestClassIds = edge.request_class_ids ?? [];

  return (
    <>
      <header className="inspector__header">
        <div>
          <h2>Connection</h2>
          <p>From {sourceItem?.name ?? "component"}</p>
        </div>
      </header>
      <div className="inspector__fields">
        <SelectField
          label="Interaction"
          value={edge.interaction_type}
          options={options.interactions.map((value) => ({
            value,
            label: INTERACTION_LABELS[value],
          }))}
          onChange={(value) =>
            props.onChange({
              interactionType: value as EdgeInteractionType,
              ...(value === "fallback" ? { ruleType: "always" } : {}),
            })
          }
        />
        {options.routingRules.length > 1 && edge.interaction_type !== "fallback" ? (
          <SelectField
            label="When"
            value={edge.routing_rule.rule_type}
            options={options.routingRules.map((value) => ({
              value,
              label: ROUTING_RULE_LABELS[value],
            }))}
            onChange={(value) => props.onChange({ ruleType: value as RoutingRuleType })}
          />
        ) : null}
        {props.requestClasses.length > 1 ? (
          <fieldset className="field inspector__paths">
            <legend>Traffic paths</legend>
            {props.requestClasses.map((path) => (
              <label key={path.id} className="inspector__check">
                <input
                  type="checkbox"
                  checked={requestClassIds.includes(path.id)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...requestClassIds, path.id]
                      : requestClassIds.filter((id) => id !== path.id);
                    props.onChange({ requestClassIds: next });
                  }}
                />
                {path.name}
              </label>
            ))}
          </fieldset>
        ) : null}
      </div>
      <details className="inspector__more">
        <summary>More settings</summary>
        <div className="inspector__fields">
          <NumberField
            label="Fan-out"
            help="Calls made to the target per incoming request."
            min={0}
            step={0.5}
            placeholder="1"
            value={edge.fanout_multiplier}
            onCommit={(value) => props.onChange({ fanoutMultiplier: value })}
          />
          <NumberField
            label="Timeout"
            unit="ms"
            min={0}
            step={50}
            value={edge.timeout_ms}
            onCommit={(value) => props.onChange({ timeoutMs: value })}
          />
          <NumberField
            label="Retries"
            min={0}
            max={10}
            step={1}
            value={edge.retry_attempts}
            onCommit={(value) => props.onChange({ retryAttempts: value })}
          />
        </div>
      </details>
    </>
  );
}

function MakeComponentSection(props: { catalog: Catalog; onPick: (item: CatalogItem) => void }) {
  const [choice, setChoice] = useState(props.catalog.items[0]?.id ?? "");
  const item = props.catalog.items.find((entry) => entry.id === choice);
  return (
    <>
      <header className="inspector__header">
        <div>
          <h2>Shape</h2>
          <p>Ignored by the simulator</p>
        </div>
      </header>
      <div className="inspector__fields">
        <div className="field">
          <label htmlFor="make-component">Make this a component</label>
          <select
            id="make-component"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {props.catalog.categories.map((category) => (
              <optgroup key={category.id} label={category.name}>
                {props.catalog.items
                  .filter((entry) => entry.category_id === category.id)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!item}
          onClick={() => item && props.onPick(item)}
        >
          Make component
        </button>
      </div>
    </>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
