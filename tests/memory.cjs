// Copyright 2026 airokz and contributors
// SPDX-License-Identifier: Apache-2.0
// Targeted image-history and asynchronous decoded-cache lifecycle checks.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, "../whiteboard.html")).href);
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 16;
      c.getContext("2d").fillRect(0, 0, 32, 16);
      return c.toDataURL().split(",")[1];
    });
    await page
      .locator("#imageInput")
      .setInputFiles({
        name: "memory.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    await page.waitForFunction(() => nodes.length === 1 && images.size === 1);
    const source = await page.evaluate(() => nodes[0].src);
    // History snapshots must copy mutable nodes without serializing image strings.
    const copy = await page.evaluate(() => {
      const original = JSON.stringify;
      let result;
      JSON.stringify = () => {
        throw Error("History must not serialize embedded images");
      };
      try {
        const snapshot = state();
        remember();
        const oldX = nodes[0].x;
        snapshot.nodes[0].x += 10;
        result = {
          isolated: nodes[0].x === oldX,
          sameSource: snapshot.nodes[0].src === nodes[0].src,
        };
        history.pop();
      } finally {
        JSON.stringify = original;
      }
      return result;
    });
    assert.deepEqual(copy, { isolated: true, sameSource: true });
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => nodes.length), 0);
    assert.equal(
      await page.evaluate((s) => images.has(s), source),
      true,
      "redo-only image must remain cached",
    );
    await page.locator("#redoBtn").click();
    assert.equal(await page.evaluate(() => nodes[0].src), source);
    // Deletion leaves the image reachable from undo; expiring history releases it.
    await page.evaluate(() => {
      selected = nodes[0].id;
      render();
    });
    await page.locator("#deleteBtn").click();
    assert.equal(
      await page.evaluate((s) => images.has(s), source),
      true,
      "undo-only image must remain cached",
    );
    await page.evaluate(() => {
      for (let i = 0; i < 81; i++) remember();
      changed();
    });
    assert.equal(await page.evaluate(() => history.length), 80);
    assert.equal(
      await page.evaluate((s) => images.has(s), source),
      false,
      "expired image cache must be pruned",
    );
    // Control decode completion to reproduce document replacement while loading.
    const asyncResult = await page.evaluate(async (src) => {
      clearTimeout(saveTimer);
      const originalDecode = decode;
      let complete,
        calls = 0;
      decode = () => {
        calls++;
        return new Promise((resolve) => {
          complete = resolve;
        });
      };
      try {
        const image = { id: "delayed", type: "image", x: 0, y: 0, w: 32, h: 16, src };
        nodes = [image];
        history = [];
        future = [];
        images.clear();
        const first = loadImage(src),
          second = loadImage(src);
        const coalesced = first === second && calls === 1;
        nodes = [];
        pruneImages();
        complete({ complete: true, naturalWidth: 32 });
        await first;
        const staleDiscarded = !images.has(src) && !imageLoads.has(src);
        history = [{ nodes: [image], name: "History" }];
        const third = loadImage(src);
        complete({ complete: true, naturalWidth: 32 });
        await third;
        const historyRetained = images.has(src);
        history = [];
        pruneImages();
        const released = !images.has(src);
        return { coalesced, staleDiscarded, historyRetained, released };
      } finally {
        decode = originalDecode;
        nodes = [];
        history = [];
        future = [];
        images.clear();
      }
    }, source);
    assert.deepEqual(asyncResult, {
      coalesced: true,
      staleDiscarded: true,
      historyRetained: true,
      released: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: nonserializing isolated history snapshots, current/undo/redo image retention, history-limit pruning, pending decode coalescing and stale-result suppression.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
