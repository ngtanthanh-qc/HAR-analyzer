let currentBodyContent = '';
let currentBodyFormat = 'raw';
let currentBodyMimeType = '';
let currentBodyEncoding = 'text';
let currentBodyOriginal = null;

function prettyPrintXml(xmlText) {
    const xmlParser = new DOMParser();
    const xmlDoc = xmlParser.parseFromString(xmlText, 'text/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length !== 0) {
        return xmlText;
    }

    const serializer = new XMLSerializer();
    let xmlStr = serializer.serializeToString(xmlDoc);
    let formatted = '';
    let indent = 0;
    xmlStr = xmlStr.replace(/(>)(<)(\/*)/g, '$1\n$2$3');
    const lines = xmlStr.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

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

    return formatted.trim();
}

function buildHexView(text) {
    let hex = '';
    let ascii = '';

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        hex += code.toString(16).padStart(2, '0') + ' ';
        ascii += code >= 32 && code <= 126 ? text[i] : '.';

        if ((i + 1) % 16 === 0) {
            hex += '  ' + ascii + '\n';
            ascii = '';
        }
    }

    if (ascii.length > 0) {
        const padding = (16 - ascii.length) * 3;
        hex += ' '.repeat(padding) + '  ' + ascii;
    }

    return hex || text;
}

function resolveImageType(mimeType, content) {
    const loweredMimeType = (mimeType || '').toLowerCase();
    if (loweredMimeType.includes('jpeg') || loweredMimeType.includes('jpg')) return 'image/jpeg';
    if (loweredMimeType.includes('png')) return 'image/png';
    if (loweredMimeType.includes('gif')) return 'image/gif';
    if (loweredMimeType.includes('webp')) return 'image/webp';
    if (loweredMimeType.includes('svg')) return 'image/svg+xml';
    if (loweredMimeType.includes('bmp')) return 'image/bmp';
    if (loweredMimeType.includes('ico')) return 'image/x-icon';
    if (content.startsWith('\u0089PNG')) return 'image/png';
    if (content.charCodeAt(0) === 0xFF && content.charCodeAt(1) === 0xD8) return 'image/jpeg';
    if (content.startsWith('GIF')) return 'image/gif';
    if (content.startsWith('RIFF') && content.includes('WEBP')) return 'image/webp';
    return 'image/png';
}

function getBodySizeLabel(content) {
    if (!content) {
        return '--';
    }

    const bytes = new Blob([content]).size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function applyBodyWrapState(contentEl, shouldWrap) {
    contentEl.className = shouldWrap ? 'body-wrap' : 'body-no-wrap';
    contentEl.style.whiteSpace = shouldWrap ? 'pre-wrap' : 'pre';
    contentEl.style.overflowX = 'auto';
}

function resetBodyModalVisualState(contentEl) {
    contentEl.style.display = 'block';
    contentEl.style.justifyContent = '';
    contentEl.style.alignItems = '';
    contentEl.scrollTop = 0;
    contentEl.scrollLeft = 0;

    const imageContainer = document.getElementById('bodyImageContainer');
    if (imageContainer) {
        imageContainer.remove();
    }

    const htmlContainer = document.getElementById('bodyHtmlContainer');
    if (htmlContainer) {
        htmlContainer.style.display = 'none';
    }
}

function showBodyContent(id, type) {
    const req = allRequests.find(function(request) {
        return request.id === Number(id);
    });
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

function showBodyModal(type, content, id, mimeType, encoding, originalBody) {
    currentBodyContent = content;
    currentBodyFormat = 'raw';
    currentBodyMimeType = mimeType || '';
    currentBodyEncoding = encoding || 'text';
    currentBodyOriginal = originalBody || null;

    document.querySelectorAll('#bodyModal .format-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.querySelector('#bodyModal .format-btn[data-format="raw"]').classList.add('active');

    const mimeInfo = mimeType ? ' (' + mimeType + ')' : '';
    document.getElementById('bodyModalTitle').textContent = (type === 'request' ? 'Request' : 'Response') + ' Body - ID: ' + id + mimeInfo;

    const contentEl = document.getElementById('bodyContent');
    contentEl.value = content;
    contentEl.style.display = 'block';
    contentEl.oninput = function() {
        this.value = content;
    };

    requestAnimationFrame(function() {
        contentEl.scrollTop = 0;
        contentEl.scrollLeft = 0;
    });

    updateBodySizeIndicator();

    const decodeBtn = document.getElementById('decodeBtn');
    const trimmedContent = content.trim();
    const looksBase64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmedContent) && trimmedContent.length > 20;
    decodeBtn.style.display = currentBodyEncoding === 'base64' || looksBase64 ? '' : 'none';

    document.getElementById('bodyBackdrop').classList.add('active');
    document.getElementById('bodyModal').classList.add('active');
    contentEl.focus();
    contentEl.setSelectionRange(0, 0);
}

function setBodyFormat(format) {
    currentBodyFormat = format;
    document.querySelectorAll('#bodyModal .format-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.querySelector('#bodyModal .format-btn[data-format="' + format + '"]').classList.add('active');

    const contentEl = document.getElementById('bodyContent');
    resetBodyModalVisualState(contentEl);
    applyBodyWrapState(contentEl, document.getElementById('wrapToggle').checked);

    try {
        switch (format) {
            case 'json':
                try {
                    contentEl.value = JSON.stringify(JSON.parse(currentBodyContent), null, 2);
                } catch (e) {
                    contentEl.value = currentBodyContent;
                }
                break;
            case 'xml':
                contentEl.value = prettyPrintXml(currentBodyContent);
                break;
            case 'html': {
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
            }
            case 'image': {
                contentEl.style.display = 'none';
                contentEl.insertAdjacentHTML('afterend', '<div id="bodyImageContainer" style="display:flex;justify-content:center;align-items:center;height:calc(100vh - 120px);background:#1e1e1e;padding:15px;"></div>');
                const imageContainer = document.getElementById('bodyImageContainer');
                const imageType = resolveImageType(currentBodyMimeType, currentBodyContent);
                const loweredMimeType = currentBodyMimeType.toLowerCase();

                if (loweredMimeType.includes('svg')) {
                    imageContainer.innerHTML = '<img src="data:' + imageType + ';utf8,' + encodeURIComponent(currentBodyContent) + '" style="max-width:100%;max-height:100%;">';
                    break;
                }

                let base64 = currentBodyContent.trim();
                if (!/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length < 100) {
                    if (currentBodyOriginal) {
                        base64 = currentBodyOriginal.trim();
                    }
                    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
                        try {
                            base64 = btoa(currentBodyContent);
                        } catch (e) {
                            contentEl.value = 'Failed to encode image: ' + e.message;
                            contentEl.style.display = 'block';
                            imageContainer.remove();
                            break;
                        }
                    }
                }

                imageContainer.innerHTML = '<img src="data:' + imageType + ';base64,' + base64 + '" style="max-width:100%;max-height:100%;">';
                break;
            }
            case 'decode':
                try {
                    const raw64 = (currentBodyOriginal || currentBodyContent).trim();
                    const decoded = atob(raw64);
                    const bytes = Uint8Array.from(decoded, function(char) {
                        return char.charCodeAt(0);
                    });
                    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                    try {
                        contentEl.value = JSON.stringify(JSON.parse(utf8), null, 2);
                    } catch (e) {
                        contentEl.value = utf8;
                    }
                } catch (e) {
                    contentEl.value = 'Failed to decode Base64: ' + e.message + '\n\n' + currentBodyContent;
                }
                break;
            case 'hex':
                contentEl.value = buildHexView(currentBodyContent);
                break;
            default:
                contentEl.value = currentBodyOriginal || currentBodyContent;
        }
    } catch (e) {
        contentEl.value = currentBodyContent;
    }
}

function toggleBodyWrap() {
    const contentEl = document.getElementById('bodyContent');
    applyBodyWrapState(contentEl, document.getElementById('wrapToggle').checked);
}

function updateBodySizeIndicator() {
    document.getElementById('bodySizeIndicator').textContent = getBodySizeLabel(currentBodyOriginal || currentBodyContent);
}

function copyBodyContent() {
    const content = currentBodyOriginal || currentBodyContent;
    if (!content) return;

    navigator.clipboard.writeText(content).then(function() {
        const btn = document.querySelector('button[onclick="copyBodyContent()"]');
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() {
            btn.textContent = originalText;
        }, 1500);
    });
}

function setDetailBodyFormat(btn, uniqueId) {
    const container = document.getElementById('detail_' + uniqueId);
    if (container) {
        container.querySelectorAll('.format-btn').forEach(function(formatBtn) {
            formatBtn.classList.remove('active');
        });
    }
    btn.classList.add('active');

    const raw = document.getElementById(uniqueId + '_raw').value;
    const mimeType = document.getElementById(uniqueId + '_mimetype').value;
    const original = document.getElementById(uniqueId + '_original').value;
    const contentEl = document.getElementById(uniqueId + '_content');
    const wrapCheckbox = document.getElementById(uniqueId + '_wrap');

    applyBodyWrapState(contentEl, wrapCheckbox && wrapCheckbox.checked);
    contentEl.style.display = 'block';
    contentEl.style.backgroundColor = '#252525';
    contentEl.style.color = '#ccc';

    const format = btn.dataset.format;
    if (format === 'image') {
        contentEl.innerHTML = '';
        contentEl.style.display = 'flex';
        contentEl.style.justifyContent = 'center';
        contentEl.style.alignItems = 'center';
        contentEl.style.maxHeight = '400px';

        let base64 = raw.trim();
        if ((!/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length < 100) && original) {
            base64 = original.trim();
        }

        const imageType = resolveImageType(mimeType, raw);
        const loweredMimeType = mimeType.toLowerCase();
        if (loweredMimeType.includes('svg')) {
            contentEl.innerHTML = '<img src="data:' + imageType + ';utf8,' + encodeURIComponent(raw) + '" style="max-width:100%;max-height:100%;">';
        } else {
            contentEl.innerHTML = '<img src="data:' + imageType + ';base64,' + base64 + '" style="max-width:100%;max-height:100%;">';
        }
        return;
    }

    if (format === 'hex') {
        contentEl.textContent = buildHexView(raw);
        return;
    }

    if (format === 'json') {
        try {
            contentEl.textContent = JSON.stringify(JSON.parse(raw), null, 2);
        } catch (e) {
            contentEl.textContent = raw;
        }
        return;
    }

    if (format === 'xml') {
        contentEl.textContent = prettyPrintXml(raw);
        return;
    }

    if (format === 'html') {
        contentEl.style.backgroundColor = '#fff';
        contentEl.style.color = '#000';
        contentEl.innerHTML = raw;
        return;
    }

    contentEl.textContent = original || raw;
}

function copyDetailBody(uniqueId) {
    const raw = document.getElementById(uniqueId + '_raw').value;
    const original = document.getElementById(uniqueId + '_original').value;
    navigator.clipboard.writeText(original || raw).then(function() {
        const btn = document.querySelector('button[onclick="copyDetailBody(\'' + uniqueId + '\')"]');
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() {
            btn.textContent = originalText;
        }, 1500);
    });
}

function toggleDetailBodyWrap(uniqueId) {
    const checkbox = document.getElementById(uniqueId + '_wrap');
    const contentEl = document.getElementById(uniqueId + '_content');
    applyBodyWrapState(contentEl, checkbox.checked);
}

function closeBodyModal() {
    document.getElementById('bodyBackdrop').classList.remove('active');
    document.getElementById('bodyModal').classList.remove('active');

    const checkbox = document.getElementById('wrapToggle');
    if (checkbox) {
        checkbox.checked = false;
    }

    const contentEl = document.getElementById('bodyContent');
    if (contentEl) {
        contentEl.className = 'body-no-wrap';
        contentEl.style.display = 'block';
        contentEl.value = '';
    }

    const imageContainer = document.getElementById('bodyImageContainer');
    if (imageContainer) {
        imageContainer.remove();
    }

    currentBodyMimeType = '';
    currentBodyEncoding = 'text';
    currentBodyOriginal = null;
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
        const sizeStr = getBodySizeLabel(originalBody || content);
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
    }

    if (bodyPath) {
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