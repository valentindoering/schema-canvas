import { expect, test, type Page } from "@playwright/test";

async function clickAdd(page: Page, name: string) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name }).click();
}

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

test("floating controls share aligned upper and lower docks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  const upper = page.getByRole("toolbar", { name: "Canvas actions" });
  await expect(
    upper.getByRole("button", { name: "Search tables" }),
  ).toBeVisible();
  await expect(upper.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(upper.getByRole("button", { name: "Redo" })).toBeVisible();
  const upperBox = await upper.boundingBox();
  const zoomBox = await page
    .locator(".schema-canvas__navigation")
    .boundingBox();
  const addBox = await page.locator(".schema-canvas__add-menu").boundingBox();
  expect(upperBox).not.toBeNull();
  expect(zoomBox).not.toBeNull();
  expect(addBox).not.toBeNull();
  if (!upperBox || !zoomBox || !addBox) return;
  expect(upperBox.x).toBeLessThan(40);
  expect(upperBox.y).toBeLessThan(70);
  expect(Math.abs(zoomBox.x - upperBox.x)).toBeLessThan(2);
  expect(Math.abs(zoomBox.y - addBox.y)).toBeLessThan(2);
  expect(addBox.x - (zoomBox.x + zoomBox.width)).toBeGreaterThanOrEqual(4);
});

test("manual dark mode colors the canvas, details, arrows, and Markdown", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator(".schema-canvas");
  await expect(canvas).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  await expect(canvas).toHaveCSS("background-color", "rgb(11, 18, 32)");
  await expect(page.locator(".react-flow")).toHaveClass(/dark/);
  await expect(page.locator(".react-flow__minimap")).toHaveCSS(
    "background-color",
    "rgb(20, 32, 51)",
  );
  await expect(page.locator(".react-flow__edge-textbg")).toHaveCSS(
    "fill",
    "rgb(20, 32, 51)",
  );
  await expect(page.locator(".react-flow__edge-path")).toHaveCSS(
    "stroke",
    "rgb(219, 234, 254)",
  );
  await expect(page.getByTestId("dirty")).toHaveText("false");

  await page.getByText("Projects", { exact: true }).click();
  await page.getByRole("button", { name: "View definition" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(20, 32, 51)",
  );
  await page.getByRole("button", { name: "Close definition" }).click();

  await page.getByTestId("mode").click();
  await page
    .locator('[data-id="projects"]')
    .getByText("Projects", { exact: true })
    .click();
  await page.getByRole("button", { name: "Teal" }).click();
  await expect(page.locator(".schema-canvas__table-card--teal")).toHaveCSS(
    "background-color",
    "rgb(21, 55, 56)",
  );
  await expect(page.locator(".schema-canvas__editor")).toHaveCSS(
    "background-color",
    "rgb(20, 32, 51)",
  );
  await page.addStyleTag({
    content: "ul { list-style: none; } li::marker { color: white; }",
  });
  await clickAdd(page, "Add note");
  await page.getByLabel("Markdown").fill("# Reminder\n\n- planet\n- moon");
  const note = page.locator(".schema-canvas__annotation-card--note");
  const noteBackground = await note.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(noteBackground).not.toBe("rgb(255, 255, 255)");
  await expect(note.locator("ul")).toHaveCSS("list-style-type", "disc");
  const markerColor = await note
    .locator("li")
    .first()
    .evaluate((element) => getComputedStyle(element, "::marker").color);
  expect(markerColor).toBe(
    await note
      .locator("li")
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  );
  expect(markerColor).not.toBe(noteBackground);

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "light");
  await expect(canvas).toHaveCSS("background-color", "rgb(248, 250, 252)");
});

test("hosts can control the theme through the switch callback", async ({
  page,
}) => {
  await page.goto("/?controlledTheme");
  const canvas = page.locator(".schema-canvas");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("dirty")).toHaveText("false");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(canvas).toHaveAttribute("data-theme", "light");
});

test("uncontrolled canvases can start in dark mode", async ({ page }) => {
  await page.goto("/?defaultDarkTheme");
  await expect(page.locator(".schema-canvas")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator(".schema-canvas")).toHaveAttribute(
    "data-theme",
    "light",
  );
});

