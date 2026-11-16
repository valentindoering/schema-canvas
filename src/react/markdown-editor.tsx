import type { EditorView } from "@tiptap/pm/view";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { MarkdownEditorProps } from "./markdown-field.js";

/**
 * Inside a list, Tab and Shift+Tab nest and un-nest the item like a normal
 * editor and never move focus out. On the first item, which cannot be nested,
 * Tab does nothing. Outside lists, Tab keeps moving focus (no keyboard trap).
 *
 * This runs as a view prop, before every plugin keymap, and stops the event so
 * host focus traps (dialogs, sheets, focus scopes) cannot move focus either.
 */
export function handleListTab(view: EditorView, event: KeyboardEvent) {
  if (
    event.key !== "Tab" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing
  )
    return false;
  const { state } = view;
  const listItem = state.schema.nodes.listItem;
  if (!listItem) return false;
  const { $from } = state.selection;
  let items = 0;
  for (let depth = $from.depth; depth > 0; depth--)
    if ($from.node(depth).type === listItem) items++;
  if (!items) return false;
  event.preventDefault();
  event.stopPropagation();
  if (!event.shiftKey) sinkListItem(listItem)(state, view.dispatch);
  // A top-level item stays a list item; Backspace removes its bullet.
  else if (items > 1) liftListItem(listItem)(state, view.dispatch);
  return true;
}

const listLine = /^(\s*)([-*+]|\d+[.)])(\s|$)/;

/**
 * The same keys in Markdown source: on list lines, Tab nests by two spaces and
 * Shift+Tab un-nests. Other lines keep Tab for focus movement.
 */
export function handleSourceTab(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  onChange: (markdown: string) => void,
) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
    return;
  const field = event.currentTarget;
  const { value, selectionStart, selectionEnd } = field;
  const first = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const endBreak = value.indexOf(
    "\n",
    Math.max(selectionStart, selectionEnd - 1),
  );
  const last = endBreak === -1 ? value.length : endBreak;
  const lines = value.slice(first, last).split("\n");
  if (!lines.some((line) => listLine.test(line))) return;
  event.preventDefault();
  event.stopPropagation();
  let delta = 0;
  let firstDelta = 0;
  const next = lines.map((line, index) => {
    if (!listLine.test(line)) return line;
    const change = event.shiftKey
      ? -Math.min(2, line.length - line.trimStart().length)
      : 2;
    if (index === 0) firstDelta = change;
    delta += change;
    return change >= 0
      ? `${"  ".repeat(change / 2)}${line}`
      : line.slice(-change);
  });
  if (!delta) return;
  const markdown = value.slice(0, first) + next.join("\n") + value.slice(last);
  onChange(markdown);
  requestAnimationFrame(() => {
    field.selectionStart = Math.max(first, selectionStart + firstDelta);
    field.selectionEnd = Math.max(first, selectionEnd + delta);
  });
}

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
      handleKeyDown: handleListTab,
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
      onKeyDown={(event) => handleSourceTab(event, onChange)}
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
