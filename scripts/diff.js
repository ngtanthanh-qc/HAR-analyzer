// ===== HAR Diff / Compare =====

var diffLeftRequests = null;
var diffRightRequests = null;
var diffResults = [];
var diffCurrentFilter = 'all';

// Handle compare file input
document.getElementById('compareFileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
        try {
            var data = JSON.parse(ev.target.result);
            var reqs;
            if (data.log && data.log.entries) {
                reqs = convertHarToRequests(data);
            } else if (Array.isArray(data)) {
                reqs = data;
            } else if (data.requests) {
                reqs = data.requests;
            } else {
                alert('Invalid file format');
                return;
            }
            // Left = current loaded data, Right = newly loaded compare file
            diffLeftRequests = filteredRequests.slice();
            diffRightRequests = reqs;
            recomputeDiff();
            openDiffPanel();
        } catch (err) {
            alert('Failed to parse compare file: ' + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

function diffGetDuration(r) {
    if (!r) return 0;
    var end = r.endResponseTimestamp || r.beginResponseTimestamp || r.startRequestTimestamp || 0;
    return end - (r.startRequestTimestamp || 0);
}

function diffGetSize(r) {
    if (!r) return 0;
    return r.responseContentLength || 0;
}

function diffGetKey(r, strategy) {
    var uri = r.uri || '';
    if (strategy === 'noquery') {
        try { var u = new URL(uri); uri = u.origin + u.pathname; } catch (e) { }
    }
    return (r.method || 'GET') + ' ' + uri;
}

function computeDiff(leftReqs, rightReqs, strategy) {
    var leftMap = {};
    var rightMap = {};
    // Index requests by key, allowing duplicates by appending index
    leftReqs.forEach(function (r, i) {
        var key = diffGetKey(r, strategy);
        if (!leftMap[key]) leftMap[key] = [];
        leftMap[key].push(r);
    });
    rightReqs.forEach(function (r, i) {
        var key = diffGetKey(r, strategy);
        if (!rightMap[key]) rightMap[key] = [];
        rightMap[key].push(r);
    });

    var allKeys = {};
    Object.keys(leftMap).forEach(function (k) { allKeys[k] = true; });
    Object.keys(rightMap).forEach(function (k) { allKeys[k] = true; });

    var results = [];
    Object.keys(allKeys).forEach(function (key) {
        var lefts = leftMap[key] || [];
        var rights = rightMap[key] || [];
        var maxLen = Math.max(lefts.length, rights.length);

        for (var i = 0; i < maxLen; i++) {
            var left = lefts[i] || null;
            var right = rights[i] || null;
            var item = { key: key, left: left, right: right };

            if (!left) {
                item.diffType = 'added';
            } else if (!right) {
                item.diffType = 'removed';
            } else {
                // Both exist, compare
                var statusChanged = (left.statusCode || 0) !== (right.statusCode || 0);
                var durationLeft = diffGetDuration(left);
                var durationRight = diffGetDuration(right);
                var sizeLeft = diffGetSize(left);
                var sizeRight = diffGetSize(right);
                var durationDelta = durationRight - durationLeft;
                var sizeDelta = sizeRight - sizeLeft;

                // Check if timing changed more than 10% or status changed
                var timingChanged = Math.abs(durationDelta) > Math.max(10, durationLeft * 0.1);
                var sizeChanged = Math.abs(sizeDelta) > Math.max(100, sizeLeft * 0.1);

                if (statusChanged || timingChanged || sizeChanged) {
                    item.diffType = 'changed';
                } else {
                    item.diffType = 'identical';
                }
                item.statusChanged = statusChanged;
                item.durationDeltaMs = durationDelta;
                item.sizeDeltaBytes = sizeDelta;
            }
            results.push(item);
        }
    });

    // Sort: removed first, then changed, then added, then identical
    var order = { removed: 0, changed: 1, added: 2, identical: 3 };
    results.sort(function (a, b) { return (order[a.diffType] || 3) - (order[b.diffType] || 3); });

    return results;
}

function recomputeDiff() {
    if (!diffLeftRequests || !diffRightRequests) return;
    var strategy = document.getElementById('diffMatchStrategy').value;
    diffResults = computeDiff(diffLeftRequests, diffRightRequests, strategy);
    renderDiffSummary();
    renderDiffTable();
}

function renderDiffSummary() {
    var total = diffResults.length;
    var added = 0, removed = 0, changed = 0, identical = 0;
    var totalDurationDelta = 0;
    var regressions = [];

    diffResults.forEach(function (item) {
        if (item.diffType === 'added') added++;
        else if (item.diffType === 'removed') removed++;
        else if (item.diffType === 'changed') changed++;
        else identical++;
        if (item.durationDeltaMs && item.durationDeltaMs > 0) {
            totalDurationDelta += item.durationDeltaMs;
            regressions.push(item);
        }
    });

    var html = '';
    html += '<div class="diff-summary-card" style="border-left-color:#4fc3f7"><div class="label">Total</div><div class="value">' + total + '</div></div>';
    html += '<div class="diff-summary-card" style="border-left-color:#888"><div class="label">Identical</div><div class="value">' + identical + '</div></div>';
    html += '<div class="diff-summary-card" style="border-left-color:#ffa726"><div class="label">Changed</div><div class="value">' + changed + '</div></div>';
    html += '<div class="diff-summary-card" style="border-left-color:#66bb6a"><div class="label">Added</div><div class="value">' + added + '</div></div>';
    html += '<div class="diff-summary-card" style="border-left-color:#ef5350"><div class="label">Removed</div><div class="value">' + removed + '</div></div>';
    if (diffLeftRequests) {
        html += '<div class="diff-summary-card" style="border-left-color:#9c27b0"><div class="label">Left Reqs</div><div class="value">' + diffLeftRequests.length + '</div></div>';
    }
    if (diffRightRequests) {
        html += '<div class="diff-summary-card" style="border-left-color:#00bcd4"><div class="label">Right Reqs</div><div class="value">' + diffRightRequests.length + '</div></div>';
    }
    document.getElementById('diffSummary').innerHTML = html;
}

function renderDiffTable() {
    var filter = diffCurrentFilter;
    var tbody = document.getElementById('diffTableBody');
    var html = '';

    diffResults.forEach(function (item, idx) {
        if (filter !== 'all' && item.diffType !== filter) return;

        var rowClass = 'diff-' + (item.diffType === 'added' ? 'only-right' : item.diffType === 'removed' ? 'only-left' : item.diffType === 'changed' ? 'changed' : 'identical');
        var badgeClass = item.diffType;
        var badgeLabel = item.diffType.charAt(0).toUpperCase() + item.diffType.slice(1);

        var method = (item.left ? item.left.method : item.right.method) || '';
        var uri = item.key.substring(method.length + 1);
        // Truncate URI for display
        var uriDisplay = uri.length > 80 ? uri.substring(0, 80) + '…' : uri;

        var leftStatus = item.left ? item.left.statusCode : '—';
        var rightStatus = item.right ? item.right.statusCode : '—';
        var leftDur = item.left ? formatDuration(diffGetDuration(item.left)) : '—';
        var rightDur = item.right ? formatDuration(diffGetDuration(item.right)) : '—';

        var dDur = '';
        if (item.durationDeltaMs !== undefined && item.durationDeltaMs !== null && item.left && item.right) {
            var sign = item.durationDeltaMs > 0 ? '+' : '';
            var cls = item.durationDeltaMs > 0 ? 'slower' : item.durationDeltaMs < 0 ? 'faster' : 'neutral';
            dDur = '<span class="diff-delta ' + cls + '">' + sign + formatDuration(item.durationDeltaMs) + '</span>';
        }
        var dSize = '';
        if (item.sizeDeltaBytes !== undefined && item.sizeDeltaBytes !== null && item.left && item.right) {
            var sSign = item.sizeDeltaBytes > 0 ? '+' : '';
            var sCls = item.sizeDeltaBytes > 0 ? 'slower' : item.sizeDeltaBytes < 0 ? 'faster' : 'neutral';
            dSize = '<span class="diff-delta ' + sCls + '">' + sSign + formatBytes(Math.abs(item.sizeDeltaBytes)) + '</span>';
        }

        html += '<tr class="' + rowClass + '" onclick="showDiffDetail(' + idx + ')">';
        html += '<td><span class="diff-badge ' + badgeClass + '">' + badgeLabel + '</span></td>';
        html += '<td>' + escapeHtml(method) + '</td>';
        html += '<td title="' + escapeHtml(uri) + '">' + escapeHtml(uriDisplay) + '</td>';
        html += '<td>' + leftStatus + '</td><td>' + rightStatus + '</td>';
        html += '<td>' + leftDur + '</td><td>' + rightDur + '</td>';
        html += '<td>' + dDur + '</td><td>' + dSize + '</td>';
        html += '</tr>';
    });

    if (!html) {
        html = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#666;">No matching results for this filter.</td></tr>';
    }

    tbody.innerHTML = html;
}

function setDiffFilter(filter) {
    diffCurrentFilter = filter;
    document.querySelectorAll('.diff-filter-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderDiffTable();
}

function openDiffPanel() {
    document.getElementById('diffBackdrop').classList.add('active');
    document.getElementById('diffPanel').classList.add('active');
}

function closeDiffPanel() {
    document.getElementById('diffBackdrop').classList.remove('active');
    document.getElementById('diffPanel').classList.remove('active');
}

function showDiffDetail(idx) {
    var item = diffResults[idx];
    if (!item) return;

    var html = '<div class="diff-detail-header"><h3>⇄ ' + escapeHtml(item.key) + '</h3>';
    html += '<button class="diff-close" onclick="closeDiffDetail()">✕</button></div>';

    html += '<div class="diff-detail-sides">';

    // Left side
    html += '<div class="diff-detail-side"><h4 style="color:#ef5350;">◀ Left (Base)</h4>';
    if (item.left) {
        html += diffDetailReqHtml(item.left, item.right);
    } else {
        html += '<div style="color:#666;padding:20px;text-align:center;">Not present in left dataset</div>';
    }
    html += '</div>';

    // Right side
    html += '<div class="diff-detail-side"><h4 style="color:#66bb6a;">▶ Right (Compare)</h4>';
    if (item.right) {
        html += diffDetailReqHtml(item.right, item.left);
    } else {
        html += '<div style="color:#666;padding:20px;text-align:center;">Not present in right dataset</div>';
    }
    html += '</div>';

    html += '</div>';

    document.getElementById('diffDetailPanel').innerHTML = html;
    document.getElementById('diffDetailOverlay').classList.add('active');
}

function diffDetailReqHtml(req, otherReq) {
    var h = '';
    var dur = diffGetDuration(req);
    var otherDur = otherReq ? diffGetDuration(otherReq) : dur;
    var otherStatus = otherReq ? otherReq.statusCode : req.statusCode;

    h += '<div class="diff-detail-section-title">General</div>';
    h += diffRow('Method', req.method);
    h += diffRow('URI', req.uri);
    h += diffRow('Status', req.statusCode + (req.statusMessage ? ' ' + req.statusMessage : ''), req.statusCode !== otherStatus);
    h += diffRow('Duration', formatDuration(dur), Math.abs(dur - otherDur) > 10);
    h += diffRow('Size', req.responseContentLength ? formatBytes(req.responseContentLength) : '—', otherReq && req.responseContentLength !== (otherReq.responseContentLength || null));

    // Request Headers
    var reqHeaders = req.requestHeaders;
    if (reqHeaders && typeof reqHeaders === 'object' && Object.keys(reqHeaders).length > 0) {
        h += '<div class="diff-detail-section-title">Request Headers</div>';
        Object.keys(reqHeaders).forEach(function (key) {
            h += diffRow(key, reqHeaders[key]);
        });
    }

    // Response Headers
    var resHeaders = req.responseHeaders;
    if (resHeaders && typeof resHeaders === 'object' && Object.keys(resHeaders).length > 0) {
        h += '<div class="diff-detail-section-title">Response Headers</div>';
        Object.keys(resHeaders).forEach(function (key) {
            h += diffRow(key, resHeaders[key]);
        });
    }

    return h;
}

function diffRow(label, value, highlight) {
    return '<div class="diff-detail-row"><div class="diff-detail-label">' + escapeHtml(label) + '</div><div class="diff-detail-value' + (highlight ? ' diff-highlight' : '') + '">' + escapeHtml(String(value || '')) + '</div></div>';
}

function closeDiffDetail() {
    document.getElementById('diffDetailOverlay').classList.remove('active');
}
