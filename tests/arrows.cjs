// Copyright 2026 airokz and contributors
// SPDX-License-Identifier: Apache-2.0
// Regression coverage for selecting and independently reconnecting arrow ends.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'),headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../whiteboard.html')).href);
    await page.context().setOffline(true);
    const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:15});await page.mouse.up()};
    const current=()=>page.evaluate(()=>{const a=nodes.find(n=>n.type==='arrow');return {a:JSON.parse(JSON.stringify(a)),ends:ends(a),selected,view:{...view}}});
    const screen=async p=>page.evaluate(p=>({x:p.x*view.z+view.x,y:p.y*view.z+view.y+72}),p);
    const endpoint=async i=>screen((await current()).ends[i]);
    const center=async id=>screen(await page.evaluate(id=>{const n=get(id);return{x:n.x+n.w/2,y:n.y+n.h/2}},id));
    const deselect=()=>page.keyboard.press('Escape');
    for(const [x,y] of [[350,300],[850,300],[650,650]]){
      await page.locator('[data-tool=rect]').click();await drag({x,y},{x:x+140,y:y+100});
    }
    const ids=await page.evaluate(()=>nodes.map(n=>n.id));
    const [a,b,c]=ids;
    await page.locator('[data-tool=arrow]').click();await drag(await center(a),await center(b));
    let state=await current();assert.equal(state.a.from,a);assert.equal(state.a.to,b);
    const arrowId=state.a.id;
    // The arrow body is selectable, independently of its endpoint handles.
    await deselect();const ends=(await current()).ends;
    const middle=await screen({x:(ends[0].x+ends[1].x)/2,y:(ends[0].y+ends[1].y)/2});
    await page.mouse.click(middle.x,middle.y);assert.equal((await current()).selected,arrowId);
    const beforeBody=await current();
    await drag(middle,{x:middle.x+40,y:middle.y+60});state=await current();
    assert.equal(state.a.from,null);assert.equal(state.a.to,null);
    assert.equal(state.ends[0].x,beforeBody.ends[0].x+40);
    assert.equal(state.ends[1].y,beforeBody.ends[1].y+60);
    await page.locator('#undoBtn').click();assert.deepEqual((await current()).a,beforeBody.a);
    // Border hit priority must select the arrow, even when it was not selected.
    await deselect();let start=await endpoint(0);await page.mouse.click(start.x,start.y);
    state=await current();assert.equal(state.selected,arrowId,'unselected source endpoint must select arrow, not shape');
    assert.equal(state.a.from,a);assert.equal(state.a.to,b);
    // Source and destination reconnect independently; opposite ends are stable.
    await drag(await endpoint(0),await center(c));state=await current();
    assert.equal(state.a.from,c);assert.equal(state.a.to,b);
    await drag(await endpoint(1),await center(a));state=await current();
    assert.equal(state.a.from,c);assert.equal(state.a.to,a);
    // Start a drag directly on an unselected destination border.
    await deselect();await drag(await endpoint(1),await center(b));state=await current();
    assert.equal(state.a.from,c);assert.equal(state.a.to,b);assert.equal(state.selected,arrowId);
    const attached=state.a;
    const freePoint={x:1100,y:700};
    await drag(await endpoint(0),await screen(freePoint));state=await current();
    assert.equal(state.a.from,null);assert.equal(state.a.to,b);
    assert.ok(Math.abs(state.ends[0].x-freePoint.x)<1&&Math.abs(state.ends[0].y-freePoint.y)<1);
    await page.locator('#undoBtn').click();assert.deepEqual((await current()).a,attached);
    await page.locator('#redoBtn').click();assert.equal((await current()).a.from,null);
    await drag(await endpoint(0),await center(c));
    // Destination can detach as well, without disturbing the connected source.
    await drag(await endpoint(1),await screen({x:1150,y:350}));state=await current();
    assert.equal(state.a.from,c);assert.equal(state.a.to,null);
    await page.locator('#undoBtn').click();assert.equal((await current()).a.to,b);
    // Endpoint hit testing must use screen-space tolerance after zoom and pan.
    await page.locator('#zoomIn').click();
    await page.locator('[data-tool=hand]').click();await drag({x:1200,y:800},{x:1235,y:825});
    await page.locator('[data-tool=select]').click();await deselect();
    let end=await endpoint(1);end={x:end.x+3,y:end.y+2};
    await drag(end,await center(a));state=await current();
    assert.equal(state.a.from,c);assert.equal(state.a.to,a);
    const persisted=a=>Object.fromEntries(['id','type','from','to','x','y','x2','y2'].map(k=>[k,a[k]]));
    const saved=persisted(state.a);
    const pending=page.waitForEvent('download');await page.locator('#saveBtn').click();const download=await pending;
    const file=await download.path();const doc=JSON.parse(await fs.readFile(file,'utf8'));
    assert.deepEqual(persisted(doc.nodes.find(n=>n.type==='arrow')),saved);
    page.once('dialog',d=>d.accept());await page.locator('#newBtn').click();
    await page.locator('#fileInput').setInputFiles(file);await page.waitForFunction(()=>nodes.some(n=>n.type==='arrow'));
    assert.deepEqual(persisted((await current()).a),saved);
    await page.waitForTimeout(650);await page.reload();assert.deepEqual(persisted((await current()).a),saved);
    assert.deepEqual(errors,[]);
    console.log('PASS: arrow body/border selection, selected and unselected endpoint drag, independent reconnection, both detach directions, opposite binding preservation, undo/redo, zoom/pan hit testing, file roundtrip and reload.');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
