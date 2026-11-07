// Copyright 2026 airokz and contributors
// SPDX-License-Identifier: Apache-2.0
// Mouse-driven regression tests for persistent, arbitrary perimeter anchors.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome'),headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1050}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../whiteboard.html')).href);await page.context().setOffline(true);
    const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:16});await page.mouse.up()};
    const screen=p=>page.evaluate(p=>({x:p.x*view.z+view.x,y:p.y*view.z+view.y+72}),p);
    const state=()=>page.evaluate(()=>{const a=nodes.find(n=>n.type==='arrow');return JSON.parse(JSON.stringify({a,points:ends(a),nodes}))});
    const shape=id=>page.evaluate(id=>JSON.parse(JSON.stringify(get(id))),id);
    const point=async(id,x,y)=>{const n=await shape(id);return{x:n.x+n.w*x,y:n.y+n.h*y}};
    const endpoint=async i=>screen((await state()).points[i]);
    const near=(actual,expected,message)=>assert.ok(Math.abs(actual.x-expected.x)<.02&&Math.abs(actual.y-expected.y)<.02,`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    for(const [type,x,y] of [['rect',350,280],['ellipse',850,280],['diamond',850,650]]){
      await page.locator(`[data-tool=${type}]`).click();await drag({x,y},{x:x+200,y:y+160});
    }
    const [rect,ellipse,diamond]=await page.evaluate(()=>nodes.map(n=>n.id));
    await page.locator('[data-tool=arrow]').click();
    await drag(await screen(await point(rect,1,.25)),await screen(await point(ellipse,0,.5)));
    let s=await state();assert.equal(s.a.from,rect);assert.equal(s.a.to,ellipse);
    near(s.a.fromAnchor,{x:1,y:.25},'creation stores arbitrary source position');
    near(s.points[0],await point(rect,1,.25),'creation renders exact chosen source');
    const opposite=JSON.parse(JSON.stringify(s.a.toAnchor));
    // Different positions on the same edge, then every other rectangle side.
    for(const [x,y] of [[1,.75],[1,.4],[0,.2],[.3,0],[.8,1]]){
      await drag(await endpoint(0),await screen(await point(rect,x,y)));s=await state();
      assert.equal(s.a.from,rect);near(s.a.fromAnchor,{x,y},'rectangle anchor');
      near(s.points[0],await point(rect,x,y),'rectangle endpoint');
      assert.deepEqual(s.a.toAnchor,opposite);
    }
    const beforeUndo=s.a.fromAnchor;
    await drag(await endpoint(0),await screen(await point(rect,0,.7)));
    await page.locator('#undoBtn').click();assert.deepEqual((await state()).a.fromAnchor,beforeUndo);
    await page.locator('#redoBtn').click();near((await state()).a.fromAnchor,{x:0,y:.7},'redo anchor');
    // Curved and slanted outlines retain the picked point rather than aiming at the other shape.
    for(const [x,y] of [[.8,.1],[.9,.8],[.1,.8]]){
      await drag(await endpoint(1),await screen(await point(ellipse,x,y)));s=await state();
      assert.equal(s.a.to,ellipse);near(s.points[1],await point(ellipse,x,y),'ellipse endpoint');
    }
    for(const [x,y] of [[.7,.2],[.8,.7],[.2,.7],[.3,.2]]){
      await drag(await endpoint(1),await screen(await point(diamond,x,y)));s=await state();
      assert.equal(s.a.to,diamond);near(s.a.toAnchor,{x,y},'diamond anchor');
      near(s.points[1],await point(diamond,x,y),'diamond endpoint');
    }
    const anchors={from:s.a.fromAnchor,to:s.a.toAnchor};
    // Moving the destination changes only the endpoint's world location.
    await drag(await screen(await point(diamond,.5,.5)),await screen(await point(diamond,.5,.5)).then(p=>({x:p.x+50,y:p.y-30})));
    s=await state();assert.deepEqual(s.a.toAnchor,anchors.to);near(s.points[1],await point(diamond,anchors.to.x,anchors.to.y),'moved anchor');
    // Resize source and destination with real corner handles.
    for(const id of [rect,diamond]){
      const middle=await screen(await point(id,.5,.5));await page.mouse.click(middle.x,middle.y);
      const corner=await screen(await point(id,1,1));await drag(corner,{x:corner.x+60,y:corner.y+35});
    }
    s=await state();assert.deepEqual(s.a.fromAnchor,anchors.from);assert.deepEqual(s.a.toAnchor,anchors.to);
    near(s.points[0],await point(rect,anchors.from.x,anchors.from.y),'resized source anchor');
    near(s.points[1],await point(diamond,anchors.to.x,anchors.to.y),'resized destination anchor');
    const downloadPromise=page.waitForEvent('download');await page.locator('#saveBtn').click();const file=await(await downloadPromise).path();
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    const savedArrow=saved.nodes.find(n=>n.type==='arrow');assert.deepEqual(savedArrow.fromAnchor,anchors.from);assert.deepEqual(savedArrow.toAnchor,anchors.to);
    page.once('dialog',d=>d.accept());await page.locator('#newBtn').click();await page.locator('#fileInput').setInputFiles(file);await page.waitForFunction(()=>nodes.some(n=>n.type==='arrow'));
    await page.waitForTimeout(650);await page.reload();s=await state();
    assert.deepEqual(s.a.fromAnchor,anchors.from);assert.deepEqual(s.a.toAnchor,anchors.to);
    near(s.points[0],await point(rect,anchors.from.x,anchors.from.y),'reloaded anchor');
    // Old JSON files retain automatic endpoints, and can be upgraded by dragging either end.
    delete savedArrow.fromAnchor;delete savedArrow.toAnchor;
    await page.locator('#fileInput').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>!nodes.find(n=>n.type==='arrow').fromAnchor);
    s=await state();assert.equal(s.a.from,rect);assert.equal(s.a.to,diamond);
    assert.ok(s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    await drag(await endpoint(0),await screen(await point(rect,1,.2)));s=await state();
    near(s.a.fromAnchor,{x:1,y:.2},'legacy upgraded anchor');
    assert.equal(s.a.to,diamond);assert.deepEqual(errors,[]);
    console.log('PASS: arbitrary same-edge and all-side rectangle anchors, ellipse/diamond perimeters, creation, movement/resizing, opposite anchor preservation, undo/redo, JSON/reload, legacy file editing.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
