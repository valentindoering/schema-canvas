import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaCanvas, type SchemaCanvasHandle } from "../src/react/index.js";
import { graph, layout } from "./fixtures.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

describe("SchemaCanvas", () => {
  it("exposes immediate dirty state and flushes both channels before navigation", async () => {
    const ref = createRef<SchemaCanvasHandle>();
    const notify = vi.fn();
    const save = vi.fn(async () => ({}));
    render(
      <SchemaCanvas
        ref={ref}
        graph={graph}
        layout={layout}
        writable
        initialTableId="accounts"
        onSaveLayout={save}
        onSaveAnnotations={save}
        onSaveStateChange={notify}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(save).not.toHaveBeenCalled();
    expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({
      dirty: true,
      pending: true,
    });
    expect(ref.current?.getSaveState().layout.dirty).toBe(true);
    expect(ref.current?.getSaveState().annotations.dirty).toBe(true);
    await act(() => ref.current!.flushSaves());
    expect(save).toHaveBeenCalledTimes(2);
    expect(ref.current?.getSaveState()).toMatchObject({
      dirty: false,
      pending: false,
    });
  });

  it("preserves the queue through StrictMode, callback changes, and revision echoes", async () => {
    const ref = createRef<SchemaCanvasHandle>();
    const oldSave = vi.fn(async () => ({}));
    const newSave = vi.fn().mockResolvedValue({ revision: "r2" });
    const { rerender } = render(
      <StrictMode>
        <SchemaCanvas
          ref={ref}
          graph={graph}
          layout={layout}
          writable
          initialTableId="accounts"
          layoutRevision="r1"
          onSaveLayout={oldSave}
        />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    rerender(
      <StrictMode>
        <SchemaCanvas
          ref={ref}
          graph={graph}
          layout={layout}
          writable
          initialTableId="accounts"
          layoutRevision="unrelated"
          onSaveLayout={newSave}
        />
      </StrictMode>,
    );
    await act(() => ref.current!.flushSaves());
    expect(oldSave).not.toHaveBeenCalled();
    expect(newSave).toHaveBeenCalledTimes(1);
    expect(newSave.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: "r1",
    });
    const thirdSave = vi.fn().mockResolvedValue({ revision: "r3" });
    rerender(
      <StrictMode>
        <SchemaCanvas
          ref={ref}
          graph={graph}
          layout={layout}
          writable
          initialTableId="accounts"
          layoutRevision="unrelated"
          onSaveLayout={thirdSave}
        />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Highlighted" }));
    await act(() => ref.current!.flushSaves());
    expect(thirdSave.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: "r2",
    });
  });

  it.each(["layout", "annotations"])(
    "drains a queued %s successor after an active save on unmount",
    async (channel) => {
      const ref = createRef<SchemaCanvasHandle>();
      let finish!: () => void;
      const save = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve({ revision: "r2" });
            }),
        )
        .mockResolvedValue({ revision: "r3" });
      const { unmount } = render(
        <SchemaCanvas
          ref={ref}
          graph={graph}
          layout={layout}
          writable
          initialTableId="accounts"
          onSaveLayout={save}
          onSaveAnnotations={save}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: channel === "layout" ? "Quiet" : "Add note",
        }),
      );
      const handle = ref.current!;
      let flushing!: Promise<void>;
      act(() => {
        flushing = handle.flushSaves();
      });
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: channel === "layout" ? "Highlighted" : "Add text",
        }),
      );
      unmount();
      finish();
      await flushing;
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1]?.[0].expectedRevision).toBe("r2");
      expect(handle.getSaveState().dirty).toBe(false);
    },
  );

  it("retains failed edits for explicit retry and waits for the other channel before rejecting", async () => {
    const ref = createRef<SchemaCanvasHandle>();
    let finish!: () => void;
    const saveLayout = vi
      .fn()
      .mockRejectedValueOnce(new Error("revision conflict"))
      .mockResolvedValue({});
    const { unmount } = render(
      <SchemaCanvas
        ref={ref}
        graph={graph}
        layout={layout}
        writable
        initialTableId="accounts"
        onSaveLayout={saveLayout}
        onSaveAnnotations={() =>
          new Promise((resolve) => {
            finish = () => resolve({});
          })
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    let settled = false;
    let flushing!: Promise<unknown>;
    act(() => {
      flushing = ref.current!.flushSaves().catch((error) => {
        settled = true;
        return error;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    await act(async () => {
      finish();
      await flushing;
    });
    expect(await flushing).toEqual(new Error("revision conflict"));
    expect(ref.current!.getSaveState()).toMatchObject({
      dirty: true,
      pending: false,
    });
    await expect(ref.current!.whenSavesIdle()).rejects.toThrow(
      "revision conflict",
    );
    expect(saveLayout).toHaveBeenCalledTimes(1);
    await act(() => ref.current!.flushSaves());
    expect(ref.current!.getSaveState().dirty).toBe(false);
    unmount();
  });

  it("reports a failed fallback save to the host after unmount", async () => {
    const notify = vi.fn();
    const { unmount } = render(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        writable
        onSaveStateChange={notify}
        onSaveAnnotations={async () => {
          throw new Error("offline");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    unmount();
    await waitFor(() =>
      expect(notify.mock.calls.at(-1)?.[0]).toMatchObject({
        dirty: true,
        pending: false,
        annotations: {
          state: { status: "error", error: new Error("offline") },
        },
      }),
    );
  });
  it.each(["layout", "annotations"])(
    "drains debounced %s edits on unmount",
    async (channel) => {
      const save = vi.fn(async () => ({}));
      const { unmount } = render(
        <SchemaCanvas
          graph={graph}
          layout={layout}
          writable
          initialTableId="accounts"
          onSaveLayout={save}
          onSaveAnnotations={save}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: channel === "layout" ? "Quiet" : "Add note",
        }),
      );
      expect(save).not.toHaveBeenCalled();
      unmount();
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    },
  );
  it("follows table focus changes without remounting or losing a queued annotation", async () => {
    const save = vi.fn();
    const { container, rerender } = render(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        writable
        initialTableId="accounts"
        onSaveAnnotations={save}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    rerender(
      <SchemaCanvas
        graph={graph}
        layout={layout}
        writable
        initialTableId="projects"
        onSaveAnnotations={save}
      />,
    );
    expect(
      container.querySelector(".schema-canvas__editor > header > strong")
        ?.textContent,
    ).toBe("Projects");
    expect(
      container.querySelectorAll(".schema-canvas__annotation-card--note"),
    ).toHaveLength(1);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[0].value).toHaveLength(1);
  });

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
