# Dro

An offline whiteboard for quick diagrams during meetings. Open **whiteboard.html** directly in your browser. No installation, server, account, external libraries or internet connection is needed.

## Features

- Rectangles, ellipses, diamonds, text and arrows attached to objects.
- Add images and screenshots using the image button, file drag-and-drop or Cmd/Ctrl+V.
- Move images and resize them using corner handles. Aspect ratio is preserved; hold Shift to resize freely.
- Save and open editable JSON files with every image embedded.
- Export the whole diagram as PNG.
- Undo/redo, zoom, pan and best-effort browser autosave.

## Controls

| Key | Action |
| --- | --- |
| V | Select |
| H or Space + drag | Pan |
| R / O / D | Rectangle / ellipse / diamond |
| A | Arrow — drag from one object to another |
| T | Text |
| I | Add image |
| Cmd/Ctrl+S | Download diagram JSON |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Delete / Backspace | Delete selected object |

Select an arrow by clicking its line or either endpoint. Drag either round endpoint handle to any point along a shape outline to choose its attachment position, reconnect it to another shape, or drop it on empty canvas to detach it. Attachment points keep their relative positions when shapes move or resize. The opposite endpoint keeps its connection. Dragging the line itself moves the whole arrow and detaches both ends.

Double-click a shape to edit its label. Press Cmd/Ctrl+Enter to finish editing. Use the mouse wheel to zoom and Fit to show the whole diagram.

## Files and privacy

The HTML file is the application. The JSON file is your editable diagram, including embedded images; original image files are not required when reopening it. Saving downloads a new copy rather than overwriting the previously opened document. No diagram or image is uploaded anywhere.

Browser autosave is a convenience, not a backup. Browser storage can be unavailable, cleared or full, particularly with large images or private browsing. Save important work to JSON.

Image files up to 30 MB are converted to embedded PNG, with the longest edge limited to 4096 pixels. SVG icons are rasterized, and animated GIFs become still images. Clipboard paste requires image data, not just a copied file path; use file drag-and-drop when necessary.

## Development and verification

Edit `whiteboard.html` and reload it. There is no build step or runtime dependency.

Browser tests use Playwright Core and an installed Chrome browser:

```sh
npm install --no-save --package-lock=false playwright-core
node tests/smoke.cjs
node tests/arrows.cjs
node tests/anchors.cjs
```

Set `CHROME_PATH` if Chrome is installed at a nonstandard location. `PLAYWRIGHT_MODULE` can point to an existing Playwright Core installation. Tests open the app using `file://`, check image manipulation and file round-tripping, and verify that it makes no outgoing HTTP requests. Clipboard testing uses a browser ClipboardEvent with image data; OS clipboard permissions are not automated.
