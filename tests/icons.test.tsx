import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canvasContextMarkdown,
  createCanvasReviewService,
  createCanvasReviewState,
  getCanvasContext,
  isSchemaIconName,
  parseCanvasProposalInput,
  parseSchemaLayout,
  previewCanvasProposal,
  rebaseCanvasProposal,
  schemaIconToken,
  schemaIconTokenNames,
  splitSchemaIconTokens,
  type CanvasDocument,
  type CanvasProposalInput,
  type CanvasReviewStore,
} from "../src/core/index.js";
import { SchemaCanvas, SchemaIconProvider } from "../src/react/index.js";
import { SchemaIconNode } from "../src/react/icon-node.js";
import { CanvasMarkdown } from "../src/react/markdown.js";
import { diffProposalWords } from "../src/react/proposal-diff.js";
import { canvasDocument } from "./canvas-fixtures.js";
import { graph, layout } from "./fixtures.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

const iconNames = ["anchor", "compass", "link-2"];
const iconColors = { amber: "rgb(180, 83, 9)", teal: "var(--teal)" };
const renderIcon = (name: string) =>
  iconNames.includes(name) ? <svg data-testid={`icon-${name}`} /> : null;

function withIcons(children: ReactNode) {
  return (
    <SchemaIconProvider
      renderIcon={renderIcon}
      iconNames={iconNames}
      iconColors={iconColors}
      unknownIcon="Unknown icon"
      unknownIconColor="Unknown icon color"
    >
      {children}
    </SchemaIconProvider>
  );
}

describe("icon names and inline tokens", () => {
  it("accepts kebab-case names and splits tokens with and without colour", () => {
    expect(isSchemaIconName("link-2")).toBe(true);
    for (const name of ["Link", "link_2", "-link", "link-", "", "a".repeat(65)])
      expect(isSchemaIconName(name)).toBe(false);
    expect(schemaIconToken("anchor")).toBe(":icon[anchor]");
    expect(schemaIconToken("anchor", "amber")).toBe(
      ":icon[anchor]{color=amber}",
    );
    expect(() => schemaIconToken("anchor", "#b45309")).toThrow("colour");
    expect(
      splitSchemaIconTokens(
        "Dock :icon[anchor]{color=amber}, route :icon[compass] and :icon[Bad]",
      ),
    ).toEqual([
      { kind: "text", text: "Dock " },
      {
        kind: "icon",
        name: "anchor",
        color: "amber",
        token: ":icon[anchor]{color=amber}",
      },
      { kind: "text", text: ", route " },
      { kind: "icon", name: "compass", token: ":icon[compass]" },
      { kind: "text", text: " and :icon[Bad]" },
    ]);
    expect(
      schemaIconTokenNames(":icon[anchor] :icon[compass] :icon[anchor]"),
    ).toEqual(["anchor", "compass"]);
  });

  it("keeps an icon token one word in the review diff", () => {
    const words = diffProposalWords(
      "- a voyage ends in a harbour dock :icon[anchor] for unloading",
      "- a voyage ends in a harbour dock :icon[anchor]{color=amber} for unloading",
    );
    expect(words?.added.filter((part) => part.changed)).toEqual([
      { text: ":icon[anchor]{color=amber}", changed: true },
    ]);
  });
});

describe("table icon layout", () => {
  it("reads and writes icon and iconColor, and rejects CSS values", () => {
    const parsed = parseSchemaLayout(
      {
        ...layout,
        projects: { x: 0, y: 0, icon: "anchor", iconColor: "amber" },
      },
      graph,
    );
    expect(parsed.projects).toEqual({
      x: 0,
      y: 0,
      icon: "anchor",
      iconColor: "amber",
    });
    expect(
      parseSchemaLayout(JSON.parse(JSON.stringify(parsed)), graph),
    ).toEqual(parsed);
    expect(parseSchemaLayout(layout, graph).projects).not.toHaveProperty(
      "icon",
    );
    expect(() =>
      parseSchemaLayout(
        { ...layout, projects: { x: 0, y: 0, icon: "<svg>" } },
        graph,
      ),
    ).toThrow("invalid icon name");
    expect(() =>
      parseSchemaLayout(
        {
          ...layout,
          projects: { x: 0, y: 0, icon: "anchor", iconColor: "#fff" },
        },
        graph,
      ),
    ).toThrow("invalid icon colour");
  });
});

