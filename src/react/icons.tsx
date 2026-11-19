import { createContext, useContext, useMemo, type ReactNode } from "react";

import { schemaIconToken, splitSchemaIconTokens } from "../core/index.js";

/** Host-supplied icons. The package itself ships no icon library. */
export type SchemaCanvasIconProps = {
  /** Render one icon by name, or null when the host does not know it. */
  renderIcon?: (name: string) => ReactNode | null;
  /** Every name the host can render: offered by the pickers and used to flag unknown names. */
  iconNames?: readonly string[];
  /** Palette name → CSS colour value, e.g. `{ amber: "var(--amber-600)" }`. */
  iconColors?: Readonly<Record<string, string>>;
};

type IconSupport = {
  renderIcon?: (name: string) => ReactNode | null;
  iconNames?: readonly string[];
  known?: ReadonlySet<string>;
  iconColors: Readonly<Record<string, string>>;
  unknownIcon: string;
  unknownIconColor: string;
};

const IconContext = createContext<IconSupport>({
  iconColors: {},
  unknownIcon: "Unknown icon",
  unknownIconColor: "Unknown icon color",
});

export function SchemaIconProvider({
  renderIcon,
  iconNames,
  iconColors,
  unknownIcon,
  unknownIconColor,
  children,
}: SchemaCanvasIconProps & {
  unknownIcon: string;
  unknownIconColor: string;
  children: ReactNode;
}) {
  const value = useMemo<IconSupport>(
    () => ({
      ...(renderIcon ? { renderIcon } : {}),
      ...(iconNames ? { iconNames, known: new Set(iconNames) } : {}),
      iconColors: iconColors ?? {},
      unknownIcon,
      unknownIconColor,
    }),
    [renderIcon, iconNames, iconColors, unknownIcon, unknownIconColor],
  );
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

export function useSchemaIcons() {
  return useContext(IconContext);
}

/** True when the host can render icons at all. */
export function useIconsSupported() {
  return useContext(IconContext).renderIcon !== undefined;
}

/**
 * One icon. Without host icons the token text shows. A name the host does not
 * know shows as its marked token text, never silently dropped. An unknown
 * colour falls back to the text colour; `markUnknownColor` (the editor) marks it.
 */
export function SchemaIcon({
  name,
  color,
  className,
  markUnknownColor = false,
}: {
  name: string;
  color?: string | null | undefined;
  className?: string;
  markUnknownColor?: boolean;
}) {
  const support = useSchemaIcons();
  const token = schemaIconToken(name, color ?? undefined);
  if (!support.renderIcon)
    return <span className="schema-canvas__icon-token">{token}</span>;
  const rendered =
    !support.known || support.known.has(name) ? support.renderIcon(name) : null;
  if (rendered === null || rendered === undefined)
    return (
      <code
        className="schema-canvas__icon-unknown"
        title={`${support.unknownIcon}: ${name}`}
        data-icon={name}
      >
        {token}
      </code>
    );
  const value = color ? support.iconColors[color] : undefined;
  const unknownColor = Boolean(color) && value === undefined;
  return (
    <span
      className={`schema-canvas__icon${className ? ` ${className}` : ""}${
        unknownColor && markUnknownColor
          ? " schema-canvas__icon--unknown-color"
          : ""
      }`}
      role="img"
      aria-label={name}
      title={
        unknownColor && markUnknownColor
          ? `${name} (${support.unknownIconColor}: ${color})`
          : name
      }
      data-icon={name}
      {...(color ? { "data-icon-color": color } : {})}
      {...(value ? { style: { color: value } } : {})}
    >
      {rendered}
    </span>
  );
}

/** Plain text with inline icon tokens rendered as icons. */
export function IconText({ text }: { text: string }) {
  const parts = splitSchemaIconTokens(text);
  if (parts.length === 1 && parts[0]!.kind === "text") return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          part.text
        ) : (
          <SchemaIcon key={index} name={part.name} color={part.color} />
        ),
      )}
    </>
  );
}

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
};

/**
 * Remark plugin: turns `:icon[name]` tokens in text into `<span>` elements the
 * Markdown renderer maps to icons. Code spans and blocks keep the token text.
 */
export function remarkSchemaIcons() {
  const visit = (node: MdastNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): MdastNode[] => {
      if (child.type !== "text" || !child.value?.includes(":icon[")) {
        visit(child);
        return [child];
      }
      return splitSchemaIconTokens(child.value).map((part) =>
        part.kind === "text"
          ? { type: "text", value: part.text }
          : {
              type: "schemaIcon",
              children: [],
              data: {
                hName: "span",
                hProperties: {
                  dataSchemaIcon: part.name,
                  ...(part.color ? { dataSchemaIconColor: part.color } : {}),
                },
              },
            },
      );
    });
  };
  return (tree: MdastNode) => visit(tree);
}
