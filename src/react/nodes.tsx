import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import type { SchemaPortSide } from "../core/index.js";
import {
  handleId,
  visibleFields,
  type AnnotationNodeData,
  type TableNodeData,
} from "./model.js";

type TableNode = Node<TableNodeData, "schemaTable">;
type AnnotationNode = Node<AnnotationNodeData, "schemaAnnotation">;

export function SchemaTableNode({ data, selected }: NodeProps<TableNode>) {
  const fields = visibleFields(data);
  const canExpand =
    data.fieldDisplay === "concise" && data.table.fields.length > fields.length;
  return (
    <article
      className={`schema-canvas__table-card schema-canvas__table-card--${data.appearance}${selected ? " schema-canvas__table-card--selected" : ""}`}
      aria-label={data.table.label}
    >
      <PortHandles writable={data.writable} />
      <header className="schema-canvas__table-header">
        <strong>{data.table.label}</strong>
        {data.unpositioned ? (
          <span className="schema-canvas__new-table-dot" aria-hidden="true" />
        ) : null}
      </header>
      <ul className="schema-canvas__fields">
        {fields.map((field) => (
          <li
            key={field.name}
            className={
              data.highlightedFields.includes(field.name)
                ? "schema-canvas__field schema-canvas__field--highlighted"
                : field.foreignKeyTargets.length
                  ? "schema-canvas__field schema-canvas__field--foreign-key"
                  : "schema-canvas__field"
            }
          >
            <span>
              {field.name}
              {field.optional ? "?" : ""}
            </span>
            {field.foreignKeyTargets.length ? (
              <code className="schema-canvas__foreign-key-pill">
                {field.arrowsDisabled ? "FK off" : "FK"} →{` `}
                {field.foreignKeyTargets.join(", ")}
              </code>
            ) : (
              <code>{field.type}</code>
            )}
          </li>
        ))}
      </ul>
      {data.fieldDisplay === "concise" && (canExpand || data.expanded) ? (
        <button
          type="button"
          className="schema-canvas__show-more nodrag"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleExpanded(data.table.id);
          }}
        >
          {data.expanded ? data.showLessLabel : data.showMoreLabel}
        </button>
      ) : null}
    </article>
  );
}

export function SchemaAnnotationNode({
  data,
  selected,
}: NodeProps<AnnotationNode>) {
  const { annotation } = data;
  return (
    <article
      className={`schema-canvas__annotation-card schema-canvas__annotation-card--${annotation.kind} schema-canvas__annotation-card--${annotation.color}`}
      style={
        annotation.kind === "text" && annotation.fontSize
          ? { fontSize: annotation.fontSize }
          : undefined
      }
      aria-label={annotation.label}
    >
      <NodeResizer
        isVisible={selected && data.writable}
        minWidth={120}
        minHeight={80}
        color="var(--schema-canvas-accent)"
        onResizeEnd={(_event, bounds) =>
          data.onResizeEnd(annotation.id, bounds)
        }
      />
      {annotation.kind === "image" && annotation.src ? (
        <img src={annotation.src} alt={annotation.label} draggable={false} />
      ) : null}
      {annotation.kind === "note" ? <strong>{annotation.label}</strong> : null}
      {annotation.kind === "frame" ? (
        <span className="schema-canvas__annotation-label">
          {annotation.label}
        </span>
      ) : null}
      {annotation.text ? <p>{annotation.text}</p> : null}
      {annotation.kind === "image" ? (
        <span className="schema-canvas__annotation-caption">
          {annotation.label}
        </span>
      ) : null}
    </article>
  );
}

function PortHandles({ writable }: { writable: boolean }) {
  return (
    <>
      {portSides.map(({ side, position, style }) => (
        <Handle
          key={`source-${side}`}
          id={handleId("source", side)}
          type="source"
          position={position}
          style={style}
          className="schema-canvas__handle"
          isConnectable={writable}
        />
      ))}
      {portSides.map(({ side, position, style }) => (
        <Handle
          key={`target-${side}`}
          id={handleId("target", side)}
          type="target"
          position={position}
          style={style}
          className="schema-canvas__handle"
          isConnectable={writable}
        />
      ))}
    </>
  );
}

const portSides: Array<{
  side: SchemaPortSide;
  position: Position;
  style?: React.CSSProperties;
}> = [
  { side: "top", position: Position.Top, style: { left: "50%" } },
  { side: "top-left", position: Position.Top, style: { left: "20%" } },
  { side: "top-right", position: Position.Top, style: { left: "80%" } },
  { side: "right", position: Position.Right, style: { top: "50%" } },
  { side: "bottom", position: Position.Bottom, style: { left: "50%" } },
  { side: "bottom-left", position: Position.Bottom, style: { left: "20%" } },
  { side: "bottom-right", position: Position.Bottom, style: { left: "80%" } },
  { side: "left", position: Position.Left, style: { top: "50%" } },
];
