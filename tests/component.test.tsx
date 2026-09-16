import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SchemaCanvas } from "../src/react/index.js";
import { graph, layout } from "./fixtures.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

describe("SchemaCanvas", () => {
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
