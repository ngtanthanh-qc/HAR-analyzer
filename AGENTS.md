# HAR-Viewer - Project Notes for Future LLMs

## IMPORTANT: Keep This File Updated
When making changes or adding new features to the codebase, always update this file to document:
- New functions or components
- Changes to existing functionality
- New edge cases or patterns discovered
- Any breaking changes or important implementation details
- **IMPORTANT**: Also update this file when you discover important things about how the codebase is designed while working on tasks - even small but significant design decisions, patterns, or architectural choices should be documented here so future agents understand the reasoning behind implementations

This ensures future LLMs have accurate context about the project.

**IMPORTANT**: Also keep `README.md` updated when adding or changing user-facing features, supported formats, keyboard shortcuts, or any other information that users need to know. The README is the public-facing documentation on GitHub.

## Overview
HAR-Viewer is an HTTP request timeline visualizer in a single HTML file (`index.html`). It loads request data from JSON files or HAR files and displays them in a waterfall timeline.

## Core Features

### 1. Timeline Visualization
- Waterfall timeline showing request start/end times
- Thread badges with 15-char truncation and hover tooltips
- Row selection: click, Ctrl+click (toggle), Shift+click (range), Ctrl+A (all)
- Zoom to selection works with both timeline clicks and row selections
- Base URI filter that strips common prefixes for display only

### 2. HAR File Support
- `convertHarToRequests()` converts HAR format to internal format
- Extracts headers from `entry.request.headers[]` and `entry.response.headers[]`
- Handles body content from:
  - `req.postData.text` for request body
  - `res.content.text` for response body
