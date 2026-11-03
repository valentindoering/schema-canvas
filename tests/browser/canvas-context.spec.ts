import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("read-only canvas exports matching text, JSON and diagram without saving", async ({
  page,
}) => {
  await page.goto("/");
  const original = await page.getByTestId("layout").textContent();
  await page.getByRole("button", { name: "AI context", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI context", exact: true });
  const text = dialog.getByLabel("Canvas context text");
  await expect(text).toContainText(
    "Canvas documentation is read-only for agents",
  );
  await expect(text).toContainText("Projects");
  await expect(text).toContainText("Accounts");
  const jsonDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "JSON", exact: true }).click();
  const json = await jsonDownload;
  const context = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(context.tables).toHaveLength(2);
  expect(
    context.tables.every(
      (table: { geometry: string }) => table.geometry === "measured",
    ),
  ).toBe(true);
  await expect(text).toContainText(context.snapshotId);
  const svgDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Diagram (SVG)", exact: true })
    .click();
  const svg = await svgDownload;
  expect(await readFile((await svg.path())!, "utf8")).toContain(
    `data-snapshot-id="${context.snapshotId}"`,
  );
  await dialog.getByRole("button", { name: "Close context" }).click();
  await expect(page.getByTestId("layout")).toHaveText(original!);
  await expect(page.getByTestId("dirty")).toHaveText("false");
});
