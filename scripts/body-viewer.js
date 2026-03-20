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