- **Critical**: Detects base64 encoding via `res.content.encoding === 'base64'`
- Stores `responseMimeType`, `responseEncoding`, and `responseOriginalBody` for body viewing
- Falls back: if HAR has no explicit encoding but mimeType starts with `image/`, assumes base64
- **Exception**: `image/svg+xml` is NOT treated as base64 (it's text/XML, not binary)

### 3. Body Viewer (Popup Dialog)
- Slides from right, 700px wide
- Format buttons: RAW, JSON, XML, HTML, Image, HEX
- HEX view shows hex on left, ASCII on right (16 bytes/row, padded)
- Size indicator calculated from actual content bytes
- Copy button with "Copied!" feedback
- Wrap toggle checkbox
- **Important**: Uses `<textarea>` for text formats (allows cursor navigation), separate `<div>` for images
- **MIME Type Fallback**: When loading JSON files (not HAR), MIME type is obtained from `responseHeaders['Content-Type']` if `responseMimeType` is not set
- Both popup body viewer and detail panel use this fallback logic

### 4. Request Details Panel (Inline)
- Embedded in detail panel with collapsible sections
- Section titles are larger (14px, bold, gray)
- Body section has:
  - Collapsible (collapsed by default)
  - Format buttons inline
  - Wrap checkbox
  - Copy button in header
  - 250px fixed height with scroll
- When no body chunks but bodyPath exists: shows collapsible with "Open" link

## Key Technical Edge Cases

### 1. Timeline Header and Ticks
- Timeline header width is `max(timelineWidth, visibleWidth)` to ensure header extends beyond last request when zoomed out
- Ticks are dynamically calculated based on effectiveWidth with ~120px minimum spacing
- Tick format: `DDTHH:mm:ss.SSS` (includes milliseconds for precision)
- `updateTimelineHeader()` function updates header width and ticks without full re-render
- `setupResizeHandler()` sets up window resize listener with 100ms debounce for dynamic tick updates
- `initResizer()` also calls `updateTimelineHeader()` during drag (50ms throttle) and on mouseup for detail panel resizing
- Tick count: `max(5, floor(effectiveWidth / 120))` - more ticks when zoomed in
- Mouse clicks and cursor tracking work beyond the last request (up to effectiveWidth)

### 2. Image Rendering
- HAR stores binary images as base64 in `content.text` with `encoding: "base64"`
- Image viewer uses `data:image/[type];base64,[data]` format for binary images
- **SVG Exception**: Uses `data:image/svg+xml;utf8,[URL-encoded-content]` instead of base64
- Three sources for base64 (in order):
  1. `currentBodyOriginal` - stored separately during HAR conversion
  2. `currentBodyContent` - if `encoding === 'base64'`
  3. Try to detect if mimeType is image and content looks like base64 (regex: `/^[A-Za-z0-9+/=]+$/`)
- Fallback: try `btoa()` encoding (rarely works with binary)

### 3. Type Column Detection
- Added "Type" column that detects content type from `Content-Type` response header
- `getTypeFromContentType()` function maps MIME types to short labels:
  - `application/json` → JSON
  - `image/*` → IMG (including SVG)
  - `application/xml`, `text/xml` → XML (but NOT image/svg+xml)
  - `text/html` → HTML
  - `text/*` → TEXT
  - `application/javascript` → JS
  - `application/css` → CSS
  - `font/*` → FONT
  - `application/pdf` → PDF
  - `zip/gzip/tar/rar` → ARCH
  - `application/octet-stream`, `binary` → BIN
  - Otherwise: extracts subtype (first 8 chars)
- Falls back to extracting from `responseMimeType` if no Content-Type header
- Type stored in `req.type` field
- **Important**: `image/` check must come before `xml` check to correctly classify `image/svg+xml` as IMG

### 4. HEX View Alignment
- Each row: 16 bytes × 3 chars = 48 chars for hex
- 2 spaces gap
- 16 chars for ASCII
- Last row padded with spaces to align ASCII column

### 5. Textarea vs div for body content
- Textarea for RAW/JSON/XML/HEX (allows cursor, selection, copy)
- Hidden div with innerHTML for images
- Must reset styles (display, justify-content, align-items) when switching from image to text
- Wrap toggle must use `whiteSpace: pre-wrap` and `word-break: break-all`

### 6. Collapsible Sections
- Use `collapsed` class on parent element
- CSS: `.detail-section.collapsed .collapsible-content { display: none; }`
- Toggle with `classList.toggle('collapsed')`
- Add `event.stopPropagation()` when click is on button inside collapsible title
- Make sure to have proper unique IDs for toggle (e.g., `detail_${uniqueId}`)

### 7. Escape HTML
- All user content (URIs, headers, body content) must be escaped with `escapeHtml()`
- Special care for hidden inputs storing base64 - must escape `&`, `<`, `>`, `"`, `'`

### 8. HAR Conversion
- Body chunks stored as arrays (`requestBodyChunks[]`, `responseBodyChunks[]`)
- For base64 content: keep original in `responseOriginalBody`, don't decode
- For text display: try to decode, if fails keep original base64

### 9. Body Popup Scroll Position
- When opening body modal, use `setSelectionRange(0, 0)` to reset cursor to top
- Use `requestAnimationFrame` to reset scroll after render if needed

### 10. Detail Panel Sticky Header
- Header uses `position: sticky; top: 0; z-index: 10;` to stay on top
- Must have `background` set on header for it to cover content when scrolling

### 11. Back-Forward Cache (bfcache) and File Inputs
- When navigating back/forward to the page, browser bfcache can leave file inputs in an inconsistent state where selecting a file doesn't trigger the change event properly
- Fix: Added `pageshow` event listener that clears both `fileInput` and `dropZoneFileInput` values when page is restored from bfcache
- This ensures file selection works correctly after back/forward navigation
- **Additional fix**: File inputs are now cleared after each file selection (success or error), allowing the same file to be re-selected after parse errors

### 12. Timezone Selection
- Added timezone dropdown in the filter row (after Base URI filter)
- Uses `Intl.supportedValuesOf('timeZone')` to populate all available IANA timezones
- Defaults to the user's system timezone
- `selectedTimezone` variable stores the current timezone selection ('local', 'utc', or IANA timezone name)
- `handleTimezoneChange()` triggers a timeline re-render when timezone changes
- `populateTimezoneSelect()` populates the dropdown on page load
- **Compatibility fallback**: If `Intl.supportedValuesOf` is unavailable (older browsers), timezone options gracefully fall back to `Local` and `UTC` so page initialization does not break
- `formatTimestamp(timestamp, format)` function centralizes all timestamp formatting:
  - `'table'`: `DD/MM HH:mm:ss.SSS` - for table rows
  - `'short'`: `HH:mm:ss` - for time-only display
  - `'header'`: `DDTHH:mm:ss.SSS` - for timeline header and cursor
  - `'detail'`: `YYYY-MM-DD HH:mm:ss.SSS` - for detail panel
- Uses `Intl.DateTimeFormat` for arbitrary timezone conversion

### 13. Safari Compatibility (Local HTML)
- Some Safari versions fail early when parsing modern JS syntax in inline scripts (notably optional chaining `?.` and nullish coalescing `??`)
- For widest compatibility when opening `index.html` directly via `file://`, prefer explicit null checks (`a && a.b`) and ternary checks over `?.`/`??`
- Keep compatibility fallbacks in startup code (timezone setup, feature detection) so initialization never aborts on older engines

### 5. Fiddler AutoResponder Export
- Export button appears in the bottom bar after data is loaded
- Opens a dialog with configurable options:
  - **Export Path**: Absolute path where the user will extract the zip (required). Fiddler requires absolute file paths for action files; this path is prefixed to all generated `.dat` file references in the rules.
  - **Export Scope**: All filtered requests or selected requests only
  - **Match Options**: Exact match URI, case-sensitive URI, match only once
  - **Response Options**: Include response delay (latency), override Content-Length
  - **Override Response Headers**: Add/remove response headers dynamically
- Generates a `.zip` file containing:
  - `rules.farx` - Fiddler AutoResponder XML file with all rules
  - `responses/<id>_response.dat` - Response data files (status line + headers + body)
- **Action file resolution**:
  - If a request has `responseBodyPath` (already on disk), that path is used directly as the Fiddler action (no `.dat` file generated)
  - Otherwise, a `.dat` file is generated containing the status line, headers, and body, and the action points to `<exportPath>/responses/<id>_response.dat`
- **X-AutoResponder-ActionFile header**: Each generated `.dat` file includes this header pointing to its own absolute path (matching Fiddler's convention from `FiddlerExportEngine.java`)
- Rule XML generation ported from `FiddlerExportEngine.java` / `FiddlerRule.java`
- Uses a minimal vanilla JS ZIP generator (store-only, no compression)
- Key functions:
  - `openFiddlerExportDialog()` - Opens the export configuration dialog
  - `closeFiddlerExportDialog()` - Closes the dialog
  - `executeFiddlerExport()` - Builds rules and downloads zip
  - `buildFiddlerRuleXML(rule)` - Generates XML for a single rule
  - `buildFiddlerRuleMatch(rule)` - Builds the Match attribute value
  - `buildResponseDatContent(req, options, actionFilePath)` - Builds response .dat file content
  - `fiddlerXmlEscape(text)` / `fiddlerRegexEscape(s)` - Escaping utilities
  - `downloadAsZip(files, zipName)` - Minimal ZIP file generator
  - `addExportOverrideHeader()` / `getExportOverrideHeaders()` - Override header management

## JSON Format Fields
- **Required**: `id`, `uri`, `method`, `statusCode`, `startRequestTimestamp`, `beginResponseTimestamp`, `endResponseTimestamp`, `threadId`
- **Additional**: `statusMessage`, `requestHeaders`, `responseHeaders`, `requestBodyPath`, `responseBodyPath`, `requestBodyChunks[]`, `responseBodyChunks[]`, `responseContentLength`
- **Path vs Chunks**: `requestBodyPath`/`responseBodyPath` and `requestBodyChunks[]`/`responseBodyChunks[]` are interchangeable. Chunks contain the actual content inline; paths are links to external files (to save memory). When paths are used, `requests_data_path` in the object format provides the base directory.
- **responseContentLength**: Response body size in bytes. Shown in the "Size" table column and detail panel. Formatted with `formatBytes()` (B, KB, MB, GB). For HAR files, mapped from `res.content.size` (preferred) or `res.bodySize` as fallback.

## File Structure
```
./
  index.html   - Single file containing all HTML, CSS, JS
  AGENTS.md    - This file
```

## Testing
- HAR test file: `./samples/www.softwareishard.com.har` (contains image responses)
- Image mimeTypes tested: image/jpeg, image/png
- Verify: RAW shows base64 string, Image renders correctly, JSON/XML parse properly

## Code Patterns

### Event Delegation
Use event delegation instead of inline onclick handlers where possible. For click interactions on dynamically created elements, use proper delegation or unique IDs.

### CSS Classes Used
- `.detail-panel` - main panel container
- `.detail-panel-header` - sticky header with z-index
- `.detail-section` - sections within panel
- `.detail-section.collapsed` - collapsed state
- `.collapsible-content` - content hidden when collapsed
- `.format-btn` - format selection buttons
- `.format-btn.active` - active format button (cyan background)
- `.body-no-wrap` / `.body-wrap` - text wrapping styles

### Key Functions
- `convertHarToRequests(har)` - HAR to internal format
- `showBodyModal(type, content, id, mimeType, encoding, originalBody)` - opens body popup
- `setBodyFormat(format)` - handles format switching in popup
- `getDetailBodySection(req, bodyType)` - generates inline body HTML
- `setDetailBodyFormat(btn, uniqueId)` - handles format switching in detail panel
- `toggleDetailBodyWrap(uniqueId)` - wrap toggle in detail panel
- `escapeHtml(str)` - escape user content
- `updateTimelineHeader()` - updates header width and ticks without full re-render
- `updateStickyColumns()` - reads actual rendered `offsetLeft` of each sticky `th` and applies it as `left` style to all `th`/`td` in that column; called after render, resizer drag, and window resize. **Do not hardcode `left` values in CSS** — column widths are dynamic (can shrink when space is tight) so offsets must be measured at runtime.
- `setupResizeHandler()` - sets up window resize listener for dynamic tick updates
- `zoomToFit()` - uses binary search to find optimal zoom level that fits timeline to visible width (works zooming in or out)
- `sliderToWidth(value)` / `widthToSlider(width)` - logarithmic conversion between slider value (0-100) and timeline width (500-2M px)
- `formatTimestamp(timestamp, format)` - formats timestamp based on selected timezone (local/utc)
- `handleTimezoneChange()` - handles timezone dropdown changes
- `formatBytes(bytes)` - formats byte count to human-readable string (B, KB, MB, GB)

### Preloading Data
The app supports embedding JSON or HAR data directly into the HTML file for automatic loading:

1. **HTML element**: `<script id="preloadData" type="application/json">` (line ~899 in index.html)
2. **How it works**: The `checkPreloadedData()` function runs on page load, parses the contents of this script tag, and loads the data automatically
3. **Usage**: Replace the empty contents with your JSON array or HAR object (minified or pretty-printed)

Example for embedding custom JSON:
```html
<script id="preloadData" type="application/json">
[{"id":1,"uri":"http://localhost:3000/api/users","method":"GET","statusCode":200,"...":...}]
</script>
```

Example for embedding HAR:
```html
<script id="preloadData" type="application/json">
{"log":{"entries":[{"startedDateTime":"...","time":150,"request":{"url":"...","method":"GET",...},...}]}}
</script>
```

### CRITICAL: Dual Body Viewers Must Be Updated Together
There are TWO body viewers in the app:
1. **Body Popup Dialog** - `setBodyFormat()` function (around line 1395)
2. **Detail Panel (inline)** - `setDetailBodyFormat()` function (around line 1600)

Both viewers have the same format buttons (RAW, JSON, XML, HTML, Image, HEX). When updating format logic:
- ALWAYS update BOTH functions simultaneously
- The HTML tab should render HTML (use innerHTML, white background)
- The XML tab should pretty-print with proper indentation
- The Image tab should render the actual image
- Style resets (background, color, display) must be applied in both viewers
