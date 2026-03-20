// ===== Fiddler AutoResponder Export =====

function openFiddlerExportDialog() {
    const backdrop = document.getElementById('exportDialogBackdrop');
    const scopeSelectedRadio = document.getElementById('exportScopeSelected');
    const scopeInfo = document.getElementById('exportScopeInfo');
    const selCount = selectedRows.size;
    const totalCount = filteredRequests.length;

    if (selCount > 0) {
        scopeSelectedRadio.disabled = false;
        scopeSelectedRadio.parentElement.style.color = '#ccc';
        scopeInfo.textContent = `${totalCount} filtered requests available, ${selCount} selected.`;
    } else {
        scopeSelectedRadio.disabled = true;
        scopeSelectedRadio.parentElement.style.color = '#666';
        document.querySelector('input[name="exportScope"][value="all"]').checked = true;
        scopeInfo.textContent = `${totalCount} filtered requests available. Select rows to enable "Selected only" export.`;
    }

    // Reset override headers container
    document.getElementById('exportOverrideHeaders').innerHTML = '';

    backdrop.classList.add('active');
}

function closeFiddlerExportDialog(event) {
    if (event && event.target !== document.getElementById('exportDialogBackdrop')) return;
    document.getElementById('exportDialogBackdrop').classList.remove('active');
}

function addExportOverrideHeader(key, value) {
    const container = document.getElementById('exportOverrideHeaders');
    const row = document.createElement('div');
    row.className = 'export-header-row';
    row.innerHTML = `<input type="text" placeholder="Header name" value="${escapeHtml(key || '')}" class="export-header-key">` +
        `<input type="text" placeholder="Value (empty = remove header)" value="${escapeHtml(value || '')}" class="export-header-value">` +
        `<button class="remove-btn" onclick="this.parentElement.remove()">x</button>`;
    container.appendChild(row);
}

function getExportOverrideHeaders() {
    const headers = {};
    document.querySelectorAll('#exportOverrideHeaders .export-header-row').forEach(row => {
        const key = row.querySelector('.export-header-key').value.trim();
        const value = row.querySelector('.export-header-value').value;
        if (key) {
            headers[key] = value || null; // null means remove
        }
    });
    return headers;
}

