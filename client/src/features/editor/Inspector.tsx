import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";

import type { Catalog, CatalogItem, EdgeMode, EdgeTraffic, NodeProperties } from "../../lib/api";
import { ComponentIcon } from "../../shared/icons/ComponentIcon";
import { NumberField } from "../../shared/ui/NumberField";
import {
  MODE_LABELS,
  TRAFFIC_LABELS,
  isAlwaysAsync,
  usesWeight,
} from "./scene/connection-rules";
import type { SelectionTarget } from "./scene/selection";
import type { ConnectionData } from "./scene/types";
import "./Inspector.css";

type InspectorProps = {
  target: SelectionTarget;
  catalog: Catalog;
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
          onChange={(patch) => props.onConnectionChange(target.element.id, patch)}
        />
      ) : null}
      {target.kind === "disallowed-connection" ? (
        <DisallowedSection key={target.element.id} reason={target.reason} />
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
  onChange: (patch: Partial<ConnectionData>) => void;
}) {
  const { data, sourceItem } = props.target;
  const alwaysAsync = isAlwaysAsync(sourceItem);

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
          label="Traffic"
          value={data.traffic}
          options={(Object.keys(TRAFFIC_LABELS) as EdgeTraffic[]).map((value) => ({
            value,
            label: TRAFFIC_LABELS[value],
          }))}
          onChange={(value) => props.onChange({ traffic: value as EdgeTraffic })}
        />
        <SelectField
          label="Mode"
          value={alwaysAsync ? "async" : data.mode}
          disabled={alwaysAsync}
          options={(Object.keys(MODE_LABELS) as EdgeMode[]).map((value) => ({
            value,
            label: MODE_LABELS[value],
          }))}
          onChange={(value) => props.onChange({ mode: value as EdgeMode })}
        />
        {alwaysAsync ? (
          <p className="inspector__note">A queue always delivers asynchronously.</p>
        ) : null}
        {usesWeight(sourceItem) ? (
          <NumberField
            label="Weight"
            help="Share of this gateway's traffic, relative to its other connections."
            min={0}
            step={1}
            placeholder="1"
            value={data.weight}
            onCommit={(value) => props.onChange({ weight: value })}
          />
        ) : null}
      </div>
      <p className="inspector__note">
        Waits for response: adds latency and failures to the caller. Fire and forget: carries load
        only. Drawn dashed.
      </p>
    </>
  );
}

function DisallowedSection(props: { reason: string }) {
  return (
    <>
      <header className="inspector__header">
        <div>
          <h2>Connection not allowed</h2>
          <p>Ignored by the simulator</p>
        </div>
      </header>
      <p className="inspector__problem" role="alert">
        <IconAlertTriangle size={16} aria-hidden />
        <span>{props.reason}</span>
      </p>
      <p className="inspector__note">Delete the arrow or attach it to a different component.</p>
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
  disabled?: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
