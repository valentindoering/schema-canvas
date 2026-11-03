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
  const add = page.getByRole("button", { name: "Add", exact: true });
  await expect(add).toContainText("Add");
  await add.click();
  for (const label of ["Add frame", "Add note", "Add text", "Add image"]) {
    await expect(page.getByRole("button", { name: label })).toHaveText(label);
  }
});

test("labeled Add choices fit a narrow screen and dismiss without adding anything", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const options = page.locator(".schema-canvas__add-options");
  const box = await options.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  await page.getByRole("button", { name: "Add note" }).focus();
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-expanded", "false");
  await add.press("Enter");
  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 10, y: 100 } });
  await expect(options).toHaveCount(0);
  await add.click();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(options).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Markdown", exact: true }),
  ).toBeVisible();
});

test("keeps the manual dark mode choice across reloads", async ({ page }) => {
  const canvas = page.locator(".schema-canvas");
  await expect(canvas).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "light");
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
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Markdown", exact: true })
    .fill("# Review marker");
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
    localStorage.removeItem("schema-canvas-example-review");
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

test("suggestions open automatically with one-click decisions and a focused preview", async ({
  page,
}) => {
  const readDocument = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("schema-canvas-example-review")!)
          .document,
    );
  const before = await readDocument();
  await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  const panel = page.getByRole("complementary", {
    name: "Suggestions",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog", { name: "Suggestions" })).toHaveCount(
    0,
  );
  await expect(
    panel.locator(".schema-canvas__diff-line--added"),
  ).not.toHaveCount(0);
  expect(await readDocument()).toEqual(before);
  await page.reload();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  const change = panel.getByRole("region", { name: "Voyages", exact: true });
  await change.locator("summary", { hasText: "Preview" }).click();
  const image = change.getByRole("img", {
    name: "Preview: Voyages",
    exact: true,
  });
  await expect(image).toBeVisible();
  const svg = await image.evaluate((img) =>
    decodeURIComponent(img.getAttribute("src")!.split(",")[1]!),
  );
  expect(svg).toContain("Voyages");
  expect(svg).not.toContain("Cargo crates");
  expect(svg).not.toContain("Airships");
  expect(await readDocument()).toEqual(before);
  await panel.getByRole("button", { name: "Collapse suggestions" }).click();
  await expect(panel.getByRole("article")).toHaveCount(0);
  await panel.getByRole("button", { name: "Expand suggestions" }).click();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("button", { name: "Go to Cargo crates", exact: true })
    .click();
  await expect(page.locator('[data-id="cargo_crates"]')).toHaveClass(
    /selected/,
  );
  expect(await readDocument()).toEqual(before);
  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const after = await readDocument();
  expect(after.layout.voyages.markdown).toContain("## Voyage planning");
  expect(after.layout.cargo_crates).toMatchObject({ x: 1240, y: 220 });
  await page.reload();
  await expect(
    page.locator('[data-id="voyages"] .schema-canvas__table-markdown h2'),
  ).toHaveText("Voyage planning");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("schema-canvas-example-review")!)
          .proposals[0].status,
    ),
  ).toBe("accepted");
});

test("rejection preserves documentation and stale suggestions cannot be applied", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  await page
    .locator('[data-id="voyages"] .schema-canvas__table-header')
    .click();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Table Markdown", exact: true })
    .fill("# Human documentation");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("schema-canvas-example-review")!)
            .document.layout.voyages.markdown,
      ),
    )
    .toBe("# Human documentation");
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("schema-canvas-example-review")!)
        .document,
  );
  const panel = page.getByRole("complementary", {
    name: "Suggestions",
    exact: true,
  });
  await expect(panel.getByRole("alert")).toContainText("canvas has changed");
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("schema-canvas-example-review")!)
          .document,
    ),
  ).toEqual(before);
});