test("Shift hint matches additive table selection", async ({ page }) => {
  await page.goto("/");
  const hint = page.locator(".schema-canvas__selection-hint");
  await expect(hint).toHaveCount(0);
  await page.getByTestId("mode").click();
  await expect(hint).toHaveCount(0);
  const table = page.locator('[data-id="projects"]');
  const box = await table.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + 18, { steps: 5 });
  await expect(hint.locator("kbd")).toHaveText("Shift");
  await expect(hint).toContainText("Click to select more");
  await page.mouse.up();
  await expect(hint).toHaveCount(0);
  await page.getByText("Projects", { exact: true }).click();
  await page
    .getByText("Accounts", { exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-id="projects"].selected')).toBeVisible();
  await expect(page.locator('[data-id="accounts"].selected')).toBeVisible();
  await page
    .locator('[data-id="accounts"]')
    .getByText("Accounts", { exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-id="accounts"].selected')).toHaveCount(0);
  await page
    .locator('[data-id="accounts"]')
    .getByText("Accounts", { exact: true })
    .click();
  await expect(page.locator('[data-id="projects"].selected')).toHaveCount(0);
});

test("moving selected tables is one undo step", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  const layout = page.getByTestId("layout");
  const before = JSON.parse((await layout.textContent()) ?? "{}");
  await page.getByText("Projects", { exact: true }).click();
  await page
    .getByText("Accounts", { exact: true })
    .click({ modifiers: ["Shift"] });
  const table = page.locator('[data-id="projects"]');
  const box = await table.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 58, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = JSON.parse((await layout.textContent()) ?? "{}");
      return (
        after.projects?.x !== before.projects?.x &&
        after.accounts?.x !== before.accounts?.x
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => {
      const after = JSON.parse((await layout.textContent()) ?? "{}");
      return (
        after.projects?.x === before.projects?.x &&
        after.accounts?.x === before.accounts?.x
      );
    })
    .toBe(true);
});

test("search finds and focuses a table in read-only mode", async ({ page }) => {
  await page.goto("/");
  const searchButton = page.getByRole("button", { name: "Search tables" });
  const box = await searchButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeLessThan(60);
  expect(box!.y).toBeLessThan(70);

  await searchButton.click();
  const search = page.getByRole("searchbox", { name: "Search tables" });
  await search.fill("PROJ");
  await page.getByRole("button", { name: "Projects projects" }).click();
  await expect(page.getByTestId("selected")).toHaveText("projects");
  await expect(page.locator('[data-id="projects"].selected')).toBeVisible();
  await expect(page.getByTestId("dirty")).toHaveText("false");
});

test("inspects source in read-only and writable modes", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Projects", { exact: true }).click();
  await page.getByRole("button", { name: "View definition" }).click();
  const dialog = page.getByRole("dialog", { name: "Projects View definition" });
  await expect(dialog.getByText("schema/projects.sql")).toBeVisible();
  await expect(dialog.getByLabel("schema/projects.sql source")).toContainText(
    "CREATE TABLE projects",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByTestId("mode").click();
  await page.getByRole("button", { name: "View definition" }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close definition" }).click();
  await expect(dialog).toHaveCount(0);
});

test("shows a source loading error", async ({ page }) => {
  await page.goto("/?sourceFailure=1");
  await page.getByText("Projects", { exact: true }).click();
  await page.getByRole("button", { name: "View definition" }).click();
  await expect(page.getByRole("alert")).toContainText("Source unavailable");
});

test("renders Markdown in notes and below table titles, with a color palette", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.getByText("Projects", { exact: true }).click();
  const editor = page.locator(".schema-canvas__editor");
  await editor
    .getByRole("textbox", { name: "Table Markdown" })
    .fill("## Purpose\n**Fictional** project records");
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-markdown h2'),
  ).toHaveText("Purpose");
  await editor.getByRole("button", { name: "Teal" }).click();
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-card--teal'),
  ).toBeVisible();
  await expect(page.getByTestId("layout")).toContainText(
    '"markdown":"## Purpose',
  );

  await clickAdd(page, "Add note");
  await page
    .locator(".schema-canvas__editor")
    .getByRole("textbox", { name: "Markdown" })
    .fill("# Heading\nA **bold** note");
  const note = page.locator(".schema-canvas__annotation-card--note");
  await expect(note.getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect(note.locator(".schema-canvas__markdown strong")).toHaveText(
    "bold",
  );
  await expect(editor.getByRole("textbox", { name: "Label" })).toHaveCount(0);

  await clickAdd(page, "Add text");
  await editor
    .getByRole("textbox", { name: "Markdown" })
    .fill("# Starship summary");
  await expect(
    page.locator(".schema-canvas__annotation-card--text h1"),
  ).toHaveText("Starship summary");
  await expect(editor.getByRole("textbox", { name: "Label" })).toHaveCount(0);
});

