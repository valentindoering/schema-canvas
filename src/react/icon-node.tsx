import {
  InputRule,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";

import {
  isSchemaIconColorName,
  isSchemaIconName,
  schemaIconToken,
  schemaIconTokenAtStart,
} from "../core/index.js";
import { SchemaIcon } from "./icons.js";

function IconView({ node }: ReactNodeViewProps) {
  const name = node.attrs.name as string;
  const color = (node.attrs.color as string | null) ?? undefined;
  return (
    <NodeViewWrapper as="span" className="schema-canvas__icon-node">
      <SchemaIcon name={name} color={color} markUnknownColor />
    </NodeViewWrapper>
  );
}

/**
 * An inline atom for `:icon[name]` and `:icon[name]{color=amber}`. It parses
 * from and serializes back to exactly that token. Typing a complete token
 * (closing `]`) turns it into the node.
 */
export const SchemaIconNode = Node.create({
  name: "schemaIcon",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: { default: null },
      color: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-schema-icon]",
        getAttrs: (element) => {
          const name = element.getAttribute("data-schema-icon");
          const color = element.getAttribute("data-schema-icon-color");
          if (!isSchemaIconName(name)) return false;
          return {
            name,
            color: isSchemaIconColorName(color) ? color : null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const color = node.attrs.color as string | null;
    return [
      "span",
      {
        "data-schema-icon": node.attrs.name as string,
        ...(color ? { "data-schema-icon-color": color } : {}),
      },
      schemaIconToken(node.attrs.name as string, color ?? undefined),
    ];
  },

  renderText({ node }) {
    return schemaIconToken(
      node.attrs.name as string,
      (node.attrs.color as string | null) ?? undefined,
    );
  },

  markdownTokenName: "schemaIcon",
  markdownTokenizer: {
    name: "schemaIcon",
    level: "inline",
    start: (src: string) => src.indexOf(":icon["),
    tokenize: (src: string) => {
      const match = schemaIconTokenAtStart.exec(src);
      if (!match) return undefined;
      return {
        type: "schemaIcon",
        raw: match[0],
        name: match[1],
        color: match[2] ?? null,
      };
    },
  },
  parseMarkdown: (token) => ({
    type: "schemaIcon",
    attrs: { name: token.name as string, color: token.color ?? null },
  }),
  renderMarkdown: (node) =>
    schemaIconToken(
      node.attrs?.name as string,
      (node.attrs?.color as string | null) ?? undefined,
    ),

  addInputRules() {
    return [
      new InputRule({
        find: /:icon\[([a-z0-9]+(?:-[a-z0-9]+)*)\]$/,
        handler: ({ state, range, match }) => {
          const name = match[1];
          if (!isSchemaIconName(name)) return null;
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ name, color: null }),
          );
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(IconView, { as: "span" });
  },
});
