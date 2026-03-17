<p align="center">
  <img src="icon.svg" width="120" height="120" alt="HAR-Viewer">
</p>
<h1 align="center">HAR-Viewer (Upgraded Version)</h1>

> **Disclaimer:** This project is an upgraded version of the original repository: [omega0verride/HAR-Viewer](https://github.com/omega0verride/HAR-Viewer). It has been heavily enhanced with new features for deep traffic analysis, comparisons, and exports while maintaining the single-file, zero-dependency philosophy.

<p align="center">
  A single-file HTTP request timeline visualizer and analysis tool. Drop in a HAR or JSON file and get an interactive waterfall chart, performance insights, and diffing of your HTTP traffic — no server, no dependencies, no install.
</p>

## Quick Start

1. Download or clone this repository
2. Open `index.html` in any modern browser
3. Drop a HAR or JSON file onto the page (or click 'Select File' to browse)

That's it. Everything runs client-side in a single HTML file.

> **Note:** The single-file approach is intentional. No build step, no dependencies, no npm install — just drop the HTML file anywhere and it works. Sometimes the simplest solution is the best one.

## Features & Enhancements

This upgraded version includes several advanced features over the original:

- **HAR Diff / Compare Mode** ✨ — Load a second file to compare before/after data. Highlights added, removed, changed, and identical requests with side-by-side details, duration deltas, and size deltas.
- **Performance Insights** ✨ — Analyze your traffic with 7 insight tabs: Overview (P50/P95/P99, status counts), top Slowest & Largest requests, Host grouping, Status/Type distribution, Duplicate detection, and Issues scanner (missing cache headers, uncompressed responses, HTTP errors).
- **Advanced Export Menu** ✨ — Export your requests exactly how you need them:
  - **Fiddler Rules (.farx)**: Generate Fiddler AutoResponder rules along with `.dat` files for easy mock environments.
  - **cURL Script (.sh)**: Export selected or all requests as a bash script with `curl` commands (includes headers and body).
  - **Postman Collection (.json)**: Generate a Postman Collection v2.1 file with parsed URLs, headers, bodies, and response examples.
- **Enhanced Body Viewer** ✨ — Resizable dialog (drag the left edge), VSCode-like **JSON Syntax Highlighting** with line numbers, and formatted viewing for RAW, XML, HTML, Image, and HEX.
- **Base64 Decoding** ✨ — Automatic and reliable detection of Base64 encoded bodies (such as images, SVGs, or explicitly encoded content in HARs) and proper rendering in the UI without getting corrupted.

### Core Features

- **Waterfall timeline** — visualize request timing with start, response, and end markers
- **HAR support** — load `.har` files exported from Chrome DevTools, Firefox, or any HAR-compliant tool
- **JSON support** — use a simple JSON array/object format for custom instrumentation
- **Request details** — click any request to inspect headers, body content, and timing
- **Thread grouping** — see which requests ran on which threads
- **Multi-select** — click, Ctrl+click, Shift+click, or Ctrl+A to select rows
- **Zoom** — zoom into selections, scroll to zoom, or use the slider; zoom-to-fit button
- **Content type detection** — automatic type column (JSON, XML, HTML, IMG, JS, CSS, etc.)
- **Zero dependencies** — single HTML file, no build step, no server required
- **Dark theme** — easy on the eyes

## Screenshots

**JSON Syntax Highlighting & Resizable Body Viewer**
<br>
<img src="screenshots/body_viewer_json.png" width="800">

**HAR Diff Summary & Table**
<br>
<img src="screenshots/diff_summary.png" width="800">

**HAR Diff Left-vs-Right Detail Overlay**
<br>
<img src="screenshots/diff_detail.png" width="800">

**Advanced Export Dropdown**
<br>
<img src="screenshots/export_dropdown.png" width="800">

## Keyboard & Mouse Shortcuts

| Action | Shortcut |
|---|---|
| Select row | `Click` |
| Toggle selection | `Ctrl`+`Click` |
| Range select | `Shift`+`Click` |
| Select all | `Ctrl`+`A` |
| Horizontal scroll | `Shift`+`Scroll` |
| Zoom in/out | `+` / `-` |
| Open request details | Click request ID |

## Supported Formats

### 1. HAR (HTTP Archive)

Standard `.har` files as exported from browser DevTools. See the [HAR 1.2 spec](http://www.softwareishard.com/blog/har-12-spec/).

See the [`samples/har/`](samples/har/) folder for example HAR files.

### 2. Custom JSON format

The custom JSON format is designed to be lightweight and easy to generate and parse, with support for both inline content and external file references.  

It is simplier than HAR allowing for easier generation and integration with non-standard tools that do not export HAR (you do not have to implement the full HAR spec.).  

See the [`samples/custom/`](samples/custom/) folder for example JSON files.

A JSON array of request objects:

```json
[
  {
    "id": 1,
    "uri": "http://localhost:3000/api/users",
    "method": "GET",
    "statusCode": 200,
    "statusMessage": "OK",
    "startRequestTimestamp": 1704067200000,
    "beginResponseTimestamp": 1704067200150,
    "endResponseTimestamp": 1704067200200,
    "threadId": "main",
    "requestHeaders": "Content-Type: application/json\nAuthorization: Bearer ...",
    "responseHeaders": "Content-Type: application/json\nContent-Length: 512",
    "requestBodyChunks": ["{ \"name\": \"Alice\" }"],
    "responseBodyChunks": ["{ \"id\": 1, \"name\": \"Alice\" }"],
    "requestBodyPath": "req_body_1.json",
    "responseBodyPath": "res_body_1.json",
    "responseContentLength": 512
  }
]
```

JSON Object:

Wraps the array in an object with an optional base path for body files:

```json
{
  "requests_data_path": "C:/data/connections/",
  "requests": [
    { "id": 1, "uri": "http://localhost:3000/api/users", "..." : "..." }
  ]
}
```

### Field Reference

| Field | Description |
|---|---|
| `id` | Unique request identifier |
| `uri` | Request URL |
| `method` | HTTP method (GET, POST, etc.) |
| `statusCode` | HTTP response status code |
| `statusMessage` | HTTP response status text (e.g. "OK") |
| `startRequestTimestamp` | Request start time (epoch ms) |
| `beginResponseTimestamp` | First response byte time (epoch ms) |
| `endResponseTimestamp` | Response complete time (epoch ms) |
| `threadId` | Thread or connection identifier |
| `requestHeaders` | Request headers as a newline-separated string |
| `responseHeaders` | Response headers as a newline-separated string |
| `requestBodyChunks` | Array of strings containing the request body |
| `responseBodyChunks` | Array of strings containing the response body |
| `requestBodyPath` | File path to the request body content |
| `responseBodyPath` | File path to the response body content |
| `responseContentLength` | Response body size in bytes |

> **Note:** `requestBodyPath`/`responseBodyPath` and `requestBodyChunks[]`/`responseBodyChunks[]` are interchangeable. Chunks contain the actual body content inline. Paths are links to external files, useful for saving memory when bodies are large. When using paths, set `requests_data_path` in the object format to provide the base directory.

## License

[AGPL-3.0](LICENSE)
