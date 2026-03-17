# HAR-Viewer Roadmap

## Purpose

This document is a practical implementation roadmap for the next three major feature areas that would move HAR-Viewer beyond a basic waterfall viewer:

1. HAR diff
2. Performance insights
3. Replay and mock export

The current codebase is intentionally build-free and dependency-free. Any implementation should preserve that constraint unless there is a very strong reason not to.

## Why This Is a Roadmap Instead of a Single Change

Implementing all three areas end-to-end in one pass would be too broad and risky in the current codebase state. Each one touches data normalization, UI structure, and export logic. The correct move is to sequence them behind a small amount of internal groundwork.

## Current State Summary

- `index.html` still owns most application state and general app wiring.
- `scripts/body-viewer.js` owns popup/detail body rendering.
- `scripts/timeline.js` owns timeline rendering, zoom, sticky columns, tooltips, and timeline resize behavior.
- The app already has one export path: Fiddler AutoResponder export.
- The app already has selection, filtering, detail view, statistics popup, and request body access.

This means the next features should reuse the current normalized request model instead of inventing a separate second representation.

## Recommended Delivery Order

1. Internal groundwork
2. HAR diff
3. Performance insights
4. Replay and mock export

This order minimizes rework. HAR diff forces clearer dataset handling. Performance insights reuses normalized metrics. Replay export reuses normalized request and response material once the data model is cleaner.

---

## Phase 0: Internal Groundwork

### Goal

Make the codebase ready for larger features without rewriting the app.

### Required Changes

1. Extract selection and measurement logic from `index.html` into a dedicated script.
2. Introduce explicit dataset state instead of assuming a single loaded request array.
3. Centralize request normalization into a reusable function that can be run for one or more datasets.
4. Add dataset metadata support:
   - source name
   - source type (`har`, `json`, `preloaded`)
   - load timestamp
   - optional label supplied by user

### Suggested New Modules

- `scripts/request-model.js`
  - normalize raw HAR/custom JSON into one internal shape
  - produce summary metadata for each dataset
- `scripts/selection.js`
  - row selection
  - timeline selection
  - measure panel state
- `scripts/datasets.js`
  - current dataset registry
  - active dataset selection
  - helpers for one-file mode vs compare mode

### Internal Request Shape Additions

Keep the existing request shape, but add these optional fields:

- `sourceId`
- `sourceLabel`
- `requestKey`
- `host`
- `path`
- `queryString`
- `scheme`
- `port`
- `transferSize`
- `dnsTime`
- `connectTime`
- `sslTime`
- `waitTime`
- `receiveTime`
- `sendTime`

Notes:

- For HAR, populate timing components from `entry.timings` when available.
- For custom JSON, timing breakdown fields may remain `null`.
- `requestKey` should be stable and derived from method + normalized URI, with query handling configurable later.

### Acceptance Criteria

- Existing viewer behavior remains unchanged.
- One dataset still loads exactly as today.
- The app can internally track more than one dataset even if the UI does not expose compare mode yet.

---

## Phase 1: HAR Diff

### Goal

Allow users to compare two HAR or JSON captures and identify functional and timing differences.

### User Value

- Compare before/after deploy
- Compare local vs production
- Compare success run vs failing run
- Compare two browsers or environments

### Scope for V1

Support comparing two datasets loaded side-by-side or switched into a dedicated compare mode.

### Matching Strategy

Requests must be matched by a deterministic key. V1 should support:

1. `method + full URI`
2. Optional `method + URI without query`

Later versions can add fuzzy or sequential matching.

### Diff Categories

For each matched or unmatched request, classify as:

- only-in-left
- only-in-right
- matched-identical-ish
- matched-with-status-change
- matched-with-timing-change
- matched-with-header-change
- matched-with-size-change

### Metrics to Show

- request count delta
- matched count
- unmatched count
- status changes
- p50 / p95 / max duration delta
- total transfer size delta
- top regressions by absolute and percentage increase

### UI Proposal

Add a compare mode with:

1. Two file inputs or a second “Load compare file” action
2. Compare summary bar
3. Diff result table
4. Request-level detail panel showing left vs right values

### Suggested Scripts

- `scripts/diff.js`
  - dataset matching
  - diff classification
  - summary aggregation
  - render compare table

### Data Structures

Introduce a diff item structure:

```js
{
  key: 'GET https://example.com/api/users',
  left: Request | null,
  right: Request | null,
  diffType: 'only-in-left' | 'only-in-right' | 'matched',
  changed: {
    status: true,
    duration: true,
    headers: false,
    size: true,
    body: false
  },
  durationDeltaMs: 123,
  sizeDeltaBytes: 456
}
```

### V1 Non-Goals

- fuzzy request pairing by time
- visual waterfall overlay of two datasets
- full semantic JSON body diff

### Acceptance Criteria

- User can load two files and see summary counts.
- User can filter to changed, added, removed, slower, faster.
- Clicking a diff item opens a left/right detail comparison.
- Matching strategy can be switched between full URI and URI-without-query.

### Risks

- Request duplication causes ambiguous matching.
- Query strings may make matches too noisy.
- Large files may require pagination or capped rendering.

---

## Phase 2: Performance Insights

### Goal

Turn the viewer into a basic performance analysis tool instead of only a request explorer.

### User Value

- Find bottlenecks faster
- Spot third-party impact
- Identify missing caching and oversize responses
- Surface regressions without manually scanning rows

### Scope for V1

Add an insights panel or tab with aggregated findings over the active dataset.

### Suggested Insight Groups

