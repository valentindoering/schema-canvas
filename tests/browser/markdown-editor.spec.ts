import { expect, test, type Locator, type Page } from "@playwright/test";

async function writable(page: Page, markdown?: string) {
  await page.goto(
    markdown === undefined ? "/" : `/?markdown=${encodeURIComponent(markdown)}`,
  );
  await page.getByTestId("mode").click();
}

async function add(page: Page, kind: "note" | "text") {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
}

for (const kind of ["note", "text", "table"] as const) {
  test(`${kind} uses formatted editing and saves Markdown`, async ({
    page,
  }) => {
    await writable(page);
    if (kind === "table")
      await page.getByText("Projects", { exact: true }).click();
    else await add(page, kind);
    const content = page.getByRole("textbox", {
      name: kind === "table" ? "Table Markdown" : "Markdown",
      exact: true,
    });
    await expect(content).toHaveAttribute("contenteditable", "true");
    await content.fill("Fictional documentation");
    await content.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(content.locator("strong")).toHaveText(
      "Fictional documentation",
    );
    await page.getByRole("combobox", { name: "Text style" }).selectOption("2");
    await expect(content.locator("h2 strong")).toHaveText(
      "Fictional documentation",
    );
    const saved = page.getByTestId(kind === "table" ? "layout" : "annotations");
    await expect(saved).toContainText("## **Fictional documentation**");
    await page
      .getByRole("button", { name: "Markdown source", exact: true })
      .click();
    await expect(content).toHaveValue("## **Fictional documentation**");
  });
}

test("read-only inspection does not load Tiptap", async ({ page }) => {
  const modules: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("markdown-editor.tsx"))
      modules.push(request.url());
  });
  await page.goto("/");
  await page.getByText("Projects", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View definition" }),
  ).toBeVisible();
  expect(modules).toHaveLength(0);
  await page.getByTestId("mode").click();
  await expect(
    page.getByRole("textbox", { name: "Table Markdown" }),
  ).toHaveAttribute("contenteditable", "true");
  expect(modules).toHaveLength(1);
});

test("opening, changing views and expanding preserve the exact saved source", async ({
  page,
}) => {
  const markdown =
    "\n\n# Fictional projects\n\n**Keep this**  \n\n3. first\n4. second\n\n";
  await writable(page, markdown);
  const original = await page.getByTestId("layout").textContent();
  await page.getByText("Projects", { exact: true }).click();
  const content = page.getByRole("textbox", {
    name: "Table Markdown",
    exact: true,
  });
  await expect(content).toHaveAttribute("contenteditable", "true");
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await expect(content).toHaveValue(markdown);
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand editor" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Table Markdown",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toContainText("Fictional projects");
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Expand editor" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  await expect(content).toHaveValue(markdown);
  await expect(page.getByTestId("layout")).toHaveText(original!);
  await expect(page.getByTestId("dirty")).toHaveText("false");
});

test("rich-text lists, links, native undo and expanded editing work", async ({
  page,
}) => {
  await writable(page);
  await page.getByText("Projects", { exact: true }).click();
  const content = page.getByRole("textbox", {
    name: "Table Markdown",
    exact: true,
  });
  await expect(content).toHaveAttribute("contenteditable", "true");
  await content.fill("Project guide");
  await content.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const url = page.getByRole("textbox", { name: "Link URL" });
  await url.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a web address");
  await url.fill("https://example.com/guide");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(content.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/guide",
  );
  await page
    .getByRole("button", { name: "Bulleted list", exact: true })
    .click();
  await expect(content.locator("ul li")).toHaveText("Project guide");
  await content.press("ControlOrMeta+z");
  await expect(content.locator("ul")).toHaveCount(0);
  await expect(page.getByTestId("annotations")).toHaveText("[]");
  await page.getByRole("button", { name: "Expand editor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Table Markdown" })
    .fill("Expanded documentation");
  await dialog.getByRole("button", { name: "Collapse editor" }).click();
  await expect(content).toHaveText("Expanded documentation");
  await expect(page.getByTestId("layout")).toContainText(
    '"markdown":"Expanded documentation"',
  );
});

