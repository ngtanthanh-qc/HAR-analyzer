document.getElementById('fileInput').addEventListener('change', handleFileSelect);

// Check for preloaded data
function checkPreloadedData() {
    const preloadEl = document.getElementById('preloadData');
    if (preloadEl && preloadEl.textContent.trim()) {
        try {
            const data = JSON.parse(preloadEl.textContent);
            if (data.log && data.log.entries) {
                const converted = convertHarToRequests(data);
                processData(converted);
            } else {
                processData(data);
            }
        } catch (err) {
            showError('Failed to parse preloaded data: ' + err.message);
        }
    }
}

window.addEventListener('pageshow', function (event) {
    const fileInput = document.getElementById('fileInput');
    const dropZoneFileInput = document.getElementById('dropZoneFileInput');
    if (fileInput) fileInput.value = '';
    if (dropZoneFileInput) dropZoneFileInput.value = '';
});

// Check for preloaded data on initial page load (called at end of script)

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // Check if it's a HAR file
            if (data.log && data.log.entries) {
                const converted = convertHarToRequests(data);
                processData(converted);
            } else {
                processData(data);
            }
        } catch (err) {
            showError('Failed to parse file: ' + err.message);
        }
        // Clear input so same file can be re-selected
        event.target.value = '';
    };
    reader.onerror = function () {
        showError('Failed to read file');
        event.target.value = '';
    };
    reader.readAsText(file);
}