test("the large system has separate storage and exports distant regional documentation", async ({
  page,
}) => {
  const original = await page.evaluate(() =>
    localStorage.getItem("schema-canvas-example-review"),
  );
  await page
    .getByRole("combobox", { name: "Example", exact: true })
    .selectOption("large");
  await expect(page).toHaveURL(/example=large/);
  await expect(page.locator(".react-flow__node-schemaTable")).toHaveCount(96);
  await page
    .getByRole("button", { name: "Search tables", exact: true })
    .click();
  await page.getByRole("searchbox").fill("work_orders");
  await page.getByRole("searchbox").press("Enter");
  await page.getByRole("button", { name: "AI context", exact: true }).click();
  const context = page.getByRole("dialog", { name: "AI context", exact: true });
  await expect(context.locator("pre")).toContainText(
    'Declared group: "Maintenance"',
  );
  await expect(context.locator("pre")).toContainText("maintenance.released");
  await expect(context.locator("pre")).toContainText(
    "never revokes a maintenance release",
  );
  await context.getByRole("button", { name: "Close context" }).click();
  await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  await expect(
    page.getByRole("complementary", { name: "Suggestions", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() => ({
    small: localStorage.getItem("schema-canvas-example-review"),
    large: JSON.parse(
      localStorage.getItem("schema-canvas-large-example-review")!,
    ),
  }));
  expect(stored.small).toBe(original);
  expect(stored.large.proposals).toHaveLength(1);
  expect(stored.large.document.graph.tables).toHaveLength(96);
  expect(stored.large.document.layout.cargo_crates.x).toBe(2480);
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Suggestions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Example", exact: true })
    .selectOption("small");
  await expect(page.locator(".react-flow__node-schemaTable")).toHaveCount(7);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("schema-canvas-example-review"),
    ),
  ).toBe(original);
});

test("the large suggestion panel stays compact and navigates beside the target", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Example", exact: true })
    .selectOption("large");
  await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  const panel = page.getByRole("complementary", {
    name: "Suggestions",
    exact: true,
  });
  await expect(
    panel.locator(".schema-canvas__diff-line--removed"),
  ).not.toHaveCount(0);
  await expect(
    panel.locator(".schema-canvas__diff-line--added"),
  ).not.toHaveCount(0);
  await expect(panel).toContainText("(2480, 2520) → (2540, 2560)");
  await panel
    .getByRole("button", { name: "Go to Cargo crates", exact: true })
    .click();
  await expect(page.locator('[data-id="cargo_crates"]')).toHaveClass(
    /selected/,
  );
  await expect
    .poll(async () => {
      const target = await page
        .locator('[data-id="cargo_crates"]')
        .boundingBox();
      const box = await panel.boundingBox();
      return (
        !!target && !!box && target.x >= 0 && target.x + target.width < box.x
      );
    })
    .toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Table Markdown", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
});

test("on a narrow canvas suggestions scroll and Go to reveals the target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  const panel = page.getByRole("complementary", {
    name: "Suggestions",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  await panel
    .getByRole("button", { name: "Go to Voyages", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Expand suggestions" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-id="voyages"]')).toHaveClass(/selected/);
  await panel.getByRole("button", { name: "Expand suggestions" }).click();
  await panel.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test("independent suggestions from one revision can be accepted one by one", async ({
  page,
}) => {
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Try an AI suggestion" }).click();
  const panel = page.getByRole("complementary", {
    name: "Suggestions",
    exact: true,
  });
  const voyage = panel.getByRole("article", {
    name: "Explain the voyage boundary",
    exact: true,
  });
  const airship = panel.getByRole("article", {
    name: "Emphasize the airship table",
    exact: true,
  });
  await expect(
    voyage.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  await expect(
    airship.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  const revisions = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("schema-canvas-example-review")!,
    ).proposals.map((p: { baseRevision: string }) => p.baseRevision),
  );
  expect(revisions[0]).toBe(revisions[1]);
  await voyage.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(voyage).toHaveCount(0);
  await expect(
    airship.getByRole("button", { name: "Accept", exact: true }),
  ).toBeEnabled();
  await expect(airship.getByRole("alert")).toHaveCount(0);
  await airship.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(panel).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("schema-canvas-example-review")!),
  );
  expect(saved.proposals.map((p: { status: string }) => p.status)).toEqual([
    "accepted",
    "accepted",
  ]);
  expect(saved.document.layout.voyages.markdown).toContain(
    "## Voyage planning",
  );
  expect(saved.document.layout.cargo_crates).toMatchObject({ x: 1240, y: 220 });
  expect(saved.document.layout.airships.appearance).toBe("blue");
});