function fiddlerXmlEscape(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fiddlerRegexEscape(s) {
    if (!s) return '';
    return s.replace(/[^\w\s]/g, '\\$&');
}

function buildFiddlerRuleMatch(rule) {
    let match = '';

    if (rule.requestMethod) {
        match += 'METHOD:' + rule.requestMethod + ' ';
    }

    if (rule.requestBody) {
        match += 'URLWithBody:';
    }

    if (rule.useExactMatchURI) {
        if (rule.caseSensitiveURI) {
            match += 'Exact:' + fiddlerXmlEscape(rule.url);
        } else {
            match += 'REGEX:(?i)^' + fiddlerXmlEscape(fiddlerRegexEscape(rule.url)) + '\\s*$';
        }
    } else {
        if (rule.caseSensitiveURI) {
            match += 'REGEX:^' + fiddlerXmlEscape(fiddlerRegexEscape(rule.url)) + '\\s*$';
        } else {
            match += fiddlerXmlEscape(rule.url);
        }
    }

    if (rule.requestBody) {
        const bodyRegex = fiddlerRegexEscape(rule.requestBody).replace(/\n/g, '.*\\n');
        match += ' REGEX:' + fiddlerXmlEscape(bodyRegex);
    }

    return match;
}

function buildFiddlerRuleXML(rule) {
    const match = buildFiddlerRuleMatch(rule);
    return '<ResponseRule Match="' + match +
        '" Action="' + fiddlerXmlEscape(rule.action) +
        '" Latency="' + (rule.delay || 0) +
        '" DisableAfterMatch="' + (rule.matchOnlyOnce ? 'true' : 'false') +
        '" Enabled="true" />';
}

function buildResponseDatContent(req, options, actionFilePath) {
    // Build status line
    const httpVersion = 'HTTP/1.1';
    const statusLine = httpVersion + ' ' + req.status + ' ' + (req.msg || '') + '\n';

    // Build response headers
    const responseHeaders = Object.assign({}, req.responseHeaders);

    // Apply override headers
    if (options.overrideResponseHeaders) {
        for (const [key, value] of Object.entries(options.overrideResponseHeaders)) {
            if (value === null) {
                // null means remove the header
                delete responseHeaders[key];
            } else {
                responseHeaders[key] = value;
            }
        }
    }

    // Get response body
    let responseBody = '';
    if (req.responseBodyChunks && req.responseBodyChunks.length > 0) {
        responseBody = req.responseBodyChunks.join('');
    }

    // Override Content-Length if enabled
    if (options.overrideResponseContentLength) {
        const bodyBytes = new TextEncoder().encode(responseBody).length;
        responseHeaders['Content-Length'] = String(bodyBytes);
    }

    // Add X-AutoResponder-ActionFile header pointing to this .dat file
    if (actionFilePath) {
        responseHeaders['X-AutoResponder-ActionFile'] = actionFilePath;
    }

    // Build headers string
    let headersStr = '';
    for (const [key, value] of Object.entries(responseHeaders)) {
        if (value != null) {
            headersStr += key + ': ' + value + '\n';
        }
    }
    headersStr += '\n';

    return statusLine + headersStr + responseBody;
}

function executeFiddlerExport() {
    // Validate export path
    const exportPathInput = document.getElementById('exportPath');
    let exportPath = exportPathInput.value.trim();
    if (!exportPath) {
        exportPathInput.style.border = '1px solid #e57373';
        let msg = exportPathInput.parentElement.querySelector('.export-path-error');
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'export-path-error';
            msg.style.cssText = 'color:#e57373;font-size:11px;margin-top:4px;';
            msg.textContent = 'Export path is required.';
            exportPathInput.parentElement.appendChild(msg);
        }
        exportPathInput.focus();
        return;
    }
    // Clear any previous error state
    exportPathInput.style.border = '1px solid #444';
    const prevErr = exportPathInput.parentElement.querySelector('.export-path-error');
    if (prevErr) prevErr.remove();
    // Normalize to forward slashes and ensure trailing slash
    exportPath = exportPath.replace(/\\/g, '/');
    if (!exportPath.endsWith('/')) exportPath += '/';

    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    const options = {
        useExactMatchURI: document.getElementById('exportExactMatch').checked,
        useCaseSensitiveURI: document.getElementById('exportCaseSensitive').checked,
        matchOnlyOnce: document.getElementById('exportMatchOnce').checked,
        includeResponseDelay: document.getElementById('exportIncludeDelay').checked,
        overrideResponseContentLength: false, // document.getElementById('exportOverrideContentLength').checked,
        overrideResponseHeaders: getExportOverrideHeaders()
    };

    // Determine which requests to export
    let requestsToExport;
    if (scope === 'selected' && selectedRows.size > 0) {
        requestsToExport = filteredRequests.filter(r => selectedRows.has(String(r.id)));
    } else {
        requestsToExport = filteredRequests;
    }

    if (requestsToExport.length === 0) {
        showError('No requests to export.');
        return;
    }

    // Build the .farx XML content
    const now = new Date().toISOString();
    let farxContent = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<AutoResponder LastSave="' + now + '" FiddlerVersion="5.0.20211.51073">\n' +
        '  <State Enabled="true" AcceptAllConnects="false" Fallthrough="true" UseLatency="' + (options.includeResponseDelay ? 'true' : 'false') + '">\n';

    const files = []; // {name, content} for zip

    requestsToExport.forEach((req, index) => {
        let actionAbsolutePath;

        if (req.responseBodyPath) {
            // If the request has a responseBodyPath, use it directly as the action
            // (the file already exists on disk, no need to generate a .dat)
            actionAbsolutePath = req.responseBodyPath.replace(/\\/g, '/');
        } else {
            // Generate a .dat file with status line + headers + body
            const datRelativePath = 'responses/' + req.id + '_response.dat';
            actionAbsolutePath = exportPath + datRelativePath;
            const datContent = buildResponseDatContent(req, options, actionAbsolutePath);
            files.push({ name: datRelativePath, content: datContent });
        }

        // Get request body for matching
        let requestBody = null;
        if (req.requestBodyChunks && req.requestBodyChunks.length > 0) {
            requestBody = req.requestBodyChunks.join('');
        }

        const rule = {
            url: req.uri,
            useExactMatchURI: options.useExactMatchURI,
            caseSensitiveURI: options.useCaseSensitiveURI,
            requestMethod: req.method,
            requestBody: requestBody,
            action: actionAbsolutePath,
            delay: options.includeResponseDelay ? req.duration : 0,
            matchOnlyOnce: options.matchOnlyOnce
        };

        farxContent += '    ' + buildFiddlerRuleXML(rule) + '\n';
    });

    farxContent += '  </State>\n</AutoResponder>';
    files.push({ name: 'rules.farx', content: farxContent });

    // Generate and download as zip
    downloadAsZip(files, 'fiddler_rules.zip');

    closeFiddlerExportDialog();
}