function convertHarToRequests(har) {
    const entries = (har && har.log && har.log.entries) || [];
    let id = 1;

    const requests = entries.map(entry => {
        const req = entry.request || {};
        const res = entry.response || {};
        const startTime = entry.startedDateTime ? new Date(entry.startedDateTime).getTime() : 0;
        const time = entry.time || 0;

        // Extract headers from HAR format
        const requestHeaders = {};
        (req.headers || []).forEach(h => {
            requestHeaders[h.name] = h.value;
        });

        const responseHeaders = {};
        (res.headers || []).forEach(h => {
            responseHeaders[h.name] = h.value;
        });

        // Extract type from Content-Type header
        const contentType = responseHeaders['Content-Type'] || responseHeaders['content-type'] || ((res.content && res.content.mimeType) || '');
        const type = getTypeFromContentType(contentType);

        // Extract body content from HAR format
        const requestBodyChunks = [];
        if (req.postData && req.postData.text) {
            requestBodyChunks.push(req.postData.text);
        }

        const responseBodyChunks = [];
        const responseMimeType = (res.content && res.content.mimeType) || '';
        // Check for encoding: "base64" OR if mimeType is image, assume base64
        const explicitEncoding = res.content && res.content.encoding;
        const mimeType = ((res.content && res.content.mimeType) || '').toLowerCase();
        const isBase64 = explicitEncoding === 'base64' || (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml');
        let originalBodyContent = null;

        if (res.content && res.content.text) {
            let bodyText = res.content.text;
            // Keep original for raw display and images
            if (isBase64) {
                originalBodyContent = bodyText;
                // Don't decode - keep base64 for RAW and Image views
            }
            responseBodyChunks.push(bodyText);
        }

        // Get thread info - HAR doesn't have thread info, use a default
        const threadId = 'HAR-' + (entry.pageref || '1');

        return {
            id: id++,
            uri: req.url || '',
            method: req.method || 'GET',
            statusCode: res.status || 0,
            statusMessage: res.statusText || '',
            startRequestTimestamp: startTime,
            beginResponseTimestamp: startTime + Math.floor(time * 0.5),
            endResponseTimestamp: startTime + time,
            threadId: threadId,
            requestHeaders: requestHeaders,
            responseHeaders: responseHeaders,
            requestBodyChunks: requestBodyChunks,
            responseBodyChunks: responseBodyChunks,
            responseMimeType: responseMimeType,
            responseEncoding: isBase64 ? 'base64' : 'text',
            responseOriginalBody: originalBodyContent,
            type: type,
            responseContentLength: (res.content && res.content.size >= 0) ? res.content.size : (res.bodySize >= 0 ? res.bodySize : null)
        };
    });

    return requests;
}

function resolvePath(relativePath) {
    if (!relativePath) return '';

    // Get requests_data_path from the JSON config
    const dataPath = window.requestsDataPath;

    // Clean up the relative path
    let relPath = (relativePath || '').trim().replace(/\\/g, '/');

    // Remove leading ./ or .\
    while (relPath.startsWith('./')) relPath = relPath.substring(2);

    // If already absolute path, return it directly
    if (relPath.match(/^[A-Za-z]:/) || relPath.startsWith('/')) {
        return relPath;
    }

    // If no requests_data_path, return the relative path as-is (relative to current HTML file)
    if (!dataPath) {
        return relPath;
    }

    // Normalize base directory
    let basePath = dataPath.replace(/\\/g, '/').replace(/\/+$/, '');

    // Combine paths
    let combined = basePath + '/' + relPath;

    // Normalize: resolve . and ..
    const parts = combined.split('/');
    const normalized = [];
    for (const part of parts) {
        if (part === '..') {
            normalized.pop();
        } else if (part !== '.' && part !== '') {
            normalized.push(part);
        }
    }

    return normalized.join('/');
}

function getFileUrl(relativePath) {
    const resolved = resolvePath(relativePath);
    if (!resolved) return '#';
    // If it's already absolute (has drive letter or starts with /), use file:///
    if (resolved.match(/^[A-Za-z]:/) || resolved.startsWith('/')) {
        return 'file:///' + resolved;
    }
    // For relative paths, resolve against current document location
    return new URL(resolved, document.baseURI).href;
}

function getDisplayUri(uri) {
    const baseUriInput = document.getElementById('filterBaseUri');
    const baseUri = baseUriInput && baseUriInput.value ? baseUriInput.value.trim() : '';
    if (!baseUri || !uri) return uri;
    if (uri.startsWith(baseUri)) {
        return uri.substring(baseUri.length);
    }
    return uri;
}

function processData(data) {
    // Handle both object format {requests: [...], requests_data_path: "..."} and array format [...]
    let requests = [];
    let requestsDataPath = null;

    if (Array.isArray(data)) {
        requests = data;
    } else if (typeof data === 'object' && data !== null) {
        requests = data.requests || [];
        requestsDataPath = data.requests_data_path || null;
    } else {
        showError('Invalid JSON format');
        return;
    }

    if (!Array.isArray(requests) || requests.length === 0) {
        showError('No requests found in JSON');
        return;
    }

    // Store globally for use in resolvePath
    window.requestsDataPath = requestsDataPath;

    hideError();
    requests.sort((a, b) => a.startRequestTimestamp - b.startRequestTimestamp);

    const minTime = requests[0].startRequestTimestamp;
    const maxTime = Math.max(...requests.map(d => d.endResponseTimestamp || d.beginResponseTimestamp || d.startRequestTimestamp));
    const totalRange = maxTime - minTime;

    timeRange = { min: minTime, max: maxTime };

    const avgDuration = requests.reduce((sum, d) => {
        const end = d.endResponseTimestamp || d.beginResponseTimestamp || d.startRequestTimestamp;
        return sum + (end - d.startRequestTimestamp);
    }, 0) / requests.length;

    // Calculate additional statistics
    const durations = requests.map(d => {
        const end = d.endResponseTimestamp || d.beginResponseTimestamp || d.startRequestTimestamp;
        return end - d.startRequestTimestamp;
    });
    const maxDuration = Math.max(...durations);
    const topDelayedIndex = durations.indexOf(maxDuration);
    const topDelayed = requests[topDelayedIndex];

    const totalRequestTime = requests.reduce((sum, d) => {
        const respStart = d.beginResponseTimestamp || d.endResponseTimestamp || d.startRequestTimestamp;
        return sum + (respStart - d.startRequestTimestamp);
    }, 0);

    const totalResponseTime = requests.reduce((sum, d) => {
        if (d.endResponseTimestamp && d.beginResponseTimestamp) {
            return sum + (d.endResponseTimestamp - d.beginResponseTimestamp);
        }
        return sum;
    }, 0);

    const avgRequestTime = totalRequestTime / requests.length;
    const avgResponseTime = requests.filter(d => d.endResponseTimestamp && d.beginResponseTimestamp).length > 0
        ? totalResponseTime / requests.filter(d => d.endResponseTimestamp && d.beginResponseTimestamp).length
        : 0;

    allRequests = requests.map(req => {
        const startTs = req.startRequestTimestamp;
        const fullDt = formatTimestamp(startTs, 'table');
        const timeOnly = formatTimestamp(startTs, 'short');

        let end = req.endResponseTimestamp || req.beginResponseTimestamp;
        if (!end || end === 0) end = startTs + 10000;

        const duration = end - startTs;
        const requestTime = (req.beginResponseTimestamp || end) - startTs;
        const responseTime = req.endResponseTimestamp && req.beginResponseTimestamp
            ? req.endResponseTimestamp - req.beginResponseTimestamp
            : 0;

        const status = (req.statusCode === null || req.statusCode === undefined) ? '???' : req.statusCode;
        const msg = req.statusMessage || (typeof status === 'number' ? getDefaultStatusMessage(status) : 'No Message');
        const uri = req.uri || '';
        const endpoint = uri.split('?')[0].split('/').pop() || uri;

        // Determine status class based on HTTP status code
        let statusClass = 'status-0xx'; // default for invalid/unknown
        if (typeof status === 'number') {
            if (status < 0 || status === 0) {
                statusClass = 'status-0xx';
            } else if (status >= 100 && status < 200) {
                statusClass = 'status-1xx';
            } else if (status >= 200 && status < 300) {
                statusClass = 'status-2xx';
            } else if (status >= 300 && status < 400) {
                statusClass = 'status-3xx';
            } else if (status >= 400 && status < 500) {
                statusClass = 'status-4xx';
            } else if (status >= 500 && status < 600) {
                statusClass = 'status-5xx';
            } else if (status >= 600) {
                statusClass = 'status-6xx';
            }
        }

        const method = req.method || 'GET';
        const methodClass = method.toLowerCase();

        // Extract type from response headers or use existing type from HAR conversion
        const resHeaders = req.responseHeaders || {};
        const contentType = resHeaders['Content-Type'] || resHeaders['content-type'] || req.responseMimeType || '';
        const type = req.type || getTypeFromContentType(contentType);

        return {
            id: req.id,
            startTs,
            endTs: end,
            duration,
            durationHuman: formatDuration(duration),
            requestTime,
            requestTimeHuman: formatDuration(requestTime),
            responseTime,
            responseTimeHuman: formatDuration(responseTime),
            status,
            msg,
            uri,
            endpoint,
            statusClass,
            method,
            methodClass,
            fullDt,
            timeOnly,
            requestBodyPath: req.requestBodyPath || '',
            responseBodyPath: req.responseBodyPath || '',
            requestBodyChunks: req.requestBodyChunks || [],
            responseBodyChunks: req.responseBodyChunks || [],
            requestHeaders: req.requestHeaders || {},
            responseHeaders: req.responseHeaders || {},
            threadId: req.threadId || req.ThreadId || '--',
            type: type,
            responseMimeType: req.responseMimeType || '',
            responseEncoding: req.responseEncoding || '',
            responseOriginalBody: req.responseOriginalBody || null,
            responseContentLength: req.responseContentLength != null ? req.responseContentLength : null
        };
    });

    filteredRequests = [...allRequests];

    // Count successful (2xx) and failed (4xx, 5xx) requests
    const successCount = allRequests.filter(r => r.status >= 200 && r.status < 300).length;
    const failedCount = allRequests.filter(r => r.status >= 400 || (r.status < 0)).length;

    document.getElementById('statsTotalRequests').textContent = allRequests.length;
    const topDelayedEl = document.getElementById('statsTopDelayed');
    topDelayedEl.textContent = `ID#${(topDelayed && topDelayed.id) || '--'} (${formatDuration(maxDuration)})`;
    topDelayedEl.dataset.requestId = (topDelayed && topDelayed.id) || '';
    document.getElementById('statsAvgDuration').textContent = formatDuration(avgDuration);
    document.getElementById('statsAvgRequestTime').textContent = formatDuration(avgRequestTime);
    document.getElementById('statsAvgResponseTime').textContent = formatDuration(avgResponseTime);
    document.getElementById('statsTotalRequestTime').textContent = formatDuration(totalRequestTime);
    document.getElementById('statsTotalResponseTime').textContent = formatDuration(totalResponseTime);
    document.getElementById('statsTotalTime').textContent = formatDuration(totalRange);
    document.getElementById('statsSuccessCount').textContent = successCount;
    document.getElementById('statsFailedCount').textContent = failedCount;
    document.getElementById('statsButton').style.display = 'inline-block';
    document.getElementById('insightsBtn').style.display = 'inline-block';
    document.getElementById('aiChatBtn').style.display = 'inline-block';
    document.getElementById('aiAnalyticsBtn').style.display = 'inline-block';
    document.getElementById('exportDropdown').style.display = 'inline-block';
    document.getElementById('compareBtn').style.display = 'inline-block';
    setupStatsPopupHover();

    renderTimeline();
    zoomToFit();
}
