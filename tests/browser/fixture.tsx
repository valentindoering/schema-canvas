import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { SchemaAnnotation, SchemaLayout } from "../../src/core/index.js";
import {
  SchemaCanvas,
  type SchemaCanvasHandle,
} from "../../src/react/index.js";
import "../../src/styles.css";
import { graph, layout as initialLayout } from "../fixtures.js";

function Fixture() {
  const canvas = useRef<SchemaCanvasHandle>(null);
  const [visible, setVisible] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const failSave = useRef(
    new URLSearchParams(location.search).has("saveFailure"),
  );
  const saveDelay = Number(
    new URLSearchParams(location.search).get("saveDelay") ?? 0,
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!canvas.current?.getSaveState().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const [writable, setWritable] = useState(false);
  const [layout, setLayout] = useState<SchemaLayout>(initialLayout);
  const [annotations, setAnnotations] = useState<SchemaAnnotation[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  return (
    <main style={{ height: "100vh" }}>
      <button
        type="button"
        onClick={async () => {
          try {
            await canvas.current?.flushSaves();
            setVisible(false);
            setError("");
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
      >
        Leave editor
      </button>
      <output data-testid="dirty">{String(dirty)}</output>
      <output data-testid="save-error">{error}</output>
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
      {visible ? (
        <SchemaCanvas
          ref={canvas}
          onSaveStateChange={(state) => setDirty(state.dirty)}
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
            if (saveDelay)
              await new Promise((resolve) => setTimeout(resolve, saveDelay));
            if (failSave.current) {
              failSave.current = false;
              throw new Error("Save unavailable");
            }
            setAnnotations(value);
            return { value, revision: crypto.randomUUID() };
          }}
        />
      ) : (
        <p>Editor closed</p>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
