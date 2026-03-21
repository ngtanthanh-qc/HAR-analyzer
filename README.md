<p align="center">
  <img src="icon.svg" width="120" height="120" alt="HAR-Analyzer">
</p>
<h1 align="center">HAR-Analyzer</h1>

<p align="center">
  <em>Forked from <a href="https://github.com/omega0verride/HAR-Viewer">omega0verride/HAR-Viewer</a> and evolved into a full-featured HTTP traffic analysis toolkit.</em>
</p>

<p align="center">
  Analyze HTTP traffic from HAR or JSON files with an interactive waterfall timeline, AI streaming decoder, performance insights, chatbot analytics, and traffic diffing — all client-side, zero dependencies.
</p>

---

## What changed from HAR-Viewer?

HAR-Analyzer is not just a viewer — it's a diagnostic tool. Key additions beyond the original:

- **SSE Streaming Decoder** — Reconstruct AI chatbot responses from SSE, ChatGPT JSON Patch, and Google proprietary streaming formats
- **AI Chat Analytics** — TTFT, tokens/sec, quality checks across all streaming requests
- **Modular architecture** — Refactored from a single 8700-line HTML file into 14 focused JS modules + separated CSS
- **Multi-format support** — OpenAI API, ChatGPT Web, Claude, Gemini API, Gemini Web, custom agents
- Everything else: diff/compare, performance insights, Fiddler/cURL/Postman export, AI chat assistant

## Quick Start

1. Clone: `git clone https://github.com/ngtanthanh-qc/HAR-analyzer.git`
2. Open `index.html` in a browser (or serve via local HTTP server)
3. Drop a HAR or JSON file onto the page

No build step. No npm install. No server required.

## Project Structure

```
HAR-Analyzer/
├── index.html              # HTML markup (~700 lines)
├── styles/
│   └── main.css            # All styles
├── scripts/
│   ├── core.js             # Global state & utilities
│   ├── data-loader.js      # HAR/JSON parsing & data processing
│   ├── body-viewer.js      # Body display (RAW/JSON/XML/HTML/Image/HEX/SSE)
│   ├── timeline.js         # Waterfall timeline & zoom
│   ├── detail-panel.js     # Request detail panel & headers
│   ├── diff.js             # HAR compare/diff engine
│   ├── export.js           # Export (cURL, Postman)
│   ├── ai-chat.js          # AI Chat assistant
│   ├── ai-analytics.js     # AI streaming analytics (TTFT, speed, quality)
│   ├── insights.js         # Performance insights (7 tabs)
│   ├── selection.js        # Row selection & multi-select
│   ├── filters.js          # Request filtering & regex
│   ├── fiddler-export.js   # Fiddler AutoResponder export + ZIP
│   └── init.js             # Initialization & keyboard shortcuts
└── samples/
    ├── har/                # Sample HAR files (Gemini, ChatGPT, etc.)
    └── custom/             # Sample custom JSON files
```

## Features

### SSE Streaming Decoder

View AI chatbot streaming responses as readable content instead of raw event data.

- **Assembled View** — Full AI response rendered as Markdown (code blocks with syntax highlighting + line numbers + copy, tables, headings, lists, dividers)
- **Events Table** — All SSE events with type badges, filterable by text or `/regex/`
- **Meta Tab** — Metadata events (trace_id, agent_updated, message_persisted) in formatted cards

**Auto-detected streaming formats:**

| Provider | Format |
|---|---|
| OpenAI API | `{"choices":[{"delta":{"content":"..."}}]}` |
| ChatGPT Web | JSON Patch delta encoding (`o: "append"`, `o: "patch"`) |
| Claude API | `{"type":"content_block_delta","delta":{"text":"..."}}` |
| Gemini API | `{"candidates":[{"content":{"parts":[{"text":"..."}]}}]}` |
| Gemini Web | Google proprietary `)]}'` chunked format (cumulative snapshots) |
| Custom | `{"answer":"..."}`, `{"text":"..."}`, plain text SSE |

Handles base64-encoded bodies and multi-level JSON escaping automatically.

### AI Chat Analytics

Evaluate AI chatbot performance from HAR captures:

| Tab | What it shows |
|---|---|
| **Overview** | SSE request count, avg/P50/P95 TTFT, speed, tokens, quality pass rate |
| **TTFT** | Time To First Token ranked list with color-coded bars |
| **Speed** | Tokens/sec analysis with percentile stats |
| **Compare** | Side-by-side table with best/worst highlighting |
| **Quality** | Per-request checklist: HTTP 2xx, stream complete, no errors, TTFT < 3s, speed > 10 tok/s |

### Performance Insights

7 analysis tabs: Overview (P50/P95/P99), Slowest requests, Largest responses, By Host, Status/Type distribution, Duplicates, Issues (missing cache, uncompressed, errors).

### HAR Diff / Compare

Load two files to compare. Classifies requests as added, removed, changed, or identical with duration and size deltas.

### Export

- **cURL Script** (.sh) — with headers and body
- **Postman Collection** (.json) — v2.1 with response examples
- **Fiddler AutoResponder** (.farx) — rules + .dat files as ZIP

### AI Chat Assistant

Chat with AI about your traffic data. Supports Claude, Gemini, ChatGPT, Grok, Azure with SSE streaming.

### Body Viewer

Resizable modal with format tabs: RAW, JSON (syntax-highlighted with line numbers), XML, HTML, Image, HEX, Decode B64, SSE.

### Core

- Waterfall timeline with zoom, scroll sync, measure tool
- HAR and custom JSON format support
- Request details: headers, body, timing breakdown
- Thread grouping with color coding
- Multi-select (Click, Ctrl+Click, Shift+Click, Ctrl+A)
- Advanced filters: method, URI (text/regex), status, duration range, type
- Dark theme throughout (including scrollbars)

## Keyboard Shortcuts

| Action | Key |
|---|---|
| Select row | `Click` |
| Toggle selection | `Ctrl+Click` |
| Range select | `Shift+Click` |
| Select all | `Ctrl+A` |
| Horizontal scroll | `Shift+Scroll` |
| Zoom | `+` / `-` |
| Open details | Click request ID |
| Close panels | `Escape` |

## Supported Input Formats

### HAR (HTTP Archive)

Standard `.har` files from Chrome DevTools, Firefox, etc. See [HAR 1.2 spec](http://www.softwareishard.com/blog/har-12-spec/).

### Custom JSON

Lightweight format for custom instrumentation:

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
    "requestHeaders": {"Content-Type": "application/json"},
    "responseHeaders": {"Content-Type": "application/json"},
    "requestBodyChunks": ["{ \"name\": \"Alice\" }"],
    "responseBodyChunks": ["{ \"id\": 1, \"name\": \"Alice\" }"],
    "responseContentLength": 512
  }
]
```

Or wrapped with a base path for external body files:

```json
{
  "requests_data_path": "C:/data/connections/",
  "requests": [...]
}
```

See [`samples/`](samples/) for examples.

## Credits

Originally forked from [omega0verride/HAR-Viewer](https://github.com/omega0verride/HAR-Viewer).

## License

[AGPL-3.0](LICENSE)
