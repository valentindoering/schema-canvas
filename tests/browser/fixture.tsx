import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import type { SchemaAnnotation, SchemaLayout } from "../../src/core/index.js";
import { SchemaCanvas } from "../../src/react/index.js";
import "../../src/styles.css";
import { graph, layout as initialLayout } from "../fixtures.js";

function Fixture() {
  const [writable, setWritable] = useState(false);
  const [layout, setLayout] = useState<SchemaLayout>(initialLayout);
  const [annotations, setAnnotations] = useState<SchemaAnnotation[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  return (
    <main style={{ height: "100vh" }}>
      <button
        type="button"
        data-testid="mode"
        onClick={() => setWritable((value) => !value)}
      >
        {writable ? "Use read-only mode" : "Use writable mode"}
      </button>
      <output data-testid="selected">{selectedTable ?? "none"}</output>
      <output data-testid="layout" hidden>
        {JSON.stringify(layout)}
      </output>
      <output data-testid="annotations" hidden>
        {JSON.stringify(annotations)}
      </output>
      <SchemaCanvas
        graph={graph}
        layout={layout}
        annotations={annotations}
        writable={writable}
        onSelectedTableChange={setSelectedTable}
        renderTableDetails={(table) => (
          <p data-testid="table-details">Fixture source: {table.id}</p>
        )}
        onSaveLayout={async ({ value }) => {
          setLayout(value);
          return { value, revision: crypto.randomUUID() };
        }}
        onSaveAnnotations={async ({ value }) => {
          setAnnotations(value);
          return { value, revision: crypto.randomUUID() };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
