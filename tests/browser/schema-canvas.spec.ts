import { expect, test } from "@playwright/test";

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
