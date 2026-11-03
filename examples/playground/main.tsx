import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  canvasDigest,
  canonicalCanvasJson,
  createCanvasReviewService,
  parseCanvasReviewState,
  parseSchemaAnnotations,
  type CanvasReviewState,
  serializeSchemaAnnotations,
  type SchemaAnnotation,
  type SchemaLayout,
} from "../../src/core/index.js";
import { SchemaCanvas, type SchemaCanvasTheme } from "../../src/react/index.js";
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
import {
  createPlaygroundReviewStore,
  reviewKey as smallReviewKey,
} from "./review-store.js";
import { largeDocument, largeSourceFileForTable } from "./large-schema.js";

const isLarge = new URLSearchParams(location.search).get("example") === "large";
const storagePrefix = isLarge
  ? "schema-canvas-large-example"
  : "schema-canvas-example";
const reviewKey = isLarge ? `${storagePrefix}-review` : smallReviewKey;
const layoutKey = `${storagePrefix}-layout`;
const annotationsKey = `${storagePrefix}-annotations`;
const assetsKey = `${storagePrefix}-assets`;
const seed = isLarge
  ? largeDocument
  : {
      graph,
      layout: initialLayout,
      annotations: parseSchemaAnnotations(initialAnnotations(routeCardUrl)),
      views,
    };
const themeKey = "schema-canvas-example-theme";

