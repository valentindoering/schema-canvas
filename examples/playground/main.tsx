import { StrictMode, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  SchemaAnnotation,
  SchemaLayout,
  SchemaTable,
} from "../../src/core/index.js";
import { SchemaCanvas } from "../../src/react/index.js";
import "../../src/styles.css";
import "./example.css";
import {
  graph,
  initialAnnotations,
  initialLayout,
  views,
} from "./fictional-schema.js";
import { sourceFileForTable } from "./fictional-source.js";
import routeCardUrl from "./route-card.svg?url";

const layoutKey = "schema-canvas-example-layout";
const annotationsKey = "schema-canvas-example-annotations";
const assetsKey = "schema-canvas-example-assets";

function Playground() {
  const [canvasKey, setCanvasKey] = useState(0);
  const [layout, setLayout] = useState<SchemaLayout>(() =>
    readStored(layoutKey, initialLayout),
  );
  const [annotations, setAnnotations] = useState<SchemaAnnotation[]>(() =>
    readStored(annotationsKey, initialAnnotations(routeCardUrl)),
  );
  const [assets, setAssets] = useState<Record<string, string>>(() =>
    readStored(assetsKey, {}),
  );

  const resolveImage = useCallback(
    (asset: string) =>
      asset === "demo/route-card.svg" ? routeCardUrl : assets[asset],
    [assets],
  );

  const uploadImage = useCallback(async (file: File) => {
    if (file.size > 1_500_000) {
      throw new Error("Choose an image smaller than 1.5 MB for this demo.");
    }
    const src = await readFile(file);
    const asset = `local/${crypto.randomUUID()}-${safeName(file.name)}`;
    setAssets((current) => {
      const next = { ...current, [asset]: src };
      localStorage.setItem(assetsKey, JSON.stringify(next));
      return next;
    });
    return { asset, src };
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(layoutKey);
    localStorage.removeItem(annotationsKey);
    localStorage.removeItem(assetsKey);
    setLayout(initialLayout);
    setAnnotations(initialAnnotations(routeCardUrl));
    setAssets({});
    setCanvasKey((value) => value + 1);
  }, []);

  const canvasStyle = useMemo(() => ({ height: "100%" }), []);

  return (
    <main className="playground">
      <h1 className="playground__title">Schema Canvas playground</h1>
      <button className="playground__reset" type="button" onClick={reset}>
        Reset example
      </button>
      <section className="playground__canvas" aria-label="Interactive example">
        <SchemaCanvas
          key={canvasKey}
          graph={graph}
          layout={layout}
          annotations={annotations}
          views={views}
          writable
          style={canvasStyle}
          conciseFieldCount={5}
          resolveImage={resolveImage}
          onUploadImage={uploadImage}
          renderTableDetails={(table) => <TableSourcePreview table={table} />}
          onSaveLayout={async ({ value }) => {
            setLayout(value);
            localStorage.setItem(layoutKey, JSON.stringify(value));
            return { value, revision: crypto.randomUUID() };
          }}
          onSaveAnnotations={async ({ value }) => {
            setAnnotations(value);
            localStorage.setItem(annotationsKey, JSON.stringify(value));
            return { value, revision: crypto.randomUUID() };
          }}
        />
      </section>
    </main>
  );
}

function TableSourcePreview({ table }: { table: SchemaTable }) {
  const file = sourceFileForTable(table.id);
  if (!file) return null;
  return (
    <section
      className="playground__source-preview"
      aria-label={`${table.label} schema source`}
    >
      <header>
        <div>
          <span>Derived from</span>
          <strong>{file.path}</strong>
        </div>
        <small>Read only</small>
      </header>
      <p>{file.description}</p>
      <pre aria-label={`${file.path} source`}>
        <code>{file.source}</code>
      </pre>
    </section>
  );
}

function readStored<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read the image.")),
    );
    reader.readAsDataURL(file);
  });
}

function safeName(name: string) {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .slice(0, 80);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
