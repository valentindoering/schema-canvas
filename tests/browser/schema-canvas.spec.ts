import { expect, test } from "@playwright/test";

test("compact manual zoom controls work in read-only mode", async ({
  page,
}) => {
  await page.goto("/");
  const controls = page.locator(".schema-canvas__navigation");
  await expect(controls).toBeVisible();
  const zoom = () =>
    page
      .locator(".react-flow__viewport")
      .evaluate(
        (element) =>
          new DOMMatrixReadOnly(getComputedStyle(element).transform).a,
      );
  const before = await zoom();
  await controls.locator(".react-flow__controls-zoomin").click();
  await expect.poll(zoom).toBeGreaterThan(before);
  const zoomedIn = await zoom();
  await controls.locator(".react-flow__controls-zoomout").click();
  await expect.poll(zoom).toBeLessThan(zoomedIn);
  await expect(controls.locator(".react-flow__controls-fitview")).toBeVisible();
});

test("search finds and focuses a table in read-only mode", async ({ page }) => {
  await page.goto("/");
  const searchButton = page.getByRole("button", { name: "Search tables" });
  const box = await searchButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 100);
  expect(box!.y).toBeLessThan(60);

  await searchButton.click();
  const search = page.getByRole("searchbox", { name: "Search tables" });
  await search.fill("PROJ");
  await page.getByRole("button", { name: "Projects projects" }).click();
  await expect(page.getByTestId("selected")).toHaveText("projects");
  await expect(page.locator('[data-id="projects"].selected')).toBeVisible();
  await expect(page.getByTestId("dirty")).toHaveText("false");
});

test("search crosses views and keeps the table editor below it", async ({
  page,
}) => {
  await page.goto("/?splitViews=1");
  await page.getByTestId("mode").click();
  await expect(page.locator('[data-id="projects"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Search tables" }).click();
  const search = page.getByRole("searchbox", { name: "Search tables" });
  await search.fill("missing");
  await expect(page.getByText("No matching tables")).toBeVisible();
  await search.fill("projects");
  await search.press("Enter");
  await expect(page.getByTestId("selected")).toHaveText("projects");
  await expect(page.locator('[data-id="projects"].selected')).toBeVisible();
  const searchBox = await page
    .getByRole("button", { name: "Search tables" })
    .boundingBox();
  const editorBox = await page.locator(".schema-canvas__editor").boundingBox();
  expect(searchBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.y).toBeGreaterThan(searchBox!.y + searchBox!.height);
});

test("trackpad pinch zooms over canvas content", async ({ page }) => {
  await page.goto("/");
  const viewport = page.locator(".react-flow__viewport");
  const zoom = () =>
    viewport.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return new DOMMatrixReadOnly(transform).a;
    });
  const pinch = async (selector: string) => {
    const before = await zoom();
    await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        element.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            deltaY: 80,
            clientX: element.getBoundingClientRect().left + 20,
            clientY: element.getBoundingClientRect().top + 20,
          }),
        );
      });
    await expect.poll(zoom).toBeLessThan(before);
  };

  await pinch(".react-flow__pane");
  await pinch(".schema-canvas__table-card");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  await pinch(".schema-canvas__annotation-card--note");
});

test("route exit flushes an immediate edit before closing the editor", async ({
  page,
}) => {
  await page.goto("/?saveDelay=200");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByTestId("dirty")).toHaveText("true");
  await page.getByRole("button", { name: "Leave editor" }).click();
  await expect(page.getByText("Editor closed")).toBeVisible();
  await expect(page.getByTestId("annotations")).toContainText('"kind":"note"');
  await expect(page.getByTestId("dirty")).toHaveText("false");
});

test("failed saves retain the editor and dirty state until explicit retry succeeds", async ({
  page,
}) => {
  await page.goto("/?saveFailure=1");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("button", { name: "Leave editor" }).click();
  await expect(page.getByTestId("save-error")).toHaveText("Save unavailable");
  await expect(page.getByTestId("dirty")).toHaveText("true");
  await expect(page.getByRole("button", { name: "Add note" })).toBeVisible();
  await page.getByRole("button", { name: "Leave editor" }).click();
  await expect(page.getByText("Editor closed")).toBeVisible();
  await expect(page.getByTestId("annotations")).toContainText('"kind":"note"');
});

test("a host unload guard can warn immediately after an edit", async ({
  page,
}) => {
  await page.goto("/?saveDelay=5000");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  const dialog = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2000 }).catch(() => undefined);
  const warning = await dialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await reload;
  await expect(page.getByRole("button", { name: "Add note" })).toBeVisible();
});