// Minimal ZIP file generator (no compression, store only - works for text files)
function downloadAsZip(files, zipName) {
    const encoder = new TextEncoder();
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    // Prepare file entries
    const entries = files.map(f => {
        const nameBytes = encoder.encode(f.name);
        const contentBytes = encoder.encode(f.content);
        return { name: f.name, nameBytes, contentBytes };
    });

    // Calculate CRC32 for each file
    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        const table = crc32.table || (crc32.table = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                t[i] = c;
            }
            return t;
        })());
        for (let i = 0; i < bytes.length; i++) {
            crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // Build local file headers and collect data
    const parts = [];
    entries.forEach(entry => {
        const crc = crc32(entry.contentBytes);
        const localHeader = new ArrayBuffer(30 + entry.nameBytes.length);
        const lv = new DataView(localHeader);
        lv.setUint32(0, 0x04034b50, true);  // Local file header signature
        lv.setUint16(4, 20, true);            // Version needed
        lv.setUint16(6, 0, true);             // General purpose bit flag
        lv.setUint16(8, 0, true);             // Compression method (store)
        lv.setUint16(10, 0, true);            // Mod time
        lv.setUint16(12, 0, true);            // Mod date
        lv.setUint32(14, crc, true);          // CRC-32
        lv.setUint32(18, entry.contentBytes.length, true);  // Compressed size
        lv.setUint32(22, entry.contentBytes.length, true);  // Uncompressed size
        lv.setUint16(26, entry.nameBytes.length, true);     // File name length
        lv.setUint16(28, 0, true);            // Extra field length
        new Uint8Array(localHeader).set(entry.nameBytes, 30);

        const entryOffset = offset;
        parts.push(new Uint8Array(localHeader));
        parts.push(entry.contentBytes);
        offset += localHeader.byteLength + entry.contentBytes.length;

        // Central directory header
        const centralHeader = new ArrayBuffer(46 + entry.nameBytes.length);
        const cv = new DataView(centralHeader);
        cv.setUint32(0, 0x02014b50, true);   // Central directory signature
        cv.setUint16(4, 20, true);             // Version made by
        cv.setUint16(6, 20, true);             // Version needed
        cv.setUint16(8, 0, true);              // Flags
        cv.setUint16(10, 0, true);             // Compression
        cv.setUint16(12, 0, true);             // Mod time
        cv.setUint16(14, 0, true);             // Mod date
        cv.setUint32(16, crc, true);           // CRC-32
        cv.setUint32(20, entry.contentBytes.length, true);  // Compressed
        cv.setUint32(24, entry.contentBytes.length, true);  // Uncompressed
        cv.setUint16(28, entry.nameBytes.length, true);     // Name length
        cv.setUint16(30, 0, true);             // Extra field length
        cv.setUint16(32, 0, true);             // Comment length
        cv.setUint16(34, 0, true);             // Disk number start
        cv.setUint16(36, 0, true);             // Internal file attributes
        cv.setUint32(38, 0, true);             // External file attributes
        cv.setUint32(42, entryOffset, true);   // Relative offset
        new Uint8Array(centralHeader).set(entry.nameBytes, 46);
        centralHeaders.push(new Uint8Array(centralHeader));
    });

    // Add central directory
    const centralDirOffset = offset;
    let centralDirSize = 0;
    centralHeaders.forEach(ch => {
        parts.push(ch);
        centralDirSize += ch.length;
    });

    // End of central directory
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);      // EOCD signature
    ev.setUint16(4, 0, true);                 // Disk number
    ev.setUint16(6, 0, true);                 // Disk with central dir
    ev.setUint16(8, entries.length, true);     // Entries on this disk
    ev.setUint16(10, entries.length, true);    // Total entries
    ev.setUint32(12, centralDirSize, true);    // Central dir size
    ev.setUint32(16, centralDirOffset, true);  // Central dir offset
    ev.setUint16(20, 0, true);                 // Comment length
    parts.push(new Uint8Array(eocd));

    // Combine all parts
    const totalSize = parts.reduce((s, p) => s + p.length, 0);
    const zipData = new Uint8Array(totalSize);
    let pos = 0;
    parts.forEach(p => { zipData.set(p, pos); pos += p.length; });

    // Download
    const blob = new Blob([zipData], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== End Fiddler Export =====