test("canvas shortcuts duplicate, copy, paste, undo and redo annotations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await clickAdd(page, "Add note");
  const notes = page.locator(".schema-canvas__annotation-card--note");
  await expect(notes).toHaveCount(1);
  await notes.first().click();
  await page.keyboard.press("Control+d");
  await expect(notes).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(notes).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(notes).toHaveCount(2);
  await notes.last().click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(notes).toHaveCount(3);
  await page.keyboard.press("Delete");
  await expect(notes).toHaveCount(3);
});

test("undo restores table appearance while Markdown editing keeps native keys", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await page.getByText("Projects", { exact: true }).click();
  const editor = page.locator(".schema-canvas__editor");
  const markdown = editor.getByRole("textbox", { name: "Table Markdown" });
  await markdown.fill("# Fictional projects");
  await markdown.press("Control+d");
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-markdown h1'),
  ).toHaveText("Fictional projects");
  await editor.getByRole("button", { name: "Teal" }).click();
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-card--teal'),
  ).toBeVisible();
  await page.locator(".schema-canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-card--standard'),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator('[data-id="projects"] .schema-canvas__table-markdown h1'),
  ).toHaveCount(0);
});

test("search crosses views and keeps the table editor clear of the dock", async ({
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
  expect(searchBox!.x + searchBox!.width).toBeLessThan(editorBox!.x);
});

test("trackpad pinch zooms over canvas content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__background")).toHaveCount(0);
  const backdrop = await page.locator(".react-flow").evaluate((element) => ({
    image: getComputedStyle(element).backgroundImage,
    size: getComputedStyle(element).backgroundSize,
  }));
  expect(backdrop.image).toContain("radial-gradient");
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
  await clickAdd(page, "Add note");
  await pinch(".schema-canvas__annotation-card--note");
  expect(
    await page.locator(".react-flow").evaluate((element) => ({
      image: getComputedStyle(element).backgroundImage,
      size: getComputedStyle(element).backgroundSize,
    })),
  ).toEqual(backdrop);
});

test("route exit flushes an immediate edit before closing the editor", async ({
  page,
}) => {
  await page.goto("/?saveDelay=200");
  await page.getByTestId("mode").click();
  await clickAdd(page, "Add note");
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
  await clickAdd(page, "Add note");
  await page.getByRole("button", { name: "Leave editor" }).click();
  await expect(page.getByTestId("save-error")).toHaveText("Save unavailable");
  await expect(page.getByTestId("dirty")).toHaveText("true");
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave editor" }).click();
  await expect(page.getByText("Editor closed")).toBeVisible();
  await expect(page.getByTestId("annotations")).toContainText('"kind":"note"');
});

test("a host unload guard can warn immediately after an edit", async ({
  page,
}) => {
  await page.goto("/?saveDelay=5000");
  await page.getByTestId("mode").click();
  await clickAdd(page, "Add note");
  const dialog = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 2000 }).catch(() => undefined);
  const warning = await dialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await reload;
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
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
  await clickAdd(page, "Add note");
  await expect(
    page.getByRole("button", { name: "Delete annotation" }),
  ).toBeVisible();
  await page.getByLabel("Markdown").fill("# Milestone");
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
        return (
          items.find((item) => item.markdown === "# Milestone")?.width ?? 0
        );
      })
      .toBeGreaterThan(340);
  }

  await page.getByRole("button", { name: "Delete annotation" }).click();
  await expect(page.getByText("Milestone", { exact: true })).toHaveCount(0);
});