test("content outside the rich schema stays editable in Source mode", async ({
  page,
}) => {
  const markdown =
    "# Fictional\n\n![diagram](diagram.png)\n\n<div>Keep the original</div>\n\n| A | B |\n| - | - |\n| 1 | 2 |\n";
  await writable(page, markdown);
  await page.getByText("Projects", { exact: true }).click();
  const content = page.getByRole("textbox", { name: "Table Markdown" });
  await expect(content).toHaveValue(markdown);
  await expect(
    page.getByText("This content uses formatting available in Source mode."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Markdown source", exact: true }),
  ).toBeDisabled();
  await content.fill(`${markdown}\nAn extra note.\n`);
  await expect(content).toHaveValue(`${markdown}\nAn extra note.\n`);
  await expect(page.getByTestId("layout")).toContainText("Keep the original");
});

test("source editing remains available if the lazy editor fails to load", async ({
  page,
}) => {
  await page.route("**/markdown-editor.tsx*", (route) => route.abort());
  await writable(page, "# Fictional source");
  await page.getByText("Projects", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not load");
  await page
    .getByRole("textbox", { name: "Table Markdown" })
    .fill("# Source remains editable");
  await expect(page.getByTestId("layout")).toContainText(
    "# Source remains editable",
  );
});

/** Click a list item's text and wait until ProseMirror has read the selection. */
async function caretIn(page: Page, scope: Locator, text: string) {
  await scope.getByText(text, { exact: true }).click();
  await page.waitForFunction((expected) => {
    const view = document.querySelector<
      HTMLElement & {
        editor?: {
          state: { selection: { $from: { parent: { textContent: string } } } };
        };
      }
    >(".ProseMirror");
    return view?.editor?.state.selection.$from.parent.textContent === expected;
  }, text);
}

for (const editor of ["inline", "expanded"] as const)
  test(`Tab and Shift+Tab nest list items in the ${editor} editor, even inside a host focus trap`, async ({
    page,
  }) => {
    await page.goto(
      `/?focusTrap&markdown=${encodeURIComponent("- first\n- second\n- third\n")}`,
    );
    await page.getByTestId("mode").click();
    await page.getByText("Projects", { exact: true }).click();
    let scope: Locator = page.locator("body");
    if (editor === "expanded") {
      await page.getByRole("button", { name: "Expand editor" }).click();
      scope = page.getByRole("dialog", { name: "Table Markdown" });
    }
    const content = scope.getByRole("textbox", { name: "Table Markdown" });
    await expect(content).toHaveAttribute("contenteditable", "true");
    // The first item cannot be nested, but focus must stay in the editor.
    await caretIn(page, content, "first");
    await page.keyboard.press("Tab");
    await expect(content).toBeFocused();
    await expect(content.locator("li li")).toHaveCount(0);
    await caretIn(page, content, "second");
    await page.keyboard.press("Tab");
    await expect(content.locator("li li")).toHaveText("second");
    await expect(content).toBeFocused();
    // Typing continues in the nested item.
    await page.keyboard.type(" nested");
    await expect(content.locator("li li")).toHaveText("second nested");
    await caretIn(page, content, "third");
    await page.keyboard.press("Tab");
    await expect(content.locator("li li")).toHaveCount(2);
    await page.keyboard.press("Tab");
    await expect(content.locator("li li li")).toHaveText("third");
    await expect(page.getByTestId("layout")).toContainText(
      String.raw`"markdown":"- first\n  - second nested\n    - third"`,
    );
    await page.keyboard.press("Shift+Tab");
    await expect(content.locator("li li li")).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(content.locator("li li")).toHaveCount(1);
    await expect(content).toBeFocused();
    // A top-level item stays a list item on Shift+Tab.
    await page.keyboard.press("Shift+Tab");
    await expect(content.locator(":scope > ul > li")).toHaveCount(2);
    await expect(content).toBeFocused();
    // Outside a list, Tab still moves focus (no keyboard trap).
    await content.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Plain paragraph");
    await expect(content.locator(":scope > p")).toHaveText("Plain paragraph");
    await page.keyboard.press("Tab");
    await expect(content).not.toBeFocused();
  });

test("Tab and Shift+Tab indent list lines in Markdown source", async ({
  page,
}) => {
  await writable(page, "- first\n- second\nplain");
  await page.getByText("Projects", { exact: true }).click();
  await page
    .getByRole("button", { name: "Markdown source", exact: true })
    .click();
  const source = page.getByRole("textbox", { name: "Table Markdown" });
  await expect(source).toHaveValue("- first\n- second\nplain");
  await source.evaluate((field: HTMLTextAreaElement) =>
    field.setSelectionRange(10, 10),
  );
  await page.keyboard.press("Tab");
  await expect(source).toHaveValue("- first\n  - second\nplain");
  await expect(source).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(source).toHaveValue("- first\n- second\nplain");
  await expect(source).toBeFocused();
  await source.evaluate((field: HTMLTextAreaElement) =>
    field.setSelectionRange(field.value.length, field.value.length),
  );
  await page.keyboard.press("Tab");
  await expect(source).not.toBeFocused();
  await expect(page.getByTestId("layout")).toContainText(
    String.raw`"markdown":"- first\n- second\nplain"`,
  );
});

test("the expanded editor is centered even with a host margin reset", async ({
  page,
}) => {
  await writable(page);
  await page.addStyleTag({
    content: "*, ::before, ::after, ::backdrop { margin: 0; padding: 0; }",
  });
  await page.getByText("Projects", { exact: true }).click();
  await page.getByRole("button", { name: "Expand editor" }).click();
  const box = (await page.getByRole("dialog").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(
    Math.abs(box.x + box.width / 2 - viewport.width / 2),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(box.y + box.height / 2 - viewport.height / 2),
  ).toBeLessThanOrEqual(2);
});