describe("set_table_icon proposals", () => {
  const base = (
    operations: CanvasProposalInput["operations"],
  ): CanvasProposalInput => ({
    baseRevision: "r",
    title: "Icon for projects",
    reason: "Recognize projects at a glance.",
    operations,
  });

  it("validates icon, null and colour", () => {
    expect(() =>
      parseCanvasProposalInput(
        base([{ op: "set_table_icon", tableId: "projects", icon: "anchor" }]),
      ),
    ).not.toThrow();
    expect(() =>
      parseCanvasProposalInput(
        base([
          {
            op: "set_table_icon",
            tableId: "projects",
            icon: "anchor",
            iconColor: "amber",
          },
        ]),
      ),
    ).not.toThrow();
    expect(() =>
      parseCanvasProposalInput({
        ...base([]),
        operations: [{ op: "set_table_icon", tableId: "projects" }],
      }),
    ).toThrow("Table icon");
    expect(() =>
      parseCanvasProposalInput(
        base([
          {
            op: "set_table_icon",
            tableId: "projects",
            icon: null,
            iconColor: "amber",
          },
        ]),
      ),
    ).toThrow("Removing");
    expect(() =>
      parseCanvasProposalInput(
        base([
          {
            op: "set_table_icon",
            tableId: "projects",
            icon: "anchor",
            iconColor: "var(--x)",
          },
        ]),
      ),
    ).toThrow("colour");
  });

  it("sets the icon with its colour and removes both", () => {
    const set = previewCanvasProposal(
      canvasDocument,
      base([
        {
          op: "set_table_icon",
          tableId: "projects",
          icon: "anchor",
          iconColor: "amber",
        },
      ]),
    );
    expect(set.document.layout.projects).toMatchObject({
      icon: "anchor",
      iconColor: "amber",
    });
    expect(set.changes[0]).toMatchObject({
      operation: "set_table_icon",
      objectId: "projects",
    });
    const recolored = previewCanvasProposal(
      set.document,
      base([{ op: "set_table_icon", tableId: "projects", icon: "anchor" }]),
    );
    expect(recolored.document.layout.projects?.icon).toBe("anchor");
    expect(recolored.document.layout.projects).not.toHaveProperty("iconColor");
    const removed = previewCanvasProposal(
      set.document,
      base([{ op: "set_table_icon", tableId: "projects", icon: null }]),
    );
    expect(removed.document.layout.projects).not.toHaveProperty("icon");
    expect(removed.document.layout.projects).not.toHaveProperty("iconColor");
  });

  it("is stale only when the icon or its colour changed", () => {
    const operations: CanvasProposalInput["operations"] = [
      { op: "set_table_icon", tableId: "projects", icon: "anchor" },
    ];
    const edited = (change: object): CanvasDocument => ({
      ...canvasDocument,
      layout: {
        ...canvasDocument.layout,
        projects: { ...canvasDocument.layout.projects!, ...change },
      },
    });
    expect(
      rebaseCanvasProposal(
        canvasDocument,
        edited({ markdown: "Hand note", x: 200 }),
        operations,
      ).conflicts,
    ).toEqual([]);
    expect(
      rebaseCanvasProposal(
        canvasDocument,
        edited({ icon: "compass" }),
        operations,
      ).conflicts,
    ).toEqual([{ index: 0, objectId: "projects", field: "icon" }]);
    expect(
      rebaseCanvasProposal(
        edited({ icon: "compass" }),
        edited({ icon: "compass", iconColor: "teal" }),
        operations,
      ).conflicts,
    ).toEqual([{ index: 0, objectId: "projects", field: "icon" }]);
  });

  it("is accepted by a human through the review service", async () => {
    let state = await createCanvasReviewState(canvasDocument);
    const store: CanvasReviewStore = {
      read: async () => structuredClone(state),
      async transact(operation) {
        const changed = await operation(structuredClone(state));
        state = changed.state;
        return changed.result;
      },
    };
    const service = createCanvasReviewService({
      store,
      authorizeReview: (context: string) => ({ reviewerId: context }),
    });
    const agent = service.agent("assistant");
    const context = await agent.getContext({ table: "projects", hops: 0 });
    const proposal = await agent
      .propose(
        base([
          {
            op: "set_table_icon",
            tableId: "projects",
            icon: "anchor",
            iconColor: "amber",
          },
        ]),
      )
      .catch(() => null);
    expect(proposal).toBeNull(); // wrong base revision is refused
    const accepted = await agent.propose({
      ...base([
        {
          op: "set_table_icon",
          tableId: "projects",
          icon: "anchor",
          iconColor: "amber",
        },
      ]),
      baseRevision: context.revision,
    });
    const review = await service.openReview(accepted.id, "human");
    expect(review.stale).toBe(false);
    await service.accept(
      { proposalId: accepted.id, reviewToken: review.reviewToken },
      "human",
    );
    const { document } = await service.readDocument();
    expect(document.layout.projects).toMatchObject({
      icon: "anchor",
      iconColor: "amber",
    });
    const after = canvasContextMarkdown(
      await getCanvasContext(document, { table: "projects", hops: 0 }),
    );
    expect(after).toContain("Icon: anchor (color amber).");
    expect(after).toContain(":icon[name]{color=amber}");
  });
});

