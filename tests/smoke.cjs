// Copyright 2026 airokz and contributors
// SPDX-License-Identifier: Apache-2.0
// Uses an existing Playwright installation and system Chrome; no server required.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[], network=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('request', r=>{if(/^https?:/.test(r.url()))network.push(r.url())});
    await page.goto(pathToFileURL(path.join(root,'whiteboard.html')).href);
    await page.context().setOffline(true);
    assert.equal(/[А-Яа-яЁё]/.test(await page.locator('body').innerText()),false,'UI must be English');
    const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(nodes)));
    const drag=async(x,y,dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up()};
    await page.locator('[data-tool=rect]').click();
    await drag(350,250,200,110);
    assert.equal((await snapshot())[0].type,'rect');
    await page.mouse.dblclick(440,300);
    await page.locator('textarea').fill('API <gateway> & meeting');
    await page.locator('textarea').press('Control+Enter');
    assert.equal((await snapshot())[0].text,'API <gateway> & meeting');
    assert.equal(await page.locator('gateway').count(),0);
    // Make a recognizable, non-square local test screenshot.
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=160;const x=c.getContext('2d');x.fillStyle='#e3f3ed';x.fillRect(0,0,320,160);x.fillStyle='#234a42';x.font='24px sans-serif';x.fillText('Screenshot / icon',28,75);return c.toDataURL().split(',')[1]});
    await page.locator('#imageInput').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>nodes.length===2&&nodes[1].type==='image');
    let img=(await snapshot())[1];
    assert.equal(img.w/img.h,2);
    await drag(img.x+img.w/2,img.y+img.h/2+72,100,50);
    let moved=(await snapshot())[1];
    assert.equal(moved.x,img.x+100);assert.equal(moved.y,img.y+50);
    await drag(moved.x+moved.w,moved.y+moved.h+72,100,50);
    let resized=(await snapshot())[1];
    assert.equal(resized.w,moved.w+100);assert.equal(resized.h,moved.h+50);
    await page.locator('#undoBtn').click();assert.equal((await snapshot())[1].w,moved.w);
    await page.locator('#redoBtn').click();assert.equal((await snapshot())[1].w,resized.w);
    // Exercise clipboard and drag/drop handlers with real browser File objects.
    await page.evaluate(b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'paste.png',{type:'image/png'}));document.getElementById('board').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))},png);
    await page.waitForFunction(()=>nodes.length===3);
    await page.evaluate(b64=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'drop.png',{type:'image/png'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,clientX:1080,clientY:300,bubbles:true,cancelable:true}))},png);
    await page.waitForFunction(()=>nodes.length===4);
    // SVG is rasterized; external image/script references must not cause requests.
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#5956df"/><image href="https://example.invalid/external.png" width="40" height="40"/><script>alert(1)</script></svg>';
    await page.locator('#imageInput').setInputFiles({name:'icon.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
    await page.waitForFunction(()=>nodes.length===5);
    assert.ok((await snapshot())[4].src.startsWith('data:image/png;base64,'));
    await page.locator('#docName').fill('My local diagram');
    await page.locator('#board').click({position:{x:1250,y:700}});
    const before=await snapshot();
    const dl=page.waitForEvent('download');await page.locator('#saveBtn').click();const downloaded=await dl;
    const temp=await downloaded.path();const data=JSON.parse(await fs.readFile(temp,'utf8'));
    assert.deepEqual(data.nodes,before);assert.equal(data.name,'My local diagram');
    page.once('dialog',d=>d.accept());await page.locator('#newBtn').click();assert.equal((await snapshot()).length,0);
    await page.locator('#fileInput').setInputFiles(temp);
    await page.waitForFunction(()=>nodes.length===5);
    assert.deepEqual(await snapshot(),before);
    await page.waitForTimeout(650);await page.reload();
    assert.deepEqual(await snapshot(),before);
    assert.equal(await page.locator('#docName').inputValue(),'My local diagram');
    const dimensions=await page.evaluate(async()=>{const n=nodes.find(n=>n.type==='image');const im=new Image();im.src=n.src;await im.decode();return [im.naturalWidth,im.naturalHeight]});
    assert.deepEqual(dimensions,[320,160]);
    const exp=page.waitForEvent('download');await page.locator('#exportBtn').click();const exported=await exp;
    const bytes=await fs.readFile(await exported.path());assert.equal(bytes.subarray(1,4).toString(),'PNG');
    await page.locator('#fitBtn').click();await page.waitForTimeout(4200);
    await page.screenshot({path:path.join(root,'preview.png')});
    // Standalone text must retain focus after pointerdown, and save must commit it.
    page.once('dialog',d=>d.accept());await page.locator('#newBtn').click();
    await page.locator('[data-tool=text]').click();await page.mouse.click(400,400);
    await page.locator('textarea').fill('Editable standalone text');
    const textSave=page.waitForEvent('download');await page.locator('textarea').press('Control+s');
    const textData=JSON.parse(await fs.readFile(await (await textSave).path(),'utf8'));
    assert.equal(textData.nodes[0].text,'Editable standalone text');
    // Connections remain bound while their blocks move.
    await page.locator('[data-tool=rect]').click();await page.mouse.click(400,600);
    await page.locator('[data-tool=rect]').click();await page.mouse.click(850,600);
    await page.locator('[data-tool=arrow]').click();await drag(490,650,450,0);
    const arrowBefore=await page.evaluate(()=>{const a=nodes.find(n=>n.type==='arrow');return {a,ends:ends(a)}});
    assert.ok(arrowBefore.a.from&&arrowBefore.a.to);
    await drag(450,630,0,100);
    const arrowAfter=await page.evaluate(()=>ends(nodes.find(n=>n.type==='arrow')));
    assert.notEqual(arrowAfter[0].y,arrowBefore.ends[0].y);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    console.log('PASS: offline file://, shape + plain text, PNG import, mouse drag/resize, undo/redo, clipboard event, file drop, SVG rasterization, JSON download/reopen, reload autosave, source pixels preserved, PNG export, zero external requests/errors.');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
