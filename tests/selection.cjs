// Copyright 2026 airokz and contributors
// SPDX-License-Identifier: Apache-2.0
// Select all (Cmd/Ctrl+A) and Shift-constrained shapes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/google-chrome"),
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, "whiteboard.html")).href);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Keep drawing clear of the floating panels on the left and top.
    await page.evaluate(() => {
      view = { x: 300, y: 150, z: 1 };
      render();
    });
    const nodesNow = () => page.evaluate(() => JSON.parse(JSON.stringify(nodes)));
    const last = async () => (await nodesNow()).at(-1);
    // World coordinates to page coordinates, so tests do not depend on the toolbar height.
    const screen = (x, y) =>
      page.evaluate(
        ([x, y]) => {
          const r = canvas.getBoundingClientRect();
          return { x: r.left + view.x + x * view.z, y: r.top + view.y + y * view.z };
        },
        [x, y],
      );
    const drag = async (from, to, shift = false) => {
      const a = await screen(from.x, from.y),
        b = await screen(to.x, to.y);
      await page.mouse.move(a.x, a.y);
      if (shift) await page.keyboard.down("Shift");
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 });
      await page.mouse.up();
      if (shift) await page.keyboard.up("Shift");
    };
    const near = (actual, expected, label) =>
      assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} ≠ ${expected}`);

    // Shift + draw: perfect square from a wide drag.
    await page.keyboard.press("r");
    await drag({ x: 100, y: 100 }, { x: 300, y: 180 }, true);
    let n = await last();
    assert.equal(n.type, "rect");
    assert.deepEqual([n.x, n.y, n.w, n.h], [100, 100, 200, 200]);

    // Shift + draw up and to the left: perfect circle anchored at the start point.
    await page.keyboard.press("o");
    await drag({ x: 700, y: 400 }, { x: 550, y: 340 }, true);
    n = await last();
    assert.equal(n.type, "ellipse");
    assert.deepEqual([n.x, n.y, n.w, n.h], [550, 250, 150, 150]);

    // Shift + click: square default diamond.
    await page.keyboard.press("d");
    const click = await screen(900, 100);
    await page.keyboard.down("Shift");
    await page.mouse.click(click.x, click.y);
    await page.keyboard.up("Shift");
    n = await last();
    assert.equal(n.type, "diamond");
    assert.deepEqual([n.w, n.h], [130, 130]);

    // Without Shift, shapes keep the dragged size.
    await page.keyboard.press("r");
    await drag({ x: 100, y: 500 }, { x: 300, y: 580 });
    n = await last();
    assert.deepEqual([n.x, n.y, n.w, n.h], [100, 500, 200, 80]);
    const freeRect = n.id;

    // Shift + resize keeps a shape's proportions; without Shift it resizes freely.
    await drag({ x: 300, y: 580 }, { x: 400, y: 600 }, true);
    n = (await nodesNow()).find((x) => x.id === freeRect);
    near(n.w / n.h, 2.5, "Shift resize ratio");
    near(n.w, 300, "Shift resize width");
    await drag({ x: n.x + n.w, y: n.y + n.h }, { x: 420, y: 700 });
    n = (await nodesNow()).find((x) => x.id === freeRect);
    assert.deepEqual([n.w, n.h], [320, 200]);

    // A free arrow and an arrow attached between the square and the circle.
    await page.evaluate(() => {
      const [square, circle] = nodes;
      nodes.push(
        { id: "free", type: "arrow", x: 900, y: 500, x2: 1000, y2: 560, from: null, to: null },
        { id: "link", type: "arrow", x: 0, y: 0, x2: 0, y2: 0, from: square.id, to: circle.id },
      );
      render();
    });
    const before = await nodesNow();

    // Cmd/Ctrl+A selects every object; arrow tool key "a" is not triggered.
    await page.keyboard.press("ControlOrMeta+a");
    assert.deepEqual(await page.evaluate(() => [selected, group.length, nodes.length, tool]), [
      null,
      before.length,
      before.length,
      "select",
    ]);
    assert.match(await page.locator("#selectionHint").textContent(), /6 objects selected/);
    assert.equal(await page.locator("#deleteBtn").isDisabled(), false);

    // Dragging any selected object moves the whole group; attached arrows stay attached.
    await drag({ x: 200, y: 200 }, { x: 240, y: 230 });
    const moved = await nodesNow();
    for (const o of before) {
      const m = moved.find((x) => x.id === o.id);
      if (o.type !== "arrow") {
        near(m.x - o.x, 40, `${o.type} x`);
        near(m.y - o.y, 30, `${o.type} y`);
      }
    }
    const free = moved.find((x) => x.id === "free"),
      link = moved.find((x) => x.id === "link");
    assert.deepEqual([free.x, free.y, free.x2, free.y2], [940, 530, 1040, 590]);
    assert.deepEqual([link.from, link.to], [before[0].id, before[1].id]);
    assert.equal(await page.evaluate(() => group.length), before.length);

    // The move is a single undo step.
    await page.keyboard.press("ControlOrMeta+z");
    assert.deepEqual(await nodesNow(), before);

    // Color applies to every selected shape (not arrows), as one undo step.
    await page.keyboard.press("ControlOrMeta+a");
    await page.locator('.swatch[title="Rose"]').click();
    const colored = await nodesNow();
    for (const m of colored) if (m.type !== "arrow") assert.equal(m.fill, "#fce5e7");
    await page.keyboard.press("ControlOrMeta+z");
    assert.deepEqual(await nodesNow(), before);

    // Delete removes everything at once; undo brings it all back.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    assert.deepEqual(await nodesNow(), []);
    await page.keyboard.press("ControlOrMeta+z");
    assert.deepEqual(await nodesNow(), before);

    // Escape and clicking empty canvas both clear the group.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => group.length), 0);
    await page.keyboard.press("ControlOrMeta+a");
    const empty = await screen(1050, 300);
    await page.mouse.click(empty.x, empty.y);
    assert.equal(await page.evaluate(() => group.length), 0);

    // Selecting one object after select-all leaves only that object selected.
    await page.keyboard.press("ControlOrMeta+a");
    const circleCenter = await screen(625, 325);
    await page.mouse.click(circleCenter.x, circleCenter.y);
    assert.deepEqual(await page.evaluate(() => [selected, group.length]), [before[1].id, 0]);

    // Inside the text editor, Cmd/Ctrl+A selects the text, not the drawing.
    const square = await screen(200, 200);
    await page.mouse.dblclick(square.x, square.y);
    await page.locator(".text-editor").fill("Hello");
    await page.keyboard.press("ControlOrMeta+a");
    assert.equal(await page.evaluate(() => group.length), 0);
    await page.keyboard.press("Escape");

    // With a single object, select-all selects it normally (with resize handles).
    await page.evaluate(() => {
      nodes = [nodes[0]];
      selected = null;
      render();
    });
    await page.keyboard.press("ControlOrMeta+a");
    assert.deepEqual(await page.evaluate(() => [selected, group.length]), [before[0].id, 0]);

    assert.deepEqual(errors, []);
    console.log(
      "PASS: Shift square/circle/diamond (drag, reverse drag, click), free and Shift-proportional resize, Cmd/Ctrl+A select all, group move with free and attached arrows, group color, group delete, undo per action, deselect by Esc and empty click, single click after select all, text-editor Cmd/Ctrl+A, single-object select all.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