1. Slowest requests
2. Largest responses
3. Most common endpoints
4. Requests grouped by host
5. Status code distribution
6. Content type distribution
7. Cacheability problems
8. Duplicate request patterns
9. Third-party domain impact
10. Timing breakdown summary when HAR timing fields exist

### Candidate Rules

#### Slow Requests
- highlight top N by duration
- highlight requests above configurable threshold

#### Payload Issues
- response size above threshold
- uncompressed text payloads when likely compressible

#### Caching Issues
- missing cache headers for static assets
- `cache-control: no-store` on static content
- suspicious repeated GETs for same resource

#### Third-Party Impact
- rank by total time and total bytes per host
- show third-party domains separately from first-party

#### Timing Breakdown
- average DNS, connect, SSL, wait, receive
- top requests by server wait time

### UI Proposal

Add a new bottom-bar action or top-level tab:

- `Insights`

The panel can reuse the existing popup/panel pattern. Avoid a brand-new layout system.

### Suggested Scripts

- `scripts/insights.js`
  - aggregate request metrics
  - compute findings
  - render cards and ranked lists

### Useful Aggregations

- by host
- by path template
- by status family
- by content type
- by request method

### Acceptance Criteria

- User can open an insights view for the active dataset.
- Insights show ranked slowest and largest requests.
- Host-level summary exists.
- Repeated request and likely cache issue heuristics exist.
- If HAR timing data exists, show timing breakdown summaries.

### V1 Non-Goals

- Lighthouse-style scoring
- Core Web Vitals estimation
- full page dependency graph

---

## Phase 3: Replay and Mock Export

### Goal

Allow the captured traffic to be reused outside the viewer for debugging, local development, and testing.

### User Value

- replay requests manually
- export curl commands
- create mock responses quickly
- build fixtures for tests
- improve current Fiddler export story

### Scope for V1

Build on top of the current export capabilities rather than replacing them.

### Recommended Deliverables

#### 1. cURL Export

Support export as:

- single selected request to curl
- multiple selected requests to a shell script

Requirements:

- include method
- include headers
- include request body when present
- properly escape shell content

#### 2. Postman Collection Export

Generate a minimal Postman Collection v2.1 JSON file from selected or filtered requests.

Requirements:

- request name
- method
- URL
- headers
- raw body

#### 3. Mock Bundle Export

Generate a static mock bundle that another tool can use. V1 can be intentionally simple.

Proposed output:

- `mock-routes.json`
- `responses/*.json` or `responses/*.txt`

Each route entry should contain:

- method
- matcher
- status
- headers
- body file path or inline body

#### 4. Improved Existing Fiddler Export

Optional improvements:

- export selected sequence ordering
- preserve body MIME metadata in generated package manifest
- include a small README inside the zip

### Suggested Scripts

- `scripts/replay-export.js`
  - curl generation
  - Postman collection export
  - mock manifest export
  - shared escaping utilities

### Replay Model

Add a transport-agnostic export structure:

```js
{
  id: 123,
  method: 'POST',
  url: 'https://example.com/api',
  requestHeaders: {...},
  requestBody: '...',
  responseStatus: 200,
  responseHeaders: {...},
  responseBody: '...',
  responseMimeType: 'application/json'
}
```

### Acceptance Criteria

- User can export one or many requests as curl.
- User can export selected requests as a Postman collection.
- User can export a mock bundle with manifest plus body files.
- Existing Fiddler export remains working.

### V1 Non-Goals

- true live HTTP replay from the browser
- embedded mock server runtime inside HAR-Viewer
- OpenAPI generation from bodies

---

## Cross-Cutting Concerns

### 1. Matching and Normalization

All three features depend on consistent request normalization. Do not duplicate URI parsing or header normalization in each module.

### 2. Large File Handling

Large HAR files will stress DOM rendering and diff calculation. Prefer:

- incremental computation
- lazy rendering for large lists
- capped preview counts with detail drill-down

### 3. Secret and PII Exposure

Before adding replay exports broadly, add redaction hooks or at least a secret warning. HAR often contains cookies, bearer tokens, and personal data.

### 4. Binary Bodies

Binary response bodies should not be blindly decoded for diff or export. Preserve original base64 where needed.

### 5. Browser Compatibility

Stay consistent with current compatibility style:

- avoid optional chaining and nullish coalescing in startup-critical paths
- keep logic safe when opening `index.html` directly from `file://`

---

## Suggested File Layout After These Features

```text
./
  index.html
  ROADMAP.md
  scripts/
    body-viewer.js
    timeline.js
    request-model.js
    selection.js
    datasets.js
    diff.js
    insights.js
    replay-export.js
```

## Implementation Milestones

### Milestone A

- extract selection logic
- introduce request normalization helpers
- add dataset registry

### Milestone B

- load compare dataset
- build diff engine
- render diff table and compare detail panel

### Milestone C

- add insights panel
- implement top slow, top large, host summary, repeated request analysis

### Milestone D

- add curl export
- add Postman collection export
- add mock bundle export

---

## Recommended Prompt For The Next AI

If another model is asked to continue, use this objective:

> Implement the roadmap in `ROADMAP.md` incrementally, starting with Milestone A only. Preserve the build-free static architecture, reuse the existing normalized request model, and avoid rewriting unrelated parts of the app. Update `AGENTS.md` as modules and behavior change.

## Recommended First Concrete Task

If only one next task should be assigned, choose this:

1. Extract selection/measure logic from `index.html` into `scripts/selection.js`
2. Add `scripts/request-model.js` for reusable normalization
3. Introduce dataset metadata support for future compare mode

That is the highest-leverage prerequisite for all three larger features.