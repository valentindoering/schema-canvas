import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset example" }).click();
});

test("opens directly on the editable canvas without permanent mode or tool bars", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: /Editing (on|off)/ }),
  ).toHaveCount(0);
  await expect(page.locator(".schema-canvas__toolbar")).toHaveCount(0);
  await expect(page.locator(".playground__source")).toHaveCount(0);
  await expect(page.getByText("Sky ports", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Weather reports", { exact: true }),
  ).toBeVisible();
});

test("moves a detected table directly and persists its position", async ({
  page,
}) => {
  const node = page.locator('[data-id="airships"]');
  const before = await node.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  await page.mouse.move(before.x + before.width / 2, before.y + 24);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + 84, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await node.boundingBox();
  expect(after?.x).toBeGreaterThan(before.x + 80);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("schema-canvas-example-layout")),
    )
    .not.toBeNull();
});

test("shows the fictional schema and its editable features", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Schema Canvas playground" }),
  ).toBeVisible();
  await expect(page.getByText("Sky ports", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add frame" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add note" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add text" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add image" })).toBeVisible();
});

test("shows distance-muted gray arrows alongside dark arrows", async ({
  page,
}) => {
  await expect(
    page.locator('[data-id="edge-voyages.originPortId"]'),
  ).toHaveClass(/schema-canvas__edge--muted/);
  await expect(
    page.locator('[data-id="edge-airships.homePortId"]'),
  ).not.toHaveClass(/schema-canvas__edge--muted/);
});

test("shows which fictional source file produced a selected table", async ({
  page,
}) => {
  await page.getByText("Airships", { exact: true }).click();
  await page.getByRole("button", { name: "View definition" }).click();
  const details = page.getByRole("dialog", {
    name: "Airships View definition",
  });
  await expect(
    details.getByText("schema/fleet.ts", { exact: true }),
  ).toBeVisible();
  await expect(details.getByLabel("schema/fleet.ts source")).toContainText(
    "airships: table",
  );
  await page.getByRole("button", { name: "Close definition" }).click();
  await expect(details).toHaveCount(0);
});

test("persists edits locally and can reset them", async ({ page }) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Markdown").fill("# Review marker");
  const marker = page
    .locator(".schema-canvas__annotation-card")
    .filter({ hasText: "Review marker" });
  await expect(marker).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("schema-canvas-example-annotations"),
      ),
    )
    .toContain("Review marker");

  await page.reload();
  await expect(marker).toBeVisible();

  await page.getByRole("button", { name: "Reset example" }).click();
  await expect(marker).toHaveCount(0);
});

test("migrates saved browser annotations to single-field Markdown", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "schema-canvas-example-annotations",
      JSON.stringify([
        {
          id: "legacy-note",
          kind: "note",
          label: "Review",
          text: "Check the model",
          x: 0,
          y: 0,
          width: 300,
          height: 180,
          color: "slate",
        },
      ]),
    );
  });
  await page.reload();
  await expect(
    page.locator(".schema-canvas__annotation-card--note h1"),
  ).toHaveText("Review");
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("schema-canvas-example-annotations") ?? "[]",
    ),
  );
  expect(saved[0].markdown).toBe("# Review\n\nCheck the model");
  expect(saved[0]).not.toHaveProperty("label");
  expect(saved[0]).not.toHaveProperty("text");
});