describe("rendering icons", () => {
  it("renders inline tokens as host icons with palette colours", () => {
    const html = renderToStaticMarkup(
      withIcons(
        <CanvasMarkdown source="- dock :icon[anchor]{color=amber} :icon[compass] `:icon[anchor]`" />,
      ),
    );
    expect(html).toContain('data-testid="icon-anchor"');
    expect(html).toContain('style="color:rgb(180, 83, 9)"');
    expect(html).toContain('data-testid="icon-compass"');
    expect(html).toContain("<code>:icon[anchor]</code>");
  });

  it("shows an unknown name as marked token text and an unknown colour in the text colour", () => {
    const html = renderToStaticMarkup(
      withIcons(
        <CanvasMarkdown source=":icon[kraken] :icon[anchor]{color=plaid}" />,
      ),
    );
    expect(html).toContain(
      '<code class="schema-canvas__icon-unknown" title="Unknown icon: kraken" data-icon="kraken">:icon[kraken]</code>',
    );
    expect(html).toContain('data-testid="icon-anchor"');
    expect(html).not.toContain("style=");
  });

  it("shows token text without host icons and never renders raw HTML", () => {
    const html = renderToStaticMarkup(
      <CanvasMarkdown source=':icon[anchor] <span data-schema-icon="anchor">x</span>' />,
    );
    expect(html).toContain(
      '<span class="schema-canvas__icon-token">:icon[anchor]</span>',
    );
    expect(html).not.toContain("data-schema-icon");
  });

  it("puts the table icon left of the title, only with host icons", () => {
    const iconLayout = {
      ...layout,
      projects: { ...layout.projects!, icon: "anchor", iconColor: "teal" },
    };
    const { unmount } = render(
      <SchemaCanvas graph={graph} layout={iconLayout} writable={false} />,
    );
    expect(document.querySelector(".schema-canvas__table-icon")).toBeNull();
    unmount();
    render(
      <SchemaCanvas
        graph={graph}
        layout={iconLayout}
        writable={false}
        renderIcon={renderIcon}
        iconNames={iconNames}
        iconColors={iconColors}
      />,
    );
    const icon = document.querySelector(
      '[aria-label="Projects"] .schema-canvas__table-header .schema-canvas__table-icon',
    ) as HTMLElement;
    expect(icon.getAttribute("title")).toBe("anchor");
    expect(icon.style.color).toBe("var(--teal)");
    expect(icon.nextElementSibling?.textContent).toBe("Projects");
  });

  it("lets a human pick, colour and remove the table icon", () => {
    const save = vi.fn(async () => ({}));
    render(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        writable
        initialTableId="projects"
        onSaveLayout={save}
        renderIcon={renderIcon}
        iconNames={iconNames}
        iconColors={iconColors}
      />,
    );
    const header = () =>
      document.querySelector(
        '[aria-label="Projects"] .schema-canvas__table-icon',
      ) as HTMLElement | null;
    fireEvent.click(
      screen.getByRole("button", { name: "Choose icon: No icon" }),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), {
      target: { value: "comp" },
    });
    fireEvent.click(screen.getByRole("option", { name: "compass" }));
    expect(header()?.getAttribute("title")).toBe("compass");
    fireEvent.click(screen.getByRole("radio", { name: "amber" }));
    expect(header()?.style.color).toBe("rgb(180, 83, 9)");
    fireEvent.click(screen.getByRole("radio", { name: "Text color" }));
    expect(header()?.style.color).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove icon" }));
    expect(header()).toBeNull();
  });
});

describe("icon tokens in the Markdown editor", () => {
  function roundTrip(markdown: string) {
    const editor = new Editor({
      extensions: [StarterKit, Markdown, SchemaIconNode],
      content: markdown,
      contentType: "markdown",
    });
    try {
      return { json: editor.getJSON(), markdown: editor.getMarkdown() };
    } finally {
      editor.destroy();
    }
  }

  it("parses tokens into atom nodes and serializes them back exactly", () => {
    const source =
      "- `cargo` :icon[anchor]{color=amber} and :icon[link-2]\n- unknown :icon[kraken]{color=plaid}";
    const { json, markdown } = roundTrip(source);
    expect(markdown).toBe(source);
    const icons = JSON.stringify(json).match(/"type":"schemaIcon"[^}]*}/g);
    expect(icons).toEqual([
      '"type":"schemaIcon","attrs":{"name":"anchor","color":"amber"}',
      '"type":"schemaIcon","attrs":{"name":"link-2","color":null}',
      '"type":"schemaIcon","attrs":{"name":"kraken","color":"plaid"}',
    ]);
  });
});
