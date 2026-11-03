import { useEffect, useRef, useState } from "react";
import {
  canvasContextMarkdown,
  canvasContextSvg,
  type CanvasContext,
  type CanvasContextQuery,
} from "../core/index.js";
import type { SchemaCanvasLabels } from "./types.js";

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CanvasContextPanel({
  readContext,
  query,
  labels,
  onClose,
}: {
  readContext: (query: CanvasContextQuery) => Promise<CanvasContext>;
  query: CanvasContextQuery;
  labels: SchemaCanvasLabels;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<CanvasContext>();
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void readContext(query).then(
      (value) => {
        if (!cancelled) setContext(value);
      },
      (cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [readContext, query]);
  const markdown = context ? canvasContextMarkdown(context) : "";
  const svg = context ? canvasContextSvg(context) : "";
  return (
    <dialog
      ref={dialog}
      className="schema-canvas__context-dialog"
      aria-label={labels.aiContext}
      onCancel={onClose}
    >
      <header>
        <strong>{labels.aiContext}</strong>
        <button
          type="button"
          aria-label={labels.closeContext}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : context ? (
        <>
          <p>{labels.contextExplanation}</p>
          <div className="schema-canvas__context-downloads">
            <button
              type="button"
              onClick={() =>
                download(
                  `canvas-${context.snapshotId.slice(0, 12)}.md`,
                  "text/markdown",
                  markdown,
                )
              }
            >
              {labels.downloadMarkdown}
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  `canvas-${context.snapshotId.slice(0, 12)}.json`,
                  "application/json",
                  JSON.stringify(context, null, 2),
                )
              }
            >
              {labels.downloadJson}
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  `canvas-${context.snapshotId.slice(0, 12)}.svg`,
                  "image/svg+xml",
                  svg,
                )
              }
            >
              {labels.downloadDiagram}
            </button>
          </div>
          <details>
            <summary>{labels.contextDiagram}</summary>
            <img
              alt={labels.contextDiagram}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            />
          </details>
          <pre aria-label={labels.contextText}>{markdown}</pre>
        </>
      ) : (
        <p role="status">{labels.loadingContext}</p>
      )}
    </dialog>
  );
}
