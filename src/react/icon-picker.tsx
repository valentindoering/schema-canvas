import { useState } from "react";

import { SchemaIcon, useSchemaIcons } from "./icons.js";
import type { SchemaCanvasLabels } from "./types.js";

const maxResults = 80;

/** Icon names from the host matching a query; exact and prefix matches first. */
export function matchIconNames(names: readonly string[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return names.slice(0, maxResults);
  const prefix: string[] = [];
  const inner: string[] = [];
  for (const name of names) {
    if (name.startsWith(term)) prefix.push(name);
    else if (name.includes(term)) inner.push(name);
    if (prefix.length >= maxResults) break;
  }
  return [...prefix, ...inner].slice(0, maxResults);
}

/** Search and pick one of the host's icons. `query` set means the editor drives the search. */
export function IconPicker({
  labels,
  value,
  query,
  onSelect,
}: {
  labels: SchemaCanvasLabels;
  value?: string | undefined;
  query?: string | undefined;
  onSelect: (name: string) => void;
}) {
  const { iconNames = [] } = useSchemaIcons();
  const [search, setSearch] = useState("");
  const results = matchIconNames(iconNames, query ?? search);
  return (
    <div className="schema-canvas__icon-picker">
      {query === undefined ? (
        <input
          autoFocus
          type="search"
          aria-label={labels.searchIcons}
          placeholder={labels.searchIcons}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              onSelect(results[0]);
            }
          }}
        />
      ) : null}
      {results.length ? (
        <div
          className="schema-canvas__icon-grid"
          role="listbox"
          aria-label={labels.chooseIcon}
        >
          {results.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={value === name}
              aria-label={name}
              title={name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(name)}
            >
              <SchemaIcon name={name} />
            </button>
          ))}
        </div>
      ) : (
        <p className="schema-canvas__icon-picker-empty">
          {labels.noMatchingIcons}
        </p>
      )}
    </div>
  );
}

/** Text colour plus every palette colour the host supplies. */
export function IconColorPicker({
  labels,
  value,
  onChange,
}: {
  labels: SchemaCanvasLabels;
  value?: string | undefined;
  onChange: (color: string | undefined) => void;
}) {
  const { iconColors } = useSchemaIcons();
  const names = Object.keys(iconColors);
  if (!names.length) return null;
  return (
    <div
      className="schema-canvas__icon-colors"
      role="radiogroup"
      aria-label={labels.iconColor}
    >
      {[undefined, ...names].map((name) => (
        <button
          key={name ?? ""}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name ?? labels.textColor}
          title={name ?? labels.textColor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(name)}
        >
          <span
            className={`schema-canvas__icon-color-swatch${name ? "" : " schema-canvas__icon-color-swatch--text"}`}
            style={name ? { background: iconColors[name] } : undefined}
          />
        </button>
      ))}
    </div>
  );
}
