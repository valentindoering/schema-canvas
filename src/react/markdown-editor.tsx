import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  Extension,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { MarkdownEditorProps } from "./markdown-field.js";

/**
 * Inside a list, Tab and Shift+Tab indent and outdent the item like a normal
 * editor and never move focus out. On the first item, which cannot be indented,
 * Tab does nothing. Outside lists, Tab keeps moving focus (no keyboard trap).
 */
const ListIndentation = Extension.create({
  name: "schemaCanvasListIndentation",
  priority: 1000,
  addKeyboardShortcuts() {
    const inList = () =>
      this.editor.isActive("bulletList") || this.editor.isActive("orderedList");
    return {
      Tab: () => {
        if (!inList()) return false;
        this.editor.commands.sinkListItem("listItem");
        return true;
      },
      "Shift-Tab": () => {
        if (!inList()) return false;
        const { $from } = this.editor.state.selection;
        let items = 0;
        for (let depth = $from.depth; depth > 0; depth--)
          if ($from.node(depth).type.name === "listItem") items++;
        // A top-level item stays a list item; Backspace removes its bullet.
        if (items > 1) this.editor.commands.liftListItem("listItem");
        return true;
      },
    };
  },
});

export default function MarkdownEditor({
  label,
  value,
  labels,
  onChange,
}: MarkdownEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const rawValue = useRef(value);
  const fieldId = useId();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        underline: false,
        strike: false,
        trailingNode: false,
        link: { openOnClick: false, autolink: false },
      }),
      Markdown,
      ListIndentation,
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: "schema-canvas__markdown schema-canvas__rich-text",
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      const markdown = editor.getMarkdown();
      rawValue.current = markdown;
      onChange(markdown);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      code: editor?.isActive("code") ?? false,
      link: editor?.isActive("link") ?? false,
      heading: editor?.getAttributes("heading").level as number | undefined,
    }),
  });

  useEffect(() => {
    if (!editor || rawValue.current === value) return;
    rawValue.current = value;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);
  useEffect(() => {
    if (!expanded) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [expanded]);

  // Preserve constructs outside this editor's schema in source form instead of
  // silently discarding them during a rich-text edit. Code tokens aren't HTML.
  const unsupported = useMemo(() => {
    if (!editor?.markdown) return false;
    let found = false;
    const tokens = editor.markdown.instance.lexer(value);
    editor.markdown.instance.walkTokens(tokens, (token) => {
      if (
        ["html", "image", "table", "del"].includes(token.type) ||
        (token.type === "list_item" && token.task)
      )
        found = true;
    });
    return found;
  }, [editor, value]);
  useEffect(() => {
    if (unsupported) setSourceMode(true);
  }, [unsupported]);
  const source = sourceMode || unsupported;
  const collapse = () => {
    setExpanded(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  };
  const sourceField = (
    <textarea
      id={fieldId}
      aria-label={label}
      className="schema-canvas__markdown-source"
      value={value}
      onChange={(event) => {
        const markdown = event.target.value;
        onChange(markdown);
      }}
    />
  );
  const body = (
    <>
      <div className="schema-canvas__markdown-header">
        <span>{label}</span>
        <div>
          <button
            type="button"
            aria-label={labels.markdownSource}
            aria-pressed={source}
            disabled={unsupported}
            onClick={() => {
              setSourceMode((current) => !current);
              setLinkOpen(false);
            }}
          >
            {source ? labels.writeFormatted : labels.source}
          </button>
          <button
            ref={expandButton}
            type="button"
            aria-label={expanded ? labels.collapseEditor : labels.expandEditor}
            onClick={expanded ? collapse : () => setExpanded(true)}
          >
            {expanded ? labels.doneEditing : labels.expand}
          </button>
        </div>
      </div>
      {unsupported ? (
        <p className="schema-canvas__markdown-notice">
          {labels.markdownSourceOnly}
        </p>
      ) : null}
      {source ? (
        sourceField
      ) : (
        <>
          <div
            className="schema-canvas__format-toolbar"
            role="toolbar"
            aria-label={labels.formatting}
          >
            <select
              aria-label={labels.textStyle}
              value={state?.heading ?? "paragraph"}
              onChange={(event) => {
                if (event.target.value === "paragraph")
                  editor?.chain().focus().setParagraph().run();
                else
                  editor
                    ?.chain()
                    .focus()
                    .setHeading({
                      level: Number(event.target.value) as
                        1 | 2 | 3 | 4 | 5 | 6,
                    })
                    .run();
              }}
            >
              <option value="paragraph">{labels.paragraph}</option>
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  {labels.heading} {level}
                </option>
              ))}
            </select>
            {[
              {
                label: labels.bold,
                active: state?.bold,
                content: <b>B</b>,
                run: () => editor?.chain().focus().toggleBold().run(),
              },
              {
                label: labels.italic,
                active: state?.italic,
                content: <i>I</i>,
                run: () => editor?.chain().focus().toggleItalic().run(),
              },
              {
                label: labels.bulletList,
                active: state?.bulletList,
                content: labels.list,
                run: () => editor?.chain().focus().toggleBulletList().run(),
              },
              {
                label: labels.orderedList,
                active: state?.orderedList,
                content: "1.",
                run: () => editor?.chain().focus().toggleOrderedList().run(),
              },
              {
                label: labels.inlineCode,
                active: state?.code,
                content: "</>",
                run: () => editor?.chain().focus().toggleCode().run(),
              },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                aria-label={action.label}
                title={action.label}
                aria-pressed={action.active ?? false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={action.run}
              >
                {action.content}
              </button>
            ))}
            <button
              type="button"
              aria-label={labels.link}
              aria-pressed={state?.link ?? false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setLinkUrl(editor?.getAttributes("link").href ?? "");
                setLinkError(false);
                setLinkOpen((current) => !current);
              }}
            >
              {labels.link}
            </button>
          </div>
          {linkOpen ? (
            <form
              className="schema-canvas__link-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const url = linkUrl.trim();
                if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) {
                  setLinkError(true);
                  return;
                }
                editor
                  ?.chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
                setLinkOpen(false);
              }}
            >
              <input
                autoFocus
                aria-label={labels.linkUrl}
                value={linkUrl}
                placeholder="https://"
                aria-invalid={linkError}
                onChange={(event) => {
                  setLinkUrl(event.target.value);
                  setLinkError(false);
                }}
              />
              <button type="submit">{labels.applyLink}</button>
              <button
                type="button"
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setLinkOpen(false);
                }}
              >
                {labels.removeLink}
              </button>
              {linkError ? (
                <span role="alert">{labels.invalidLink}</span>
              ) : null}
            </form>
          ) : null}
          <EditorContent editor={editor} />
        </>
      )}
    </>
  );
  return (
    <div className="schema-canvas__markdown-field">
      {expanded ? (
        <dialog
          ref={dialog}
          className="schema-canvas__markdown-dialog"
          aria-label={label}
          onCancel={(event) => {
            event.preventDefault();
            collapse();
          }}
        >
          {body}
        </dialog>
      ) : (
        body
      )}
    </div>
  );
}