function Playground() {
  const [canvasKey, setCanvasKey] = useState(0);
  const [theme, setTheme] = useState<SchemaCanvasTheme>(() =>
    localStorage.getItem(themeKey) === "dark" ? "dark" : "light",
  );
  const [reviewState, setReviewState] = useState<CanvasReviewState>(() => {
    const saved = localStorage.getItem(reviewKey);
    return saved
      ? parseCanvasReviewState(JSON.parse(saved))
      : {
          version: 1,
          document: {
            ...seed,
            layout: readStored<SchemaLayout>(layoutKey, seed.layout),
            annotations: readStoredAnnotations(seed.annotations),
          },
          proposals: [],
        };
  });
  const [revision, setRevision] = useState("");
  const [demoError, setDemoError] = useState("");
  const [proposing, setProposing] = useState(false);
  const [store] = useState(() =>
    createPlaygroundReviewStore(
      reviewState,
      (next) => {
        // Opening a review only changes its receipt. Keep controlled document
        // references stable so that this cannot replace an in-progress canvas edit.
        setReviewState((current) =>
          canonicalCanvasJson(current.document) ===
          canonicalCanvasJson(next.document)
            ? { ...next, document: current.document }
            : next,
        );
        // Compatibility mirrors for the existing playground example; the review
        // envelope is the single authority for document + proposal transactions.
        localStorage.setItem(layoutKey, JSON.stringify(next.document.layout));
        localStorage.setItem(
          annotationsKey,
          JSON.stringify(
            serializeSchemaAnnotations(next.document.annotations, "array"),
          ),
        );
      },
      reviewKey,
    ),
  );
  const reviewService = useMemo(
    () =>
      createCanvasReviewService({
        store,
        // This local demonstration has no real identity boundary. A production host
        // authenticates its human-only endpoint on the server instead.
        authorizeReview(session: string) {
          if (session !== "demo-human-session")
            throw new Error("Human session required.");
          return { reviewerId: "playground reviewer" };
        },
        contextOptions: { automaticMuteDistance: 650 },
      }),
    [store],
  );
  useEffect(() => {
    let cancelled = false;
    void canvasDigest(reviewState.document).then((value) => {
      if (!cancelled) setRevision(value);
    });
    return () => {
      cancelled = true;
    };
  }, [reviewState.document]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === reviewKey && event.newValue) {
        try {
          const next = parseCanvasReviewState(JSON.parse(event.newValue));
          setReviewState((current) =>
            canonicalCanvasJson(current.document) ===
            canonicalCanvasJson(next.document)
              ? { ...next, document: current.document }
              : next,
          );
        } catch (cause) {
          setDemoError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);
  const suggestExample = async () => {
    setProposing(true);
    setDemoError("");
    try {
      const agent = reviewService.agent("example assistant");
      const alternate = reviewState.proposals.length % 2 === 1;
      const context = await agent.getContext(
        alternate
          ? { table: "airships", hops: 0 }
          : { tableIds: ["voyages", "cargo_crates"] },
      );
      if (alternate) {
        await agent.propose({
          baseRevision: context.revision,
          title: "Emphasize the airship table",
          reason: "Mark the fleet identity table for quick reference.",
          operations: [
            {
              op: "set_table_appearance",
              tableId: "airships",
              appearance:
                context.tables[0]!.appearance === "blue"
                  ? "highlighted"
                  : "blue",
            },
          ],
        });
      } else {
        const cargo = context.tables.find(
          (table) => table.table.id === "cargo_crates",
        )?.bounds;
        if (!cargo)
          throw new Error(
            "Position Cargo crates before trying this suggestion.",
          );
        const firstSmall = !isLarge && reviewState.proposals.length === 0;
        await agent.propose({
          baseRevision: context.revision,
          title: "Explain the voyage boundary",
          reason:
            "Document the relationship between voyage planning and its independent crew and cargo assignments.",
          operations: [
            {
              op: "set_table_markdown",
              tableId: "voyages",
              markdown:
                "## Voyage planning\n\nA voyage chooses an airship, two ports, and a captain. Crew assignments and cargo remain separate records so they can change independently.",
            },
            {
              op: "move_table",
              tableId: "cargo_crates",
              x: firstSmall ? 1240 : cargo.x + 60,
              y: firstSmall ? 220 : cargo.y + 40,
            },
          ],
        });
      }
    } catch (cause) {
      setDemoError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProposing(false);
    }
  };
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
    const resetState: CanvasReviewState = {
      version: 1,
      document: structuredClone(seed),
      proposals: [],
    };
    localStorage.setItem(reviewKey, JSON.stringify(resetState));
    setReviewState(resetState);
    setDemoError("");
    setAssets({});
    setCanvasKey((value) => value + 1);
  }, []);

  const canvasStyle = useMemo(() => ({ height: "100%" }), []);

  return (
    <main className={`playground playground--${theme}`}>
      <h1 className="playground__title">Schema Canvas playground</h1>
      <div className="playground__examples">
        <label>
          <span>Example</span>
          <select
            aria-label="Example"
            value={isLarge ? "large" : "small"}
            onChange={(event) => {
              const url = new URL(location.href);
              if (event.target.value === "large")
                url.searchParams.set("example", "large");
              else url.searchParams.delete("example");
              location.assign(url);
            }}
          >
            <option value="small">Small schema</option>
            <option value="large">
              Large system · {largeDocument.graph.tables.length} tables
            </option>
          </select>
        </label>
        <button className="playground__reset" type="button" onClick={reset}>
          Reset example
        </button>
      </div>
      <button
        className="playground__proposal-example"
        type="button"
        disabled={proposing}
        onClick={() => void suggestExample()}
      >
        Try an AI suggestion
      </button>
      {demoError ? (
        <p className="playground__error" role="alert">
          {demoError}
        </p>
      ) : null}
      <section className="playground__canvas" aria-label="Interactive example">
        <SchemaCanvas
          key={canvasKey}
          graph={reviewState.document.graph}
          layout={reviewState.document.layout}
          annotations={reviewState.document.annotations}
          {...(reviewState.document.views
            ? { views: reviewState.document.views }
            : {})}
          writable
          theme={theme}
          onThemeChange={(nextTheme) => {
            setTheme(nextTheme);
            localStorage.setItem(themeKey, nextTheme);
          }}
          style={canvasStyle}
          conciseFieldCount={5}
          automaticMuteDistance={650}
          resolveImage={resolveImage}
          onUploadImage={uploadImage}
          onLoadTableDefinition={(table) => {
            const file = isLarge
              ? largeSourceFileForTable(table.id)
              : sourceFileForTable(table.id);
            if (!file) throw new Error(`No source file for ${table.id}.`);
            return { path: file.path, source: file.source };
          }}
          proposalReview={{
            revision,
            proposals: reviewState.proposals,
            onOpenReview: (id) =>
              reviewService.openReview(id, "demo-human-session"),
            onAccept: async (input) => {
              await reviewService.accept(input, "demo-human-session");
            },
            onReject: async (input) => {
              await reviewService.reject(input, "demo-human-session");
            },
          }}
          onSaveLayout={async ({ value }) =>
            store.transact(async (state) => {
              state.document.layout = value;
              return {
                state,
                result: { value, revision: await canvasDigest(state.document) },
              };
            })
          }
          onSaveAnnotations={async ({ value }) =>
            store.transact(async (state) => {
              const normalized = parseSchemaAnnotations(value);
              state.document.annotations = normalized;
              return {
                state,
                result: {
                  value: normalized,
                  revision: await canvasDigest(state.document),
                },
              };
            })
          }
        />
      </section>
    </main>
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

function readStoredAnnotations(fallback: SchemaAnnotation[]) {
  const stored = localStorage.getItem(annotationsKey);
  if (!stored) return parseSchemaAnnotations(fallback);
  try {
    const candidate: unknown = JSON.parse(stored);
    const annotations = parseSchemaAnnotations(candidate);
    const canonical = serializeSchemaAnnotations(annotations, "array");
    if (JSON.stringify(candidate) !== JSON.stringify(canonical)) {
      localStorage.setItem(annotationsKey, JSON.stringify(canonical));
    }
    return annotations;
  } catch (cause) {
    throw new Error("Could not load saved playground annotations.", { cause });
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
