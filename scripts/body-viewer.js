function getBodyCell(chunks, bodyPath, type, id, size) {
    const sizeLabel = `<div style="font-size:11px;color:#888;line-height:1;margin-top:1px;">${formatBytes(size)}</div>`;
    if (chunks && chunks.length > 0) {
        return `<button class="action-btn" onclick="event.stopPropagation(); showBodyContent(${id}, '${type}')">📄</button>${sizeLabel}`;
    } else if (bodyPath) {
        return `<a class="action-btn link" href="${getFileUrl(bodyPath)}" target="_blank" onclick="event.stopPropagation()">📄</a>${sizeLabel}`;
    }
    return '-';
}

function showBodyContent(id, type) {
    const req = allRequests.find(r => r.id === Number(id));
    if (!req) return;

    const chunks = type === 'request' ? req.requestBodyChunks : req.responseBodyChunks;
    if (!chunks || chunks.length === 0) return;

    const content = chunks.join('\n');
    const resHeaders = req.responseHeaders || {};
    const mimeType = type === 'response' ? (req.responseMimeType || resHeaders['Content-Type'] || resHeaders['content-type'] || '') : '';
    const encoding = type === 'response' ? req.responseEncoding : 'text';
    const originalBody = type === 'response' ? req.responseOriginalBody : null;
    showBodyModal(type, content, req.id, mimeType, encoding, originalBody);
}

let currentBodyContent = '';
let currentBodyFormat = 'raw';
let currentBodyMimeType = '';
let currentBodyEncoding = 'text';
let currentBodyOriginal = null;

