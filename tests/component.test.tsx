import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaCanvas } from "../src/react/index.js";
import { graph, layout } from "./fixtures.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

describe("SchemaCanvas", () => {
  it("resolves an asset-only image replacement immediately and saves only its asset", async () => {
    const save = vi.fn();
    const { container } = render(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        annotations={[
          {
            id: "chart",
            kind: "image",
            label: "Chart",
            x: 0,
            y: 0,
            width: 320,
            height: 200,
            color: "slate",
            asset: "old.png",
          },
        ]}
        writable
        resolveImage={(asset) => `https://example.com/${asset}`}
        onUploadImage={async () => ({ asset: "new.png" })}
        onSaveAnnotations={save}
      />,
    );
    expect(screen.getByRole("img", { name: "Chart" }).getAttribute("src")).toBe(
      "https://example.com/old.png",
    );
    fireEvent.click(container.querySelector('[data-id="annotation:chart"]')!);
    const upload = container.querySelector(
      '.schema-canvas__editor input[type="file"]',
    )!;
    fireEvent.change(upload, {
      target: {
        files: [new File(["fictional"], "new.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "Chart" }).getAttribute("src"),
      ).toBe("https://example.com/new.png"),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[0].value[0]).toMatchObject({
      asset: "new.png",
    });
    expect(save.mock.calls.at(-1)?.[0].value[0]).not.toHaveProperty("src");
  });

  it("keeps an unpositioned table in its column when changing its appearance", async () => {
    const save = vi.fn();
    render(
      <SchemaCanvas
        graph={graph}
        layout={{ accounts: { x: 400, y: 0 } }}
        writable
        initialTableId="projects"
        onSaveLayout={save}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      value: { projects: { x: 840, y: 0, appearance: "quiet" } },
    });
  });
  it("offers compact English add actions without global layout controls", () => {
    render(
      <SchemaCanvas
        graph={graph}
        layout={{}}
        writable
        features={{ navigationControls: false }}
        onUploadImage={async () => ({ asset: "sample.png" })}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Add" })).toBeTruthy();
    for (const name of ["Add frame", "Add note", "Add text", "Add image"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Arrange|Fit/i })).toBeNull();
  });
  it("shows discriminator branches with their foreign keys", () => {
    render(
      <SchemaCanvas
        graph={{
          tables: [
            {
              id: "vessels",
              label: "Vessels",
              fields: [
                {
                  name: "assignment",
                  type: "union",
                  optional: false,
                  foreignKeyTargets: [],
                  discriminatedUnion: {
                    discriminator: "mode",
                    variants: [
                      {
                        discriminatorValue: "crew",
                        fields: [
                          {
                            name: "captain",
                            type: "id<accounts>",
                            optional: false,
                            foreignKeyTargets: ["accounts"],
                          },
                        ],
                      },
                      {
                        discriminatorValue: "port",
                        fields: [
                          {
                            name: "berth",
                            type: "number",
                            optional: false,
                            foreignKeyTargets: [],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
          edges: [],
          warnings: [],
        }}
        layout={{}}
        writable={false}
      />,
    );
    expect(screen.getByText("crew")).toBeTruthy();
    expect(screen.getByText("port")).toBeTruthy();
    expect(screen.getByText("captain")).toBeTruthy();
    expect(screen.getByText("berth")).toBeTruthy();
  });

  it("surfaces image-upload failures without creating an annotation", async () => {
    const save = vi.fn();
    render(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        writable
        onSaveAnnotations={save}
        onUploadImage={async () => {
          throw new Error("Image too large");
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose image"), {
      target: {
        files: [new File(["fictional"], "sample.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Image too large",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("renders read-only mode without mutation controls", () => {
    render(
      <div style={{ width: 1000, height: 700 }}>
        <SchemaCanvas graph={graph} layout={layout} writable={false} />
      </div>,
    );
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Read only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add frame" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Arrange" })).toBeNull();
  });

  it("adds and explicitly deletes annotations in writable mode", () => {
    vi.useFakeTimers();
    const save = vi.fn(async ({ value }) => ({ value }));
    render(
      <div style={{ width: 1000, height: 700 }}>
        <SchemaCanvas
          graph={graph}
          layout={layout}
          writable
          onSaveAnnotations={save}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add frame" }));
    expect(
      screen.getByRole("button", { name: "Delete annotation" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete annotation" }));
    expect(
      screen.queryByRole("button", { name: "Delete annotation" }),
    ).toBeNull();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("uses host labels for package-owned actions", () => {
    render(
      <div style={{ width: 1000, height: 700 }}>
        <SchemaCanvas
          graph={graph}
          layout={layout}
          writable
          labels={{ addFrame: "Rahmen hinzufügen" }}
        />
      </div>,
    );
    expect(
      screen.getByRole("button", { name: "Rahmen hinzufügen" }),
    ).toBeTruthy();
  });
});