test("read-only mode permits inspection but not mutation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Read only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add frame" })).toHaveCount(0);
  await page.getByText("Projects", { exact: true }).click();
  await expect(page.getByTestId("selected")).toHaveText("projects");
});

test("writable mode supports direct annotation resize and explicit deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByRole("button", { name: "Delete annotation" }),
  ).toBeVisible();
  await page.getByLabel("Label").fill("Milestone");
  await expect(page.getByLabel("Width")).toHaveCount(0);
  await expect(
    page.locator(".schema-canvas__annotation-card").getByText("Milestone", {
      exact: true,
    }),
  ).toBeVisible();

  const annotation = page.locator(".schema-canvas__annotation").last();
  const resizeHandle = annotation.locator(
    ".react-flow__resize-control.handle.bottom.left",
  );
  const annotationBox = await annotation.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  expect(annotationBox).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (annotationBox && handleBox) {
    expect(
      await resizeHandle.evaluate((handle) => {
        const box = handle.getBoundingClientRect();
        return (
          document.elementFromPoint(
            box.x + box.width / 4,
            box.y + (box.height * 3) / 4,
          ) === handle
        );
      }),
    ).toBe(true);
    await resizeHandle.dragTo(page.locator("body"), {
      sourcePosition: {
        x: handleBox.width / 2,
        y: handleBox.height / 2,
      },
      targetPosition: { x: handleBox.x - 90, y: handleBox.y + 60 },
    });
    await expect
      .poll(async () => {
        const value = await page.getByTestId("annotations").textContent();
        const items = JSON.parse(value ?? "[]") as SchemaAnnotationSnapshot[];
        return items.find((item) => item.label === "Milestone")?.width ?? 0;
      })
      .toBeGreaterThan(340);
  }

  await page.getByRole("button", { name: "Delete annotation" }).click();
  await expect(page.getByText("Milestone", { exact: true })).toHaveCount(0);
});

test("notes preserve plain-text line breaks and keep overflow readable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "Add note" }).click();
  await page
    .getByLabel("Text")
    .fill(
      [
        "Invariants",
        "- first item",
        "- second item",
        "",
        "Next paragraph with an_unbroken_identifier_that_must_wrap",
        "More detail",
        "More detail",
        "More detail",
        "More detail",
        "More detail",
      ].join("\n"),
    );
  await page.getByLabel("Text").blur();

  const note = page.locator(".schema-canvas__annotation-card--note").last();
  const body = note.locator("p");
  await expect(body).toHaveCSS("white-space", "pre-wrap");
  await expect(body).toHaveCSS("overflow-wrap", "anywhere");
  await expect(note).toHaveCSS("overflow-y", "auto");
  await expect
    .poll(() =>
      note.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  const viewport = page.locator(".react-flow__viewport");
  const transform = await viewport.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  const box = await note.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120);
    await expect
      .poll(() => note.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(viewport).toHaveCSS("transform", transform);
  }
});

test("writable mode exposes table and edge controls", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.getByText("Projects", { exact: true }).click();
  const selectedCard = page.locator(".schema-canvas__table-card--selected");
  await expect(selectedCard).toHaveCSS("border-color", "rgb(37, 99, 235)");
  await expect(page.getByTestId("table-details")).toHaveText(
    "Fixture source: projects",
  );
  await page.getByRole("button", { name: "Show key attributes" }).click();
  await page.getByLabel("accountId", { exact: true }).check();
  await expect(
    page.locator(".schema-canvas__field--highlighted"),
  ).toContainText("accountId");
  await page.getByRole("button", { name: "Show all edges" }).click();
});

type SchemaAnnotationSnapshot = {
  label: string;
  width: number;
};

test("moves an existing arrow tip to a chosen table port", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.locator(".react-flow__edge").first().click();

  const tip = page.locator(".react-flow__edgeupdater-target");
  const port = page.locator(
    '[data-nodeid="accounts"][data-handleid="target-top"]',
  );
  const tipBox = await tip.boundingBox();
  const portBox = await port.boundingBox();
  expect(tipBox).not.toBeNull();
  expect(portBox).not.toBeNull();
  if (!tipBox || !portBox) return;

  await page.mouse.move(
    tipBox.x + tipBox.width / 2,
    tipBox.y + tipBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    portBox.x + portBox.width / 2,
    portBox.y + portBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(page.getByTestId("layout")).toContainText('"target":"top"');
});
