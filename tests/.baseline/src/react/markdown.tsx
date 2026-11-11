import ReactMarkdown from "react-markdown";

export function CanvasMarkdown({ source }: { source: string }) {
  return (
    <div className="schema-canvas__markdown">
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