test("Markdown notes keep lists and overflow readable", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode").click();
  await clickAdd(page, "Add note");
  await page
    .getByLabel("Markdown")
    .fill(
      [
        "Invariants",
        "- first item",
        "- second item",
        "",
        "Next paragraph with an_unbroken_identifier_that_must_wrap",
        "",
        ...Array.from({ length: 12 }, (_, index) => `Detail ${index + 1}.\n`),
      ].join("\n"),
    );
  await page.getByLabel("Markdown").blur();

  const note = page.locator(".schema-canvas__annotation-card--note").last();
  const body = note.locator(".schema-canvas__markdown p").first();
  await expect(note.locator("li")).toHaveCount(2);
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

test("Markdown markers and spacing survive host CSS resets in both modes", async ({
  page,
}) => {
  await page.goto("/");
  await page.addStyleTag({
    content: `
      ul, ol { list-style: none; padding: 0; }
      li { display: block; }
      li::marker { color: white; }
      h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }
      strong { font-weight: inherit; }
      em { font-style: normal; }
    `,
  });
  await page.getByTestId("mode").click();
  await page.getByText("Projects", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Table Markdown" })
    .fill("## Overview\n\n- first\n- second\n\n1. third");
  const tableMarkdown = page.locator(
    '[data-id="projects"] .schema-canvas__table-markdown',
  );
  await clickAdd(page, "Add note");
  await page
    .getByLabel("Markdown")
    .fill(
      [
        "# Field guide",
        "",
        "First paragraph with **bold** and *emphasis*.",
        "",
        "- planet",
        "  - moon",
        "- comet",
        "",
        "3. third",
        "4. fourth",
        "",
        "> Remember this",
        "",
        "```text",
        "an_unbroken_line_that_is_longer_than_the_note_width_and_needs_horizontal_scrolling",
        "```",
      ].join("\n"),
    );
  const note = page.locator(".schema-canvas__annotation-card--note").last();
  const markdown = note.locator(".schema-canvas__markdown");
  const assertFormatting = async () => {
    const bullets = markdown.locator("ul");
    await expect(bullets.first()).toHaveCSS("list-style-type", "disc");
    await expect(bullets.nth(1)).toHaveCSS("list-style-type", "circle");
    await expect(markdown.locator("ol")).toHaveCSS(
      "list-style-type",
      "decimal",
    );
    await expect(markdown.locator("ol")).toHaveAttribute("start", "3");
    await expect(markdown.locator("li").first()).toHaveCSS(
      "display",
      "list-item",
    );
    expect(
      await markdown
        .locator("li")
        .first()
        .evaluate((element) => getComputedStyle(element, "::marker").color),
    ).toBe(
      await markdown
        .locator("li")
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    );
    await expect(markdown.locator("h1")).toHaveCSS("font-weight", "650");
    await expect(markdown.locator("strong")).toHaveCSS("font-weight", "700");
    await expect(markdown.locator("em")).toHaveCSS("font-style", "italic");
    await expect(markdown.locator("p").first()).toHaveCSS(
      "white-space",
      "normal",
    );
    await expect(markdown.locator("p").first()).toHaveCSS(
      "margin-bottom",
      "6.6px",
    );
    await expect(markdown.locator("blockquote")).toHaveCSS(
      "border-left-style",
      "solid",
    );
    await expect(markdown.locator("pre")).toHaveCSS("overflow-x", "auto");
    await expect
      .poll(() =>
        markdown
          .locator("pre")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      )
      .toBe(true);
  };
  await assertFormatting();
  await expect(tableMarkdown.locator("ul")).toHaveCSS(
    "list-style-type",
    "disc",
  );
  await expect(tableMarkdown.locator("ol")).toHaveCSS(
    "list-style-type",
    "decimal",
  );
  await clickAdd(page, "Add text");
  await page.getByLabel("Markdown").fill("## Caption\n\n- moon\n- planet");
  const textMarkdown = page.locator(
    ".schema-canvas__annotation-card--text .schema-canvas__markdown",
  );
  await expect(textMarkdown.locator("ul")).toHaveCSS("list-style-type", "disc");
  await page.getByTestId("mode").click();
  await assertFormatting();
  await expect(tableMarkdown.locator("ul")).toHaveCSS(
    "list-style-type",
    "disc",
  );
  await expect(textMarkdown.locator("ul")).toHaveCSS("list-style-type", "disc");
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
  markdown?: string;
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

test("a distant arrow can be kept dark from its selected editor", async ({
  page,
}) => {
  await page.goto("/?farArrow=1");
  await page.getByTestId("mode").click();
  const edge = page.locator(".react-flow__edge").first();
  await expect(edge).toHaveClass(/schema-canvas__edge--muted/);
  await edge.click();
  await expect(page.locator(".schema-canvas__port-pickers")).toHaveCount(0);
  await page.getByRole("button", { name: "Keep dark" }).click();
  await expect(edge).not.toHaveClass(/schema-canvas__edge--muted/);
  await expect(page.getByTestId("layout")).toContainText('"muted":false');
});

test("reconnecting highlights eligible ports and accepts a nearby drop", async ({
  page,
}) => {
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
  await page.mouse.move(portBox.x + portBox.width / 2, portBox.y - 80, {
    steps: 8,
  });
  await expect(page.locator(".schema-canvas--reconnecting")).toBeVisible();
  await expect(page.locator(".schema-canvas__handle--drop-target")).toHaveCount(
    8,
  );
  await page.mouse.move(portBox.x + portBox.width / 2, portBox.y - 32, {
    steps: 3,
  });
  await page.mouse.up();
  await expect(page.getByTestId("layout")).toContainText('"target":"top"');
  await expect(page.locator(".schema-canvas--reconnecting")).toHaveCount(0);
});