function showBodyModal(type, content, id, mimeType = '', encoding = 'text', originalBody = null) {
    currentBodyContent = content;
    currentBodyFormat = 'raw';
    currentBodyMimeType = mimeType;
    currentBodyEncoding = encoding;
    currentBodyOriginal = originalBody;

    document.querySelectorAll('#bodyModal .format-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('#bodyModal .format-btn[data-format="raw"]').classList.add('active');

    const mimeInfo = mimeType ? ` (${mimeType})` : '';
    document.getElementById('bodyModalTitle').textContent = (type === 'request' ? 'Request' : 'Response') + ' Body - ID: ' + id + mimeInfo;
    const contentEl = document.getElementById('bodyContent');
    contentEl.value = content;
    contentEl.style.display = 'block';
    contentEl.oninput = function () { this.value = content; }; // Prevent edits
    requestAnimationFrame(() => {
        contentEl.scrollTop = 0;
        contentEl.scrollLeft = 0;
    });
    updateBodySizeIndicator();

    // Show SSE button if content looks like SSE or Google streaming format
    const sseBtn = document.getElementById('sseBtn');
    const looksSSE = mimeType.includes('event-stream') || /^(event|data):\s/m.test(content) || isGoogleStreamingFormat(content);
    sseBtn.style.display = looksSSE ? '' : 'none';

    // Show Decode button if content looks like base64
    const decodeBtn = document.getElementById('decodeBtn');
    const looksBase64 = /^[A-Za-z0-9+/=\s]+$/.test(content.trim()) && content.trim().length > 20;
    decodeBtn.style.display = (encoding === 'base64' || looksBase64) ? '' : 'none';

    document.getElementById('bodyBackdrop').classList.add('active');
    document.getElementById('bodyModal').classList.add('active');
    contentEl.focus();
    contentEl.setSelectionRange(0, 0);
}

function setBodyFormat(format) {
    currentBodyFormat = format;
    document.querySelectorAll('#bodyModal .format-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#bodyModal .format-btn[data-format="${format}"]`).classList.add('active');

    const contentEl = document.getElementById('bodyContent');

    // Reset styles from image view
    contentEl.style.display = 'block';
    contentEl.style.justifyContent = '';
    contentEl.style.alignItems = '';
    contentEl.scrollTop = 0;
    contentEl.scrollLeft = 0;

    // Apply wrap setting
    const wrapCheckbox = document.getElementById('wrapToggle');
    if (wrapCheckbox.checked) {
        contentEl.className = 'body-wrap';
    } else {
        contentEl.className = 'body-no-wrap';
    }

    // Hide JSON highlight div if it exists (will be shown only for JSON format)
    var jsonHighlight = document.getElementById('bodyJsonHighlight');
    if (jsonHighlight) jsonHighlight.style.display = 'none';

    // Remove image container if exists
    const imgContainer = document.getElementById('bodyImageContainer');
    if (imgContainer) imgContainer.remove();

    // Hide HTML container if exists
    const htmlContainer = document.getElementById('bodyHtmlContainer');
    if (htmlContainer) htmlContainer.style.display = 'none';

    // Hide SSE container if exists
    const sseContainer = document.getElementById('bodySseContainer');
    if (sseContainer) sseContainer.style.display = 'none';

    try {
        switch (format) {
            case 'json':
                try {
                    var obj = JSON.parse(currentBodyContent);
                    var formatted = JSON.stringify(obj, null, 2);
                    // Use highlighted div instead of textarea
                    contentEl.style.display = 'none';
                    var jsonEl = document.getElementById('bodyJsonHighlight');
                    if (!jsonEl) {
                        jsonEl = document.createElement('div');
                        jsonEl.id = 'bodyJsonHighlight';
                        contentEl.parentNode.insertBefore(jsonEl, contentEl.nextSibling);
                    }
                    jsonEl.className = 'json-highlighted' + (document.getElementById('wrapToggle').checked ? ' body-wrap' : '');
                    jsonEl.style.display = 'block';
                    jsonEl.innerHTML = syntaxHighlightJson(formatted);
                } catch (e) {
                    contentEl.value = currentBodyContent;
                }
                break;
            case 'xml':
                const xmlParser = new DOMParser();
                const xmlDoc = xmlParser.parseFromString(currentBodyContent, 'text/xml');
                if (xmlDoc.getElementsByTagName('parsererror').length === 0) {
                    const serializer = new XMLSerializer();
                    let xmlStr = serializer.serializeToString(xmlDoc);
                    // Pretty print XML with proper indentation
                    let formatted = '';
                    let indent = 0;
                    xmlStr = xmlStr.replace(/(>)(<)(\/*)/g, '$1\n$2$3');
                    const lines = xmlStr.split('\n');
                    for (const line of lines) {
                        let trimmed = line.trim();
                        if (!trimmed) continue;
                        // Check if this line is ONLY a closing tag (not an opening tag with content)
                        const isClosingOnly = trimmed.startsWith('</');
                        // Check if this line is ONLY an opening tag (not containing both open and close)
                        const isOpeningOnly = trimmed.startsWith('<') && !trimmed.includes('</') && !trimmed.endsWith('/>');
                        // Check if self-closing
                        const isSelfClosing = trimmed.endsWith('/>');

                        if (isClosingOnly) {
                            indent = Math.max(0, indent - 1);
                        }
                        formatted += '  '.repeat(indent) + trimmed + '\n';
                        if (isOpeningOnly && !isSelfClosing && !trimmed.startsWith('<?') && !trimmed.startsWith('<!')) {
                            indent++;
                        }
                    }
                    contentEl.value = formatted.trim();
                } else {
                    contentEl.value = currentBodyContent;
                }
                break;
            case 'html':
                contentEl.style.display = 'none';
                let htmlContainer = document.getElementById('bodyHtmlContainer');
                if (!htmlContainer) {
                    htmlContainer = document.createElement('div');
                    htmlContainer.id = 'bodyHtmlContainer';
                    htmlContainer.style.cssText = 'background:#fff;padding:15px;overflow:auto;height:calc(100vh - 160px);border-radius:6px;';
                    contentEl.insertAdjacentHTML('afterend', htmlContainer.outerHTML);
                    htmlContainer = document.getElementById('bodyHtmlContainer');
                }
                htmlContainer.style.display = 'block';
                htmlContainer.innerHTML = currentBodyContent;
                break;
            case 'image':
                contentEl.style.display = 'none';
                contentEl.insertAdjacentHTML('afterend', '<div id="bodyImageContainer" style="display:flex;justify-content:center;align-items:center;height:calc(100vh - 120px);background:#1e1e1e;padding:15px;"></div>');
                const imgContainer = document.getElementById('bodyImageContainer');
                contentEl.style.justifyContent = 'center';
                contentEl.style.alignItems = 'center';

                // Determine image type from mimeType or content
                let imageType = 'image/png';
                const mimeType = currentBodyMimeType.toLowerCase();
                if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
                    imageType = 'image/jpeg';
                } else if (mimeType.includes('png')) {
                    imageType = 'image/png';
                } else if (mimeType.includes('gif')) {
                    imageType = 'image/gif';
                } else if (mimeType.includes('webp')) {
                    imageType = 'image/webp';
                } else if (mimeType.includes('svg')) {
                    imageType = 'image/svg+xml';
                } else if (mimeType.includes('bmp')) {
                    imageType = 'image/bmp';
                } else if (mimeType.includes('ico')) {
                    imageType = 'image/x-icon';
                } else if (currentBodyContent.startsWith('\u0089PNG')) {
                    imageType = 'image/png';
                } else if (currentBodyContent.charCodeAt(0) === 0xFF && currentBodyContent.charCodeAt(1) === 0xD8) {
                    imageType = 'image/jpeg';
                } else if (currentBodyContent.startsWith('GIF')) {
                    imageType = 'image/gif';
                } else if (currentBodyContent.startsWith('RIFF') && currentBodyContent.includes('WEBP')) {
                    imageType = 'image/webp';
                }

                // SVG is text, not binary - use URL-encoded content
                if (mimeType.includes('svg')) {
                    const encoded = encodeURIComponent(currentBodyContent);
                    imgContainer.innerHTML = `<img src="data:${imageType};utf8,${encoded}" style="max-width:100%;max-height:100%;">`;
                    break;
                }

                // Try to use content directly if it looks like base64
                let base64 = currentBodyContent.trim();
                if (!/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length < 100) {
                    // Try alternatives
                    if (currentBodyOriginal) {
                        base64 = currentBodyOriginal.trim();
                    }
                    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
                        try { base64 = btoa(currentBodyContent); }
                        catch (e) {
                            contentEl.value = 'Failed to encode image: ' + e.message;
                            break;
                        }
                    }
                }
                imgContainer.innerHTML = `<img src="data:${imageType};base64,${base64}" style="max-width:100%;max-height:100%;">`;
                break;
            case 'decode':
                try {
                    const raw64 = (currentBodyOriginal || currentBodyContent).trim();
                    const decoded = atob(raw64);
                    // Try to interpret as UTF-8
                    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
                    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                    contentEl.value = utf8;
                    // If decoded looks like JSON, auto-format it
                    try {
                        const obj = JSON.parse(utf8);
                        contentEl.value = JSON.stringify(obj, null, 2);
                    } catch { }
                } catch (e) {
                    contentEl.value = 'Failed to decode Base64: ' + e.message + '\n\n' + currentBodyContent;
                }
                break;
            case 'sse':
                contentEl.style.display = 'none';
                let sseEl = document.getElementById('bodySseContainer');
                if (!sseEl) {
                    sseEl = document.createElement('div');
                    sseEl.id = 'bodySseContainer';
                    contentEl.parentNode.insertBefore(sseEl, contentEl.nextSibling);
                }
                sseEl.style.display = 'block';
                var sseRaw = currentBodyContent;
                // Try Google streaming format first
                if (isGoogleStreamingFormat(sseRaw)) {
                    sseEl.innerHTML = renderGoogleStreamView(sseRaw);
                } else {
                    // Decode base64 if needed before parsing SSE
                    if (currentBodyEncoding === 'base64' || !/^(event|data):\s/m.test(sseRaw)) {
                        try {
                            var decoded = atob((currentBodyOriginal || sseRaw).trim());
                            var bytes = Uint8Array.from(decoded, function(c) { return c.charCodeAt(0); });
                            var utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                            if (/^(event|data):\s/m.test(utf8)) {
                                sseRaw = utf8;
                            }
                        } catch (e) { }
                    }
                    sseEl.innerHTML = renderSseView(sseRaw);
                }
                break;
            case 'hex':
                let hex = '';
                let ascii = '';
                const len = currentBodyContent.length;
                for (let i = 0; i < len; i++) {
                    const code = currentBodyContent.charCodeAt(i);
                    hex += code.toString(16).padStart(2, '0') + ' ';
                    ascii += (code >= 32 && code <= 126) ? currentBodyContent[i] : '.';
                    if ((i + 1) % 16 === 0) {
                        hex += '  ' + ascii + '\n';
                        ascii = '';
                    }
                }
                // Pad last row to align ASCII
                if (ascii.length > 0) {
                    const padding = (16 - ascii.length) * 3;
                    hex += ' '.repeat(padding) + '  ' + ascii;
                }
                contentEl.value = hex || currentBodyContent;
                break;
            default:
                // For raw display, use original base64 if available
                contentEl.value = currentBodyOriginal || currentBodyContent;
        }
    } catch (e) {
        contentEl.value = currentBodyContent;
    }
}

function toggleBodyWrap() {
    const checkbox = document.getElementById('wrapToggle');
    const contentEl = document.getElementById('bodyContent');

    if (checkbox.checked) {
        contentEl.className = 'body-wrap';
    } else {
        contentEl.className = 'body-no-wrap';
    }
    // Also toggle wrap on JSON highlight div if visible
    var jsonEl = document.getElementById('bodyJsonHighlight');
    if (jsonEl && jsonEl.style.display !== 'none') {
        if (checkbox.checked) {
            jsonEl.classList.add('body-wrap');
        } else {
            jsonEl.classList.remove('body-wrap');
        }
    }
}

function updateBodySizeIndicator() {
    const content = currentBodyOriginal || currentBodyContent;
    if (!content) {
        document.getElementById('bodySizeIndicator').textContent = '--';
        return;
    }
    const bytes = new Blob([content]).size;
    let size;
    if (bytes < 1024) size = bytes + ' B';
    else if (bytes < 1024 * 1024) size = (bytes / 1024).toFixed(1) + ' KB';
    else size = (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    document.getElementById('bodySizeIndicator').textContent = size;
}

function copyBodyContent() {
    const content = currentBodyOriginal || currentBodyContent;
    if (content) {
        navigator.clipboard.writeText(content).then(() => {
            const btn = document.querySelector('button[onclick="copyBodyContent()"]');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = orig, 1500);
            }
        });
    }
}

function setDetailBodyFormat(btn, uniqueId) {
    const container = document.getElementById('detail_' + uniqueId);
    if (container) {
        container.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');

    const raw = document.getElementById(uniqueId + '_raw').value;
    const mimeType = document.getElementById(uniqueId + '_mimetype').value;
    const encoding = document.getElementById(uniqueId + '_encoding').value;
    const original = document.getElementById(uniqueId + '_original').value;
    const contentEl = document.getElementById(uniqueId + '_content');

    const format = btn.dataset.format;
    const wrapCheckbox = document.getElementById(uniqueId + '_wrap');
    const isWrapped = wrapCheckbox && wrapCheckbox.checked;

    contentEl.className = isWrapped ? 'body-wrap' : 'body-no-wrap';
    contentEl.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
    contentEl.style.display = 'block';
    contentEl.style.backgroundColor = '#252525';
    contentEl.style.color = '#ccc';

    if (format === 'image') {
        contentEl.innerHTML = '';
        contentEl.style.display = 'flex';
        contentEl.style.justifyContent = 'center';
        contentEl.style.alignItems = 'center';
        contentEl.style.maxHeight = '400px';

        let base64 = raw.trim();
        const isImageMime = mimeType.toLowerCase().startsWith('image/');
        if (!/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length < 100) {
            if (original) base64 = original.trim();
        }

        let imageType = 'image/png';
        const mt = mimeType.toLowerCase();
        if (mt.includes('jpeg') || mt.includes('jpg')) imageType = 'image/jpeg';
        else if (mt.includes('png')) imageType = 'image/png';
        else if (mt.includes('gif')) imageType = 'image/gif';
        else if (mt.includes('webp')) imageType = 'image/webp';
        else if (mt.includes('svg')) imageType = 'image/svg+xml';

        // SVG is text, not binary - use URL-encoded content
        if (mt.includes('svg')) {
            contentEl.innerHTML = `<img src="data:${imageType};utf8,${encodeURIComponent(raw)}" style="max-width:100%;max-height:100%;">`;
        } else {
            contentEl.innerHTML = `<img src="data:${imageType};base64,${base64}" style="max-width:100%;max-height:100%;">`;
        }
    } else if (format === 'hex') {
        let hex = '', ascii = '';
        for (let i = 0; i < raw.length; i++) {
            const code = raw.charCodeAt(i);
            hex += code.toString(16).padStart(2, '0') + ' ';
            ascii += (code >= 32 && code <= 126) ? raw[i] : '.';
            if ((i + 1) % 16 === 0) {
                hex += '  ' + ascii + '\n';
                ascii = '';
            }
        }
        if (ascii.length > 0) {
            hex += ' '.repeat((16 - ascii.length) * 3) + '  ' + ascii;
        }
        contentEl.textContent = hex;
    } else if (format === 'json') {
        try {
            var formatted = JSON.stringify(JSON.parse(raw), null, 2);
            contentEl.innerHTML = syntaxHighlightJson(formatted);
            contentEl.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
        } catch (e) { contentEl.textContent = raw; }
    } else if (format === 'xml') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length === 0) {
            const serializer = new XMLSerializer();
            let xmlStr = serializer.serializeToString(doc);
            let formatted = '';
            let indent = 0;
            xmlStr = xmlStr.replace(/(>)(<)(\/*)/g, '$1\n$2$3');
            const lines = xmlStr.split('\n');
            for (const line of lines) {
                let trimmed = line.trim();
                if (!trimmed) continue;
                const isClosingOnly = trimmed.startsWith('</');
                const isOpeningOnly = trimmed.startsWith('<') && !trimmed.includes('</') && !trimmed.endsWith('/>');
                const isSelfClosing = trimmed.endsWith('/>');

                if (isClosingOnly) {
                    indent = Math.max(0, indent - 1);
                }
                formatted += '  '.repeat(indent) + trimmed + '\n';
                if (isOpeningOnly && !isSelfClosing && !trimmed.startsWith('<?') && !trimmed.startsWith('<!')) {
                    indent++;
                }
            }
            contentEl.textContent = formatted.trim();
        } else { contentEl.textContent = raw; }
    } else if (format === 'sse') {
        contentEl.innerHTML = renderSseView(raw);
        contentEl.style.whiteSpace = 'normal';
        contentEl.style.height = 'auto';
        contentEl.style.maxHeight = '500px';
    } else if (format === 'html') {
        contentEl.style.backgroundColor = '#fff';
        contentEl.style.color = '#000';
        contentEl.innerHTML = raw;
    } else {
        contentEl.textContent = original || raw;
    }
}

function copyDetailBody(uniqueId) {
    const raw = document.getElementById(uniqueId + '_raw').value;
    const original = document.getElementById(uniqueId + '_original').value;
    navigator.clipboard.writeText(original || raw).then(() => {
        const btn = document.querySelector(`button[onclick="copyDetailBody('${uniqueId}')"]`);
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = orig, 1500);
        }
    });
}

function toggleDetailBodyWrap(uniqueId) {
    const checkbox = document.getElementById(uniqueId + '_wrap');
    const contentEl = document.getElementById(uniqueId + '_content');
    if (checkbox.checked) {
        contentEl.className = 'body-wrap';
        contentEl.style.whiteSpace = 'pre-wrap';
        contentEl.style.overflowX = 'auto';
    } else {
        contentEl.className = 'body-no-wrap';
        contentEl.style.whiteSpace = 'pre';
        contentEl.style.overflowX = 'auto';
    }
}

function closeBodyModal() {
    document.getElementById('bodyBackdrop').classList.remove('active');
    document.getElementById('bodyModal').classList.remove('active');
    // Reset wrap checkbox when closing
    const checkbox = document.getElementById('wrapToggle');
    if (checkbox) checkbox.checked = false;
    const contentEl = document.getElementById('bodyContent');
    if (contentEl) {
        contentEl.className = 'body-no-wrap';
        contentEl.style.display = 'block';
        contentEl.value = '';
    }
    // Remove image container if exists
    const imgContainer = document.getElementById('bodyImageContainer');
    if (imgContainer) imgContainer.remove();
    // Remove JSON highlight if exists
    var jsonEl = document.getElementById('bodyJsonHighlight');
    if (jsonEl) jsonEl.remove();
    // Hide HTML container if exists
    var htmlContainer = document.getElementById('bodyHtmlContainer');
    if (htmlContainer) htmlContainer.style.display = 'none';
    // Remove SSE container if exists
    var sseContainer = document.getElementById('bodySseContainer');
    if (sseContainer) sseContainer.remove();
    // Reset body metadata
    currentBodyMimeType = '';
    currentBodyEncoding = 'text';
    currentBodyOriginal = null;
    // Reset modal width to default
    document.getElementById('bodyModal').style.width = '';
}

function syntaxHighlightJson(json) {
    // Escape HTML first
    var s = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Tokenize and wrap with spans
    s = s.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|(\b(?:true|false)\b)|(\bnull\b)|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([{}])|([\[\]])|([,])|(:)/g,
        function (match, str, colon, bool, nul, num, brace, bracket, comma, colonMark) {
            if (str) {
                if (colon) {
                    return '<span class="json-key">' + str + '</span>' + '<span class="json-colon">:</span>';
                }
                return '<span class="json-string">' + str + '</span>';
            }
            if (bool) return '<span class="json-boolean">' + match + '</span>';
            if (nul) return '<span class="json-null">' + match + '</span>';
            if (num) return '<span class="json-number">' + match + '</span>';
            if (brace) return '<span class="json-brace">' + match + '</span>';
            if (bracket) return '<span class="json-bracket">' + match + '</span>';
            if (comma) return '<span class="json-comma">' + match + '</span>';
            if (colonMark) return '<span class="json-colon">' + match + '</span>';
            return match;
        }
    );
    // Wrap each line in a span for line numbers
    var lines = s.split('\n');
    return lines.map(function (line) {
        return '<span class="json-line">' + line + '</span>';
    }).join('');
}

function initBodyModalResizer() {
    var resizer = document.getElementById('bodyModalResizer');
    var modal = document.getElementById('bodyModal');
    if (!resizer || !modal) return;

    var isResizing = false;
    var startX = 0;
    var startWidth = 0;

    resizer.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = modal.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;
        // Dragging left edge: moving left increases width, moving right decreases
        var dx = startX - e.clientX;
        var newWidth = startWidth + dx;
        var minW = 400;
        var maxW = Math.floor(window.innerWidth * 0.95);
        if (newWidth >= minW && newWidth <= maxW) {
            modal.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function getDetailBodySection(req, bodyType) {
    const chunks = bodyType === 'request' ? req.requestBodyChunks : req.responseBodyChunks;
    const bodyPath = bodyType === 'request' ? req.requestBodyPath : req.responseBodyPath;
    const label = bodyType === 'request' ? 'Request' : 'Response';
    const resHeaders = bodyType === 'response' ? (req.responseHeaders || {}) : {};
    const mimeType = bodyType === 'response' ? (req.responseMimeType || resHeaders['Content-Type'] || resHeaders['content-type'] || '') : '';
    const encoding = bodyType === 'response' ? (req.responseEncoding || 'text') : 'text';
    const originalBody = bodyType === 'response' ? (req.responseOriginalBody || null) : null;

    if (chunks && chunks.length > 0) {
        const content = chunks.join('\n');
        const size = new Blob([originalBody || content]).size;
        const sizeStr = size < 1024 ? size + ' B' : size < 1024 * 1024 ? (size / 1024).toFixed(1) + ' KB' : (size / (1024 * 1024)).toFixed(1) + ' MB';
        const uniqueId = 'detailBody_' + req.id + '_' + bodyType;
        return `<div class="detail-section collapsible collapsed" id="detail_${uniqueId}">
            <div class="detail-section-title">
                <div class="collapsible-title" onclick="document.getElementById('detail_${uniqueId}').classList.toggle('collapsed')">
                    <span>${label} Body (${sizeStr})</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <button class="detail-copy-btn" onclick="copyDetailBody('${uniqueId}')">Copy</button>
            </div>
            <div class="collapsible-content" style="background:#1e1e1e;padding:8px;border-radius:4px;margin-top:8px;">
                <div style="display:flex;gap:4px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">
                    <button class="format-btn active" data-format="raw" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">RAW</button>
                    <button class="format-btn" data-format="json" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">JSON</button>
                    <button class="format-btn" data-format="xml" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">XML</button>
                    <button class="format-btn" data-format="html" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">HTML</button>
                    <button class="format-btn" data-format="image" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">Image</button>
                    <button class="format-btn" data-format="hex" data-target="${uniqueId}" onclick="setDetailBodyFormat(this, '${uniqueId}')">HEX</button>
                    ${(mimeType.includes('event-stream') || /^(event|data):\s/m.test(content)) ? '<button class="format-btn" data-format="sse" data-target="' + uniqueId + '" onclick="setDetailBodyFormat(this, \'' + uniqueId + '\')">SSE</button>' : ''}
                    <span style="color:#666;font-size:10px;">|</span>
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#aaa;font-size:10px;margin-left:auto;">
                        <input type="checkbox" id="${uniqueId}_wrap" onchange="toggleDetailBodyWrap('${uniqueId}')">
                        Wrap
                    </label>
                </div>
                <div id="${uniqueId}_content" class="body-no-wrap" style="height:250px;overflow:auto;font-size:11px;color:#ccc;white-space:pre;padding:8px;background:#252525;border-radius:4px;display:block;">${escapeHtml(content)}</div>
            </div>
            <textarea id="${uniqueId}_raw" style="display:none;">${escapeHtml(originalBody || content)}</textarea>
            <input type="hidden" id="${uniqueId}_mimetype" value="${escapeHtml(mimeType)}">
            <input type="hidden" id="${uniqueId}_encoding" value="${escapeHtml(encoding)}">
            <input type="hidden" id="${uniqueId}_original" value="${escapeHtml(originalBody || '')}">
        </div>`;
    } else if (bodyPath) {
        return `<div class="detail-section collapsible">
            <div class="detail-section-title">
                <div class="collapsible-title" onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
                    <span>${label} Body</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <a href="${getFileUrl(bodyPath)}" target="_blank" class="detail-copy-btn" style="color:#4fc3f7;text-decoration:none;">Open</a>
            </div>
            <div class="collapsible-content">
                <a href="${getFileUrl(bodyPath)}" target="_blank" style="color:#4fc3f7;word-break:break-all;font-size:11px;">${escapeHtml(bodyPath)}</a>
            </div>
        </div>`;
    }
    return '';
}

// ===== SSE (Server-Sent Events) Viewer =====

function parseSSEEvents(raw) {
    var events = [];
    var blocks = raw.split(/\n\n+/);
    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i].trim();
        if (!block) continue;
        var evt = { type: '', data: [], raw: block };
        var lines = block.split('\n');
        for (var j = 0; j < lines.length; j++) {
            var line = lines[j];
            if (line.startsWith('event:')) {
                evt.type = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
                evt.data.push(line.substring(5).trimStart());
            } else if (line.startsWith('id:')) {
                evt.id = line.substring(3).trim();
            } else if (line.startsWith('retry:')) {
                evt.retry = line.substring(6).trim();
            }
        }
        if (evt.data.length > 0 || evt.type) {
            evt.dataStr = evt.data.join('\n');
            events.push(evt);
        }
    }
    return events;
}

function assembleSSEContent(events) {
    var assembled = '';
    // Event types that are metadata, not content
    var metaTypes = ['metadata', 'agent_updated', 'ping', 'error', 'done', 'heartbeat', 'status', 'message_persisted'];
    // Skip non-content message types
    var skipTypes = ['resume_conversation_token', 'input_message', 'title_generation', 'message_marker',
                     'conversation_detail_metadata', 'request_options'];
    for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        var dataStr = evt.dataStr;
        if (!dataStr || dataStr === '[DONE]') continue;
        // Skip known metadata event types
        if (evt.type && metaTypes.indexOf(evt.type) !== -1) continue;
        if (evt.type === 'delta_encoding') continue;
        // Try to extract streaming token from JSON data
        try {
            var obj = JSON.parse(dataStr);
            var token = null;

            // Skip non-content message types (ChatGPT web)
            if (obj.type && skipTypes.indexOf(obj.type) !== -1) continue;
            // Skip if this looks like metadata (has trace_id, type but no content token)
            if (obj.trace_id !== undefined && token === null) continue;

            // === ChatGPT Web: JSON Patch delta encoding ===
            // v is array of patch operations: [{p:"/message/content/parts/0", o:"append", v:"text"}]
            var patches = null;
            if (Array.isArray(obj.v)) {
                patches = obj.v;
            } else if (obj.o === 'patch' && Array.isArray(obj.v)) {
                patches = obj.v;
            }
            if (patches) {
                for (var pi = 0; pi < patches.length; pi++) {
                    var patch = patches[pi];
                    if (patch && patch.o === 'append' && typeof patch.p === 'string' &&
                        patch.p.indexOf('/parts/') !== -1 && typeof patch.v === 'string') {
                        assembled += patch.v;
                    }
                }
                continue;
            }

            // === ChatGPT Web: Full message snapshot (o="add") ===
            if (obj.v && obj.v.message && obj.v.message.author) {
                var msg = obj.v.message;
                // Only extract assistant text from completed add operations
                if (msg.author.role === 'assistant' && msg.content && msg.content.parts) {
                    var partText = msg.content.parts[0];
                    if (partText && typeof partText === 'string' && msg.status === 'finished_successfully') {
                        // This is a complete snapshot, replace assembled
                        assembled = partText;
                    }
                }
                continue;
            }

            // === Standard SSE patterns ===
            // Pattern: {"answer": "..."} (custom agents)
            if (obj.answer !== undefined) token = obj.answer;
            // Pattern: {"choices":[{"delta":{"content":"..."}}]} (OpenAI API)
            else if (obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content !== undefined)
                token = obj.choices[0].delta.content;
            // Pattern: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]} (Gemini API)
            else if (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts && obj.candidates[0].content.parts[0])
                token = obj.candidates[0].content.parts[0].text;
            // Pattern: {"type":"content_block_delta","delta":{"text":"..."}} (Claude)
            else if (obj.type === 'content_block_delta' && obj.delta && obj.delta.text !== undefined)
                token = obj.delta.text;
            // Pattern: {"text": "..."} or {"content": "..."}
            else if (obj.text !== undefined) token = obj.text;
            else if (obj.content !== undefined && typeof obj.content === 'string') token = obj.content;
            // Pattern: {"delta": "..."} simple delta
            else if (obj.delta !== undefined && typeof obj.delta === 'string') token = obj.delta;

            if (token !== null) {
                assembled += token;
            }
            // If no token pattern matched, skip (don't dump raw JSON)
        } catch (e) {
            // Non-JSON data: append as-is (plain text SSE)
            assembled += dataStr;
        }
    }
    return assembled;
}

function renderSseView(raw) {
    var events = parseSSEEvents(raw);
    if (events.length === 0) {
        return '<div style="padding:20px;color:#888;">No SSE events found in content.</div>';
    }

    var assembled = assembleSSEContent(events);

    // Categorize events: content tokens vs metadata/control events
    var metaTypes = ['metadata', 'agent_updated', 'ping', 'error', 'done', 'heartbeat', 'status', 'message_persisted'];
    var metaEvents = [];
    var dataCount = 0;
    for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        if (evt.type && metaTypes.indexOf(evt.type) !== -1) {
            metaEvents.push(evt);
        } else {
            // Also check if JSON data has no content token (metadata disguised as data event)
            var isMeta = false;
            if (evt.dataStr) {
                try {
                    var obj = JSON.parse(evt.dataStr);
                    if (obj.trace_id !== undefined && obj.answer === undefined && obj.text === undefined && obj.content === undefined) {
                        metaEvents.push(evt);
                        isMeta = true;
                    }
                } catch (e) { }
            }
            if (!isMeta) dataCount++;
        }
    }

    var html = '';

    // Tab bar
    html += '<div class="sse-tabs">';
    html += '<button class="sse-tab active" onclick="switchSseTab(this, \'assembled\')">Assembled</button>';
    html += '<button class="sse-tab" onclick="switchSseTab(this, \'events\')">Events (' + events.length + ')</button>';
    if (metaEvents.length > 0) {
        html += '<button class="sse-tab" onclick="switchSseTab(this, \'meta\')">Meta (' + metaEvents.length + ')</button>';
    }
    html += '</div>';

    // === Assembled view ===
    html += '<div class="sse-panel active" data-sse-panel="assembled">';
    if (assembled.trim()) {
        html += '<div class="sse-assembled-toolbar">';
        html += '<span class="sse-stat">' + dataCount + ' data chunks</span>';
        html += '<span class="sse-stat">' + assembled.length + ' chars</span>';
        html += '<button class="btn" onclick="copySseAssembled()" style="background:#333;color:#aaa;font-size:11px;padding:4px 10px;border:none;border-radius:4px;cursor:pointer;">Copy</button>';
        html += '</div>';
        html += '<div class="sse-assembled-content" id="sseAssembledContent">';
        html += renderSseMarkdown(assembled);
        html += '</div>';
    } else {
        html += '<div style="padding:20px;color:#888;">No assembled text content found. Events may contain non-text data.</div>';
    }
    html += '</div>';

    // === Meta tab ===
    if (metaEvents.length > 0) {
        html += '<div class="sse-panel" data-sse-panel="meta">';
        html += '<div class="sse-meta-list">';
        for (var m = 0; m < metaEvents.length; m++) {
            var me = metaEvents[m];
            var meType = me.type || 'data';
            var meData = me.dataStr;
            // Try to pretty-print JSON
            try { meData = JSON.stringify(JSON.parse(meData), null, 2); } catch (ex) { }
            html += '<div class="sse-meta-card">';
            html += '<div class="sse-meta-card-header">';
            html += '<span class="sse-event-badge sse-type-meta">' + escapeHtml(meType) + '</span>';
            html += '</div>';
            html += '<pre class="sse-meta-card-body">' + escapeHtml(meData) + '</pre>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
    }

    // === Events table view ===
    html += '<div class="sse-panel" data-sse-panel="events">';
    // Filter bar
    html += '<div class="sse-filter-bar">';
    html += '<input type="text" class="sse-filter-input" id="sseEventFilter" placeholder="Filter events... (text or /regex/)" oninput="filterSseEvents()">';
    html += '<span class="sse-filter-count" id="sseFilterCount">' + events.length + ' / ' + events.length + '</span>';
    html += '</div>';
    html += '<div class="sse-events-scroll">';
    html += '<table class="sse-events-table">';
    html += '<thead><tr><th>#</th><th>Event</th><th>Data</th></tr></thead>';
    html += '<tbody id="sseEventsBody">';
    for (var e = 0; e < events.length; e++) {
        var ev = events[e];
        var typeLabel = ev.type || 'message';
        var typeClass = 'sse-type-' + (ev.type === 'metadata' ? 'meta' : ev.type === 'agent_updated' ? 'meta' : 'data');
        var dataPreview = ev.dataStr;
        // Try to format JSON inline
        try {
            var parsed = JSON.parse(dataPreview);
            dataPreview = JSON.stringify(parsed);
        } catch (ex) { }
        var displayData = dataPreview.length > 200 ? dataPreview.substring(0, 200) + '...' : dataPreview;
        // Store searchable text in data attribute for filtering
        var searchText = (typeLabel + ' ' + ev.raw).replace(/"/g, '&quot;');
        html += '<tr class="sse-event-row" onclick="toggleSseEventDetail(this)" data-sse-search="' + searchText + '">';
        html += '<td class="sse-event-num">' + (e + 1) + '</td>';
        html += '<td><span class="sse-event-badge ' + typeClass + '">' + escapeHtml(typeLabel) + '</span></td>';
        html += '<td class="sse-event-data">' + escapeHtml(displayData) + '</td>';
        html += '</tr>';
        // Hidden detail row
        html += '<tr class="sse-event-detail" style="display:none;">';
        html += '<td colspan="3"><pre class="sse-event-raw">' + escapeHtml(ev.raw) + '</pre></td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>';
    html += '</div>';

    return html;
}

function switchSseTab(btn, panelName) {
    var container = btn.closest('#bodySseContainer') || document.getElementById('bodySseContainer');
    if (!container) return;
    container.querySelectorAll('.sse-tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    container.querySelectorAll('.sse-panel').forEach(function (p) { p.classList.remove('active'); });
    var panel = container.querySelector('.sse-panel[data-sse-panel="' + panelName + '"]');
    if (panel) panel.classList.add('active');
}

function toggleSseEventDetail(row) {
    var detail = row.nextElementSibling;
    if (detail && detail.classList.contains('sse-event-detail')) {
        detail.style.display = detail.style.display === 'none' ? 'table-row' : 'none';
        row.classList.toggle('expanded');
    }
}

function filterSseEvents() {
    var input = document.getElementById('sseEventFilter');
    var tbody = document.getElementById('sseEventsBody');
    var countEl = document.getElementById('sseFilterCount');
    if (!input || !tbody) return;

    var query = input.value.trim();
    var rows = tbody.querySelectorAll('.sse-event-row');
    var total = rows.length;
    var visible = 0;

    // Check if query is a regex pattern: /pattern/ or /pattern/flags
    var useRegex = false;
    var regex = null;
    var regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
        try {
            regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
            useRegex = true;
        } catch (e) {
            // Invalid regex, fall back to text search
        }
    }

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var detail = row.nextElementSibling;
        var searchText = row.getAttribute('data-sse-search') || '';

        var matches = true;
        if (query) {
            if (useRegex && regex) {
                matches = regex.test(searchText);
            } else {
                matches = searchText.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            }
        }

        row.style.display = matches ? '' : 'none';
        if (detail && detail.classList.contains('sse-event-detail')) {
            if (!matches) {
                detail.style.display = 'none';
                row.classList.remove('expanded');
            }
        }
        if (matches) visible++;
    }

    if (countEl) {
        countEl.textContent = visible + ' / ' + total;
        countEl.style.color = (query && visible < total) ? '#ffa726' : '#888';
    }
}

function copySseAssembled() {
    var el = document.getElementById('sseAssembledContent');
    if (!el) return;
    // Get text content (strip HTML)
    var text = assembleSSEContent(parseSSEEvents(currentBodyContent));
    navigator.clipboard.writeText(text).then(function () {
        var btn = el.parentElement.querySelector('button');
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
        }
    });
}

var _sseCodeBlockId = 0;

function renderSseMarkdown(text) {
    if (!text) return '';

    // 1. Extract fenced code blocks first (before any escaping)
    var codeBlocks = [];
    var result = text.replace(/```(\w*)\n([\s\S]*?)```/g, function (match, lang, code) {
        var idx = codeBlocks.length;
        codeBlocks.push({ lang: lang, code: code.replace(/\n$/, '') });
        return '\n__SSE_CODE_' + idx + '__\n';
    });

    // 2. Escape HTML in remaining text
    result = escapeHtml(result);

    // 3. Horizontal rules: --- or *** or ___ (on their own line)
    result = result.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '<hr class="sse-divider">');

    // 4. Headings
    result = result.replace(/^(#{1,6})\s+(.+)$/gm, function (m, hashes, title) {
        var level = hashes.length;
        return '<h' + level + ' class="sse-heading">' + title + '</h' + level + '>';
    });

    // 5. Bold then italic (order matters)
    result = result.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');

    // 6. Inline code
    result = result.replace(/`([^`\n]+)`/g, '<code class="sse-inline-code">$1</code>');

    // 7. Links [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="sse-link">$1</a>');

    // 8. Tables: detect lines starting with | and parse as table
    var tableBlocks = [];
    result = result.replace(/((?:^[ \t]*\|.+\|[ \t]*$\n?){2,})/gm, function (block) {
        var rows = block.trim().split('\n');
        if (rows.length < 2) return block;

        // Check if second row is separator (|---|---|)
        var hasSeparator = /^\|[\s:]*[-]+[\s:]*(\|[\s:]*[-]+[\s:]*)*\|?$/.test(rows[1].trim());

        var html = '<table class="sse-md-table">';

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r].trim();
            // Skip separator row
            if (r === 1 && hasSeparator) continue;

            var cells = row.split('|').filter(function (c, idx, arr) {
                // Remove empty first/last from leading/trailing |
                return !(idx === 0 && c.trim() === '') && !(idx === arr.length - 1 && c.trim() === '');
            });

            var tag = (r === 0 && hasSeparator) ? 'th' : 'td';
            if (r === 0 && hasSeparator) html += '<thead>';
            if (r === 0 && !hasSeparator) html += '<tbody>';
            if (r === 1 && hasSeparator) html += '</thead><tbody>';

            html += '<tr>';
            for (var ci = 0; ci < cells.length; ci++) {
                html += '<' + tag + '>' + cells[ci].trim() + '</' + tag + '>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        var idx = tableBlocks.length;
        tableBlocks.push(html);
        return '\n__SSE_TABLE_' + idx + '__\n';
    });

    // 9. List items (bullet and numbered)
    result = result.replace(/^[ \t]*[*+-]\s+(.+)$/gm, '<li>$1</li>');
    result = result.replace(/^[ \t]*\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    result = result.replace(/(<li>[\s\S]*?<\/li>\n*)+/g, function (match) {
        return '<ul class="sse-list">' + match + '</ul>';
    });

    // 9. Paragraphs / line breaks
    var lines = result.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.match(/^<(h\d|ul|li|hr|pre|div|table)/) || line.match(/<\/(ul|h\d|div|table)>/) || line.includes('__SSE_CODE_') || line.includes('__SSE_TABLE_')) {
            out.push(line);
        } else if (line !== '') {
            out.push('<p class="sse-paragraph">' + line + '</p>');
        }
    }
    result = out.join('\n');
    // Clean up empty paragraphs
    result = result.replace(/<p class="sse-paragraph"><\/p>/g, '');

    // 10. Build code blocks with line numbers, syntax highlighting, copy button
    for (var c = 0; c < codeBlocks.length; c++) {
        var block = codeBlocks[c];
        var blockId = 'sseCode_' + (++_sseCodeBlockId);
        var langUpper = (block.lang || '').toUpperCase();
        var highlighted = highlightSseCode(block.code, block.lang);
        var highlightedLines = highlighted.split('\n');

        var codeHtml = '<div class="sse-codeblock-wrapper">';
        if (langUpper) {
            codeHtml += '<div class="sse-codeblock-header"><span class="sse-codeblock-lang">' + langUpper + '</span>';
        } else {
            codeHtml += '<div class="sse-codeblock-header">';
        }
        codeHtml += '<button class="sse-codeblock-copy" onclick="copySseCodeBlock(\'' + blockId + '\')">Copy</button></div>';
        codeHtml += '<pre class="sse-codeblock" id="' + blockId + '"><code>';
        for (var ln = 0; ln < highlightedLines.length; ln++) {
            codeHtml += '<span class="sse-code-line"><span class="sse-line-num">' + (ln + 1) + '</span>' + highlightedLines[ln] + '</span>';
        }
        codeHtml += '</code></pre>';
        // Store raw code for copy
        codeHtml += '<textarea class="sse-code-raw" id="' + blockId + '_raw" style="display:none;">' + escapeHtml(block.code) + '</textarea>';
        codeHtml += '</div>';

        result = result.replace(new RegExp('(?:<p class="sse-paragraph">)?__SSE_CODE_' + c + '__(?:</p>)?', 'g'), codeHtml);
    }

    // 11. Restore table blocks
    for (var t = 0; t < tableBlocks.length; t++) {
        result = result.replace(new RegExp('(?:<p class="sse-paragraph">)?__SSE_TABLE_' + t + '__(?:</p>)?', 'g'), tableBlocks[t]);
    }

    return result;
}

function highlightSseCode(code, lang) {
    var escaped = escapeHtml(code);
    if (!lang) return escaped;
    var l = lang.toLowerCase();

    if (l === 'html' || l === 'xml' || l === 'svg' || l === 'jinja' || l === 'django' || l === 'twig') {
        // Template tags {{ ... }} and {% ... %}
        escaped = escaped.replace(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g, '<span class="sse-hl-template">$1</span>');
        // HTML tags and attributes
        escaped = escaped.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="sse-hl-tag">$2</span>');
        escaped = escaped.replace(/([\w-]+)(=)(&quot;[^&]*&quot;)/g, '<span class="sse-hl-attr">$1</span>$2<span class="sse-hl-string">$3</span>');
        escaped = escaped.replace(/(&gt;)/g, '<span class="sse-hl-bracket">$1</span>');
        escaped = escaped.replace(/(&lt;)(\/?)(?!span)/g, '<span class="sse-hl-bracket">$1</span>$2');
        return escaped;
    }

    if (l === 'json') {
        escaped = escaped.replace(/(&quot;[^&]*&quot;)(\s*:)/g, '<span class="sse-hl-key">$1</span>$2');
        escaped = escaped.replace(/:(\s*)(&quot;[^&]*&quot;)/g, ':$1<span class="sse-hl-string">$2</span>');
        escaped = escaped.replace(/\b(true|false)\b/g, '<span class="sse-hl-bool">$1</span>');
        escaped = escaped.replace(/\b(null)\b/g, '<span class="sse-hl-null">$1</span>');
        escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sse-hl-num">$1</span>');
        return escaped;
    }

    if (l === 'python' || l === 'py') {
        escaped = escaped.replace(/(#[^\n]*)/g, '<span class="sse-hl-comment">$1</span>');
        escaped = escaped.replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as|in|not|and|or|is|None|True|False|self|yield|lambda|raise|pass|break|continue|async|await)\b/g, '<span class="sse-hl-keyword">$1</span>');
        escaped = escaped.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="sse-hl-string">$1</span>');
        return escaped;
    }

    if (l === 'javascript' || l === 'js' || l === 'typescript' || l === 'ts') {
        escaped = escaped.replace(/(\/\/[^\n]*)/g, '<span class="sse-hl-comment">$1</span>');
        escaped = escaped.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|new|this|async|await|try|catch|throw|typeof|instanceof|null|undefined|true|false)\b/g, '<span class="sse-hl-keyword">$1</span>');
        escaped = escaped.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;|`[^`]*`)/g, '<span class="sse-hl-string">$1</span>');
        return escaped;
    }

    if (l === 'css' || l === 'scss' || l === 'less') {
        escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="sse-hl-comment">$1</span>');
        escaped = escaped.replace(/([\w-]+)(\s*:)/g, '<span class="sse-hl-attr">$1</span>$2');
        escaped = escaped.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="sse-hl-num">$1</span>');
        return escaped;
    }

    if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh') {
        escaped = escaped.replace(/(#[^\n]*)/g, '<span class="sse-hl-comment">$1</span>');
        escaped = escaped.replace(/\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|export|source|cd|ls|rm|cp|mv|mkdir|cat|grep|sed|awk|curl|sudo|apt|pip|npm|git)\b/g, '<span class="sse-hl-keyword">$1</span>');
        escaped = escaped.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="sse-hl-string">$1</span>');
        return escaped;
    }

    if (l === 'sql') {
        escaped = escaped.replace(/(--[^\n]*)/g, '<span class="sse-hl-comment">$1</span>');
        escaped = escaped.replace(/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|SET|INTO|VALUES|TABLE|INDEX|VIEW|DISTINCT|UNION|ALL|EXISTS|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MAX|MIN)\b/gi, '<span class="sse-hl-keyword">$1</span>');
        escaped = escaped.replace(/(&#39;[^&]*&#39;)/g, '<span class="sse-hl-string">$1</span>');
        return escaped;
    }

    // Generic: highlight strings and comments
    escaped = escaped.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="sse-hl-comment">$1</span>');
    escaped = escaped.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="sse-hl-string">$1</span>');
    return escaped;
}

function copySseCodeBlock(blockId) {
    var raw = document.getElementById(blockId + '_raw');
    if (!raw) return;
    navigator.clipboard.writeText(raw.value).then(function () {
        var wrapper = raw.closest('.sse-codeblock-wrapper');
        var btn = wrapper ? wrapper.querySelector('.sse-codeblock-copy') : null;
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
        }
    });
}

// ===== Google Proprietary Streaming Format =====
// Used by gemini.google.com (not the API). Format:
// )]}'  (XSS prefix)
// <byte_count>\n<JSON_array>\n<byte_count>\n<JSON_array>...
// Each JSON: [["wrb.fr", null, "<nested_json_string>"]]
// Nested JSON[4] contains response arrays with cumulative text at [4][0][1][0]

function isGoogleStreamingFormat(text) {
    if (!text) return false;
    var trimmed = text.trim();
    // Content may have literal \" escapes (from HAR JSON-in-JSON)
    return trimmed.startsWith(")]}'") && (trimmed.includes('"wrb.fr"') || trimmed.includes('\\"wrb.fr\\"'));
}

function parseGoogleStreamChunks(text) {
    // Google streaming format has deeply nested JSON with multiple escape levels.
    // After HAR JSON.parse, the string has:
    //   \" = JSON string delimiter
    //   \\\" = escaped quote within content (actual " in original text)
    //   \\\\ = escaped backslash within content
    // Regex can't reliably handle multi-level escaping, so we use a char walker.
    var results = [];

    // Find all [\"rc_xxx\",[\" markers and extract text until unescaped \"]
    var marker = '\\",[\\"';
    var rcMarker = '\\"rc_';
    var pos = 0;

    while (pos < text.length) {
        // Find next rc_ reference
        var rcPos = text.indexOf(rcMarker, pos);
        if (rcPos === -1) break;

        // Find the [\" that opens the text array after rc_id
        var arrOpen = text.indexOf(marker, rcPos);
        if (arrOpen === -1) { pos = rcPos + 4; continue; }

        var textStart = arrOpen + marker.length;

        // Walk forward, tracking escape level to find closing \"
        var i = textStart;
        var content = '';
        while (i < text.length) {
            if (text[i] === '\\' && i + 1 < text.length) {
                if (text[i + 1] === '\\') {
                    // Double backslash: could be escaped backslash or start of \\\"
                    if (i + 2 < text.length && text[i + 2] === '\\' && i + 3 < text.length && text[i + 3] === '"') {
                        // \\\" = escaped quote in content
                        content += '"';
                        i += 4;
                    } else if (i + 2 < text.length && text[i + 2] === '\\' && i + 3 < text.length && text[i + 3] === '\\') {
                        // \\\\ = escaped backslash in content
                        content += '\\';
                        i += 4;
                    } else if (i + 2 < text.length && text[i + 2] === 'n') {
                        // \\n = newline in content
                        content += '\n';
                        i += 3;
                    } else if (i + 2 < text.length && text[i + 2] === 't') {
                        // \\t = tab
                        content += '\t';
                        i += 3;
                    } else {
                        // \\\\ = literal backslash
                        content += '\\';
                        i += 2;
                    }
                } else if (text[i + 1] === '"') {
                    // \" = end of string delimiter
                    break;
                } else if (text[i + 1] === 'n') {
                    content += '\n';
                    i += 2;
                } else if (text[i + 1] === 't') {
                    content += '\t';
                    i += 2;
                } else {
                    content += text[i + 1];
                    i += 2;
                }
            } else {
                content += text[i];
                i += 1;
            }
        }

        if (content.length > 0) {
            results.push(content);
        }

        pos = i + 1;
    }

    // Fallback: try unescaped format (direct JSON, not from HAR)
    if (results.length === 0) {
        var re = /\["rc_[^"]*",\["((?:[^"\\]|\\.)*)"/g;
        var match;
        while ((match = re.exec(text)) !== null) {
            try {
                results.push(JSON.parse('"' + match[1] + '"'));
            } catch (e) {
                results.push(match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
            }
        }
    }

    return results;
}

function renderGoogleStreamView(raw) {
    var textChunks = parseGoogleStreamChunks(raw);

    if (textChunks.length === 0) {
        return '<div style="padding:20px;color:#888;">Could not parse Google streaming response.</div>';
    }

    // Detect cumulative vs incremental
    var isCumulative = false;
    if (textChunks.length > 1) {
        var first = textChunks[0];
        var second = textChunks[1];
        if (second.length > first.length && second.substring(0, Math.min(20, first.length)) === first.substring(0, Math.min(20, first.length))) {
            isCumulative = true;
        }
    }

    var finalText = isCumulative ? textChunks[textChunks.length - 1] : textChunks.join('');

    var html = '';

    // Tabs
    html += '<div class="sse-tabs">';
    html += '<button class="sse-tab active" onclick="switchSseTab(this, \'assembled\')">Assembled</button>';
    html += '<button class="sse-tab" onclick="switchSseTab(this, \'chunks\')">Chunks (' + textChunks.length + ')</button>';
    html += '</div>';

    // Assembled
    html += '<div class="sse-panel active" data-sse-panel="assembled">';
    html += '<div class="sse-assembled-toolbar">';
    html += '<span class="sse-stat">' + textChunks.length + ' chunks</span>';
    html += '<span class="sse-stat">' + (isCumulative ? 'cumulative' : 'incremental') + '</span>';
    html += '<span class="sse-stat">' + finalText.length + ' chars</span>';
    html += '<button class="btn" onclick="copySseGoogleAssembled()" style="background:#333;color:#aaa;font-size:11px;padding:4px 10px;border:none;border-radius:4px;cursor:pointer;">Copy</button>';
    html += '</div>';
    html += '<div class="sse-assembled-content" id="sseAssembledContent">';
    html += renderSseMarkdown(finalText);
    html += '</div>';
    html += '</div>';

    // Chunks view - show incremental diffs
    html += '<div class="sse-panel" data-sse-panel="chunks">';
    html += '<div class="sse-filter-bar">';
    html += '<input type="text" class="sse-filter-input" id="sseGoogleChunkFilter" placeholder="Filter chunks..." oninput="filterGoogleChunks()">';
    html += '<span class="sse-filter-count" id="sseGoogleFilterCount">' + textChunks.length + ' / ' + textChunks.length + '</span>';
    html += '</div>';
    html += '<div class="sse-events-scroll">';
    html += '<table class="sse-events-table">';
    html += '<thead><tr><th>#</th><th>New Text</th><th>Total</th></tr></thead>';
    html += '<tbody id="sseGoogleChunksBody">';

    var prevText = '';
    for (var i = 0; i < textChunks.length; i++) {
        var chunk = textChunks[i];
        var newText = isCumulative ? chunk.substring(prevText.length) : chunk;
        var totalLen = isCumulative ? chunk.length : (prevText.length + chunk.length);
        prevText = isCumulative ? chunk : prevText + chunk;

        var displayNew = newText.length > 150 ? newText.substring(0, 150) + '...' : newText;
        var searchText = newText.replace(/"/g, '&quot;');
        html += '<tr class="sse-event-row" onclick="toggleSseEventDetail(this)" data-sse-search="' + searchText + '">';
        html += '<td class="sse-event-num">' + (i + 1) + '</td>';
        html += '<td class="sse-event-data" style="max-width:none;white-space:pre-wrap;word-break:break-word;"><span style="color:#81c784;">' + escapeHtml(displayNew) + '</span></td>';
        html += '<td style="color:#666;font-size:11px;white-space:nowrap;">' + totalLen + ' ch</td>';
        html += '</tr>';
        html += '<tr class="sse-event-detail" style="display:none;">';
        html += '<td colspan="3"><pre class="sse-event-raw">' + escapeHtml(newText) + '</pre></td>';
        html += '</tr>';
    }

    html += '</tbody></table></div></div>';

    // Store for copy
    html += '<textarea id="sseGoogleAssembledRaw" style="display:none;">' + escapeHtml(finalText) + '</textarea>';

    return html;
}

function copySseGoogleAssembled() {
    var raw = document.getElementById('sseGoogleAssembledRaw');
    if (!raw) return;
    navigator.clipboard.writeText(raw.value).then(function () {
        var toolbar = document.querySelector('.sse-assembled-toolbar');
        var btn = toolbar ? toolbar.querySelector('button') : null;
        if (btn) {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
        }
    });
}

function filterGoogleChunks() {
    var input = document.getElementById('sseGoogleChunkFilter');
    var tbody = document.getElementById('sseGoogleChunksBody');
    var countEl = document.getElementById('sseGoogleFilterCount');
    if (!input || !tbody) return;

    var query = input.value.trim();
    var rows = tbody.querySelectorAll('.sse-event-row');
    var total = rows.length;
    var visible = 0;

    var useRegex = false;
    var regex = null;
    var regexMatch = query.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
        try { regex = new RegExp(regexMatch[1], regexMatch[2] || 'i'); useRegex = true; } catch (e) { }
    }

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var detail = row.nextElementSibling;
        var searchText = row.getAttribute('data-sse-search') || '';

        var matches = !query || (useRegex && regex ? regex.test(searchText) : searchText.toLowerCase().indexOf(query.toLowerCase()) !== -1);

        row.style.display = matches ? '' : 'none';
        if (detail && detail.classList.contains('sse-event-detail') && !matches) {
            detail.style.display = 'none';
            row.classList.remove('expanded');
        }
        if (matches) visible++;
    }

    if (countEl) {
        countEl.textContent = visible + ' / ' + total;
        countEl.style.color = (query && visible < total) ? '#ffa726' : '#888';
    }
}
