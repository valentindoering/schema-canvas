import ReactMarkdown from "react-markdown";

import { remarkSchemaIcons, SchemaIcon } from "./icons.js";

const remarkPlugins = [remarkSchemaIcons];

export function CanvasMarkdown({ source }: { source: string }) {
  return (
    <div className="schema-canvas__markdown">
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        remarkPlugins={remarkPlugins}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Spans come only from remarkSchemaIcons: raw HTML is skipped.
          span: ({ node, children }) => {
            const name = node?.properties?.dataSchemaIcon;
            const color = node?.properties?.dataSchemaIconColor;
            return typeof name === "string" ? (
              <SchemaIcon
                name={name}
                color={typeof color === "string" ? color : undefined}
              />
            ) : (
              <span>{children}</span>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
