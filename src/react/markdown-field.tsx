import { Component, Suspense, lazy, type ReactNode } from "react";

import type { SchemaCanvasLabels } from "./types.js";

const MarkdownEditor = lazy(() => import("./markdown-editor.js"));

export type MarkdownEditorProps = {
  label: string;
  value: string;
  labels: SchemaCanvasLabels;
  onChange: (markdown: string) => void;
};

export function MarkdownField(props: MarkdownEditorProps) {
  return (
    <EditorBoundary
      fallback={
        <div className="schema-canvas__form-field">
          <p role="alert">{props.labels.editorLoadFailed}</p>
          <label>
            <span>{props.label}</span>
            <textarea
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
            />
          </label>
        </div>
      }
    >
      <Suspense fallback={<p role="status">{props.labels.editorLoading}</p>}>
        <MarkdownEditor {...props} />
      </Suspense>
    </EditorBoundary>
  );
}

class EditorBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
  },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
