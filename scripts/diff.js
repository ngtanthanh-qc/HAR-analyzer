let currentDiffItems = [];
let currentDiffSummary = null;

function normalizeCompareHeaders(headers) {
    const map = normalizeHeaderMap(headers);
    const keys = Object.keys(map).sort();
    const normalized = {};
    keys.forEach(function(key) {
        normalized[key.toLowerCase()] = String(map[key]);
    });
    return JSON.stringify(normalized);
}

function getCompareBodySignature(request) {
    if (!request) {
        return '';
    }
    if (request.responseOriginalBody) {
        return String(request.responseOriginalBody);
    }
    if (request.responseBodyChunks && request.responseBodyChunks.length) {
        return request.responseBodyChunks.join('');
    }
    if (request.responseBodyPath) {
        return 'file:' + request.responseBodyPath;
    }
    return '';
}

function percentile(values, ratio) {
    if (!values.length) {
        return 0;
    }
    const sorted = values.slice().sort(function(left, right) {
        return left - right;
    });
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
    return sorted[index];
}

function createDiffItem(leftRequest, rightRequest) {
    const key = leftRequest ? leftRequest.requestKey : (rightRequest ? rightRequest.requestKey : '');
    if (!leftRequest) {
        return {
            key: key,
            left: null,
            right: rightRequest,
            diffType: 'only-in-right',
            category: 'only-in-right',
            changed: { status: false, duration: false, headers: false, size: false, body: false },
            durationDeltaMs: rightRequest ? rightRequest.duration : 0,
            sizeDeltaBytes: rightRequest && rightRequest.transferSize ? rightRequest.transferSize : 0
        };
    }
    if (!rightRequest) {
        return {
            key: key,
            left: leftRequest,
            right: null,
            diffType: 'only-in-left',
            category: 'only-in-left',
            changed: { status: false, duration: false, headers: false, size: false, body: false },
            durationDeltaMs: leftRequest ? -leftRequest.duration : 0,
            sizeDeltaBytes: leftRequest && leftRequest.transferSize ? -leftRequest.transferSize : 0
        };
    }

    const changed = {
        status: leftRequest.status !== rightRequest.status,
        duration: leftRequest.duration !== rightRequest.duration,
        headers: normalizeCompareHeaders(leftRequest.responseHeaders) !== normalizeCompareHeaders(rightRequest.responseHeaders),
        size: (leftRequest.transferSize || 0) !== (rightRequest.transferSize || 0),
        body: getCompareBodySignature(leftRequest) !== getCompareBodySignature(rightRequest)
    };

    let category = 'matched-identical-ish';
    if (changed.status) {
        category = 'matched-with-status-change';
    } else if (changed.duration) {
        category = 'matched-with-timing-change';
    } else if (changed.headers) {
        category = 'matched-with-header-change';
    } else if (changed.size) {
        category = 'matched-with-size-change';
    } else if (changed.body) {
        category = 'matched-with-body-change';
    }

    return {
        key: key,
        left: leftRequest,
        right: rightRequest,
        diffType: 'matched',
        category: category,
        changed: changed,
        durationDeltaMs: rightRequest.duration - leftRequest.duration,
        sizeDeltaBytes: (rightRequest.transferSize || 0) - (leftRequest.transferSize || 0)
    };
}

function computeDiffItems(leftRequests, rightRequests, options) {
    const normalizedOptions = options || {};
    const ignoreQuery = normalizedOptions.ignoreQuery === true;
    const buckets = {};
    const items = [];

    function addToBucket(side, request) {
        const key = ignoreQuery ? request.requestKeyWithoutQuery : request.requestKey;
        if (!buckets[key]) {
            buckets[key] = { left: [], right: [] };
        }
        buckets[key][side].push(request);
    }

    leftRequests.forEach(function(request) {
        addToBucket('left', request);
    });
    rightRequests.forEach(function(request) {
        addToBucket('right', request);
    });

    Object.keys(buckets).sort().forEach(function(key) {
        const bucket = buckets[key];
        const maxLength = Math.max(bucket.left.length, bucket.right.length);
        for (let index = 0; index < maxLength; index++) {
            items.push(createDiffItem(bucket.left[index] || null, bucket.right[index] || null));
        }
    });

    return items;
}

function summarizeDiffItems(items, leftRequests, rightRequests) {
    const matched = items.filter(function(item) {
        return item.diffType === 'matched';
    });
    const changed = matched.filter(function(item) {
        return item.category !== 'matched-identical-ish';
    });
    const onlyLeft = items.filter(function(item) {
        return item.diffType === 'only-in-left';
    });
    const onlyRight = items.filter(function(item) {
        return item.diffType === 'only-in-right';
    });
    const regressions = matched.filter(function(item) {
        return item.durationDeltaMs > 0;
    }).sort(function(left, right) {
        return right.durationDeltaMs - left.durationDeltaMs;
    }).slice(0, 10);
    const leftDurations = leftRequests.map(function(request) { return request.duration; });
    const rightDurations = rightRequests.map(function(request) { return request.duration; });
    const leftTransfer = leftRequests.reduce(function(sum, request) { return sum + (request.transferSize || 0); }, 0);
    const rightTransfer = rightRequests.reduce(function(sum, request) { return sum + (request.transferSize || 0); }, 0);

    return {
        totalItems: items.length,
        matchedCount: matched.length,
        changedCount: changed.length,
        onlyLeftCount: onlyLeft.length,
        onlyRightCount: onlyRight.length,
        statusChanges: matched.filter(function(item) { return item.changed.status; }).length,
        p50Delta: percentile(rightDurations, 0.5) - percentile(leftDurations, 0.5),
        p95Delta: percentile(rightDurations, 0.95) - percentile(leftDurations, 0.95),
        maxDelta: (rightDurations.length ? Math.max.apply(null, rightDurations) : 0) - (leftDurations.length ? Math.max.apply(null, leftDurations) : 0),
        totalTransferDelta: rightTransfer - leftTransfer,
        regressions: regressions
    };
}

function filterDiffItems(items, mode) {
    if (!mode || mode === 'all') {
        return items;
    }
    return items.filter(function(item) {
        if (mode === 'changed') return item.category !== 'matched-identical-ish';
        if (mode === 'added') return item.diffType === 'only-in-right';
        if (mode === 'removed') return item.diffType === 'only-in-left';
        if (mode === 'slower') return item.durationDeltaMs > 0;
        if (mode === 'faster') return item.durationDeltaMs < 0;
        if (mode === 'status') return item.changed.status;
        if (mode === 'size') return item.changed.size;
        return true;
    });
}

function renderCompareView() {
    const compareView = document.getElementById('compareView');
    const activeDataset = getActiveDataset();
    const compareDataset = getCompareDataset();
    if (!compareView) {
        return;
    }
    if (!activeDataset || !compareDataset) {
        compareView.innerHTML = '<div class="compare-empty">Load a second file to enable compare mode.</div>';
        return;
    }

    const matchingMode = document.getElementById('compareMatchMode').value;
    const filterMode = document.getElementById('compareFilterMode').value;
    currentDiffItems = computeDiffItems(activeDataset.requests, compareDataset.requests, {
        ignoreQuery: matchingMode === 'ignore-query'
    });
    currentDiffSummary = summarizeDiffItems(currentDiffItems, activeDataset.requests, compareDataset.requests);
    const visibleItems = filterDiffItems(currentDiffItems, filterMode);
    const leftLabel = activeDataset.metadata.sourceLabel || activeDataset.metadata.sourceName || activeDataset.id;
    const rightLabel = compareDataset.metadata.sourceLabel || compareDataset.metadata.sourceName || compareDataset.id;

    document.getElementById('compareMatchedCount').textContent = currentDiffSummary.matchedCount;
    document.getElementById('compareChangedCount').textContent = currentDiffSummary.changedCount;
    document.getElementById('compareOnlyLeftCount').textContent = currentDiffSummary.onlyLeftCount;
    document.getElementById('compareOnlyRightCount').textContent = currentDiffSummary.onlyRightCount;
    document.getElementById('compareStatusDelta').textContent = currentDiffSummary.statusChanges;
    document.getElementById('compareP95Delta').textContent = formatDuration(currentDiffSummary.p95Delta);
    document.getElementById('compareTransferDelta').textContent = formatBytes(Math.abs(currentDiffSummary.totalTransferDelta)) + (currentDiffSummary.totalTransferDelta >= 0 ? ' increase' : ' decrease');

    let regressionsHtml = '';
    if (currentDiffSummary.regressions.length) {
        regressionsHtml = currentDiffSummary.regressions.map(function(item) {
            return '<button class="compare-chip" onclick="openDiffDetailByKey(\'' + escapeHtml(item.key).replace(/'/g, '&#39;') + '\')">' +
                escapeHtml(item.key) + ' +' + formatDuration(item.durationDeltaMs) + '</button>';
        }).join('');
    } else {
        regressionsHtml = '<span class="compare-muted">No timing regressions</span>';
    }
    document.getElementById('compareTopRegressions').innerHTML = regressionsHtml;

    let rowsHtml = visibleItems.map(function(item, index) {
        const leftStatus = item.left ? item.left.status : '-';
        const rightStatus = item.right ? item.right.status : '-';
        const leftDuration = item.left ? item.left.durationHuman : '-';
        const rightDuration = item.right ? item.right.durationHuman : '-';
        const badgeClass = item.diffType === 'only-in-left' ? 'compare-left' : item.diffType === 'only-in-right' ? 'compare-right' : (item.category === 'matched-identical-ish' ? 'compare-same' : 'compare-changed');
        return '<tr class="compare-row" onclick="openDiffDetail(' + index + ')">' +
            '<td><span class="compare-badge ' + badgeClass + '">' + escapeHtml(item.category) + '</span></td>' +
            '<td>' + escapeHtml(item.key) + '</td>' +
            '<td>' + escapeHtml(String(leftStatus)) + '</td>' +
            '<td>' + escapeHtml(String(rightStatus)) + '</td>' +
            '<td>' + escapeHtml(leftDuration) + '</td>' +
            '<td>' + escapeHtml(rightDuration) + '</td>' +
            '<td>' + (item.durationDeltaMs === 0 ? '0ms' : (item.durationDeltaMs > 0 ? '+' : '') + formatDuration(item.durationDeltaMs)) + '</td>' +
            '<td>' + (item.sizeDeltaBytes === 0 ? '0 B' : (item.sizeDeltaBytes > 0 ? '+' : '-') + formatBytes(Math.abs(item.sizeDeltaBytes))) + '</td>' +
            '</tr>';
    }).join('');

    if (!rowsHtml) {
        rowsHtml = '<tr><td colspan="8" class="compare-empty">No diff items match the current filter.</td></tr>';
    }

    compareView.innerHTML = '<div class="compare-table-wrap">' +
        '<div class="compare-dataset-headings"><span>' + escapeHtml(leftLabel) + '</span><span>' + escapeHtml(rightLabel) + '</span></div>' +
        '<table class="compare-table">' +
        '<thead><tr><th>Type</th><th>Request</th><th>Left</th><th>Right</th><th>Left Dur</th><th>Right Dur</th><th>Δ Duration</th><th>Δ Size</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>';
}

function openDiffDetail(index) {
    const item = currentDiffItems[index];
    if (!item) {
        return;
    }
    openDiffDetailItem(item);
}

function openDiffDetailByKey(key) {
    for (let index = 0; index < currentDiffItems.length; index++) {
        if (currentDiffItems[index].key === key) {
            openDiffDetail(index);
            return;
        }
    }
}

function renderDiffSide(title, request) {
    if (!request) {
        return '<div class="diff-side"><div class="diff-side-title">' + escapeHtml(title) + '</div><div class="compare-empty">Missing request</div></div>';
    }

    const responseHeaders = getRequestHeadersAsText(request.responseHeaders) || 'No response headers';
    const requestHeaders = getRequestHeadersAsText(request.requestHeaders) || 'No request headers';
    const responseBody = escapeHtml((request.responseOriginalBody || request.responseBodyText || '').substring(0, 1200) || 'No inline response body');
    const requestBody = escapeHtml((request.requestBodyText || '').substring(0, 1200) || 'No inline request body');

    return '<div class="diff-side">' +
        '<div class="diff-side-title">' + escapeHtml(title) + '</div>' +
        '<div class="diff-side-grid">' +
        '<div><span class="diff-label">Method</span><span class="diff-value">' + escapeHtml(request.method) + '</span></div>' +
        '<div><span class="diff-label">Status</span><span class="diff-value">' + escapeHtml(String(request.status)) + ' ' + escapeHtml(request.msg) + '</span></div>' +
        '<div><span class="diff-label">Duration</span><span class="diff-value">' + escapeHtml(request.durationHuman) + '</span></div>' +
        '<div><span class="diff-label">Size</span><span class="diff-value">' + escapeHtml(formatBytes(request.transferSize)) + '</span></div>' +
        '<div><span class="diff-label">Host</span><span class="diff-value">' + escapeHtml(request.host || '-') + '</span></div>' +
        '<div><span class="diff-label">Type</span><span class="diff-value">' + escapeHtml(request.type || '-') + '</span></div>' +
        '</div>' +
        '<div class="diff-uri">' + escapeHtml(request.uri) + '</div>' +
        '<div class="diff-block"><div class="diff-block-title">Request Headers</div><pre>' + escapeHtml(requestHeaders) + '</pre></div>' +
        '<div class="diff-block"><div class="diff-block-title">Response Headers</div><pre>' + escapeHtml(responseHeaders) + '</pre></div>' +
        '<div class="diff-block"><div class="diff-block-title">Request Body</div><pre>' + requestBody + '</pre></div>' +
        '<div class="diff-block"><div class="diff-block-title">Response Body</div><pre>' + responseBody + '</pre></div>' +
        '</div>';
}

function openDiffDetailItem(item) {
    const panel = document.getElementById('detailPanel');
    const content = document.getElementById('detailPanelContent');
    const activeDataset = getActiveDataset();
    const compareDataset = getCompareDataset();
    const leftLabel = activeDataset ? (activeDataset.metadata.sourceLabel || activeDataset.metadata.sourceName || activeDataset.id) : 'Left';
    const rightLabel = compareDataset ? (compareDataset.metadata.sourceLabel || compareDataset.metadata.sourceName || compareDataset.id) : 'Right';

    document.getElementById('detailOrdinal').textContent = 'Diff';
    document.getElementById('detailId').textContent = item.key;
    document.getElementById('detailThreadBadge').style.background = '#3949ab';
    document.getElementById('detailThreadBadge').textContent = item.category;
    document.getElementById('detailTimestamp').textContent = 'Δ Duration: ' + (item.durationDeltaMs > 0 ? '+' : '') + formatDuration(item.durationDeltaMs) + ' | Δ Size: ' + (item.sizeDeltaBytes > 0 ? '+' : '') + formatBytes(Math.abs(item.sizeDeltaBytes));

    content.innerHTML = '<div class="diff-detail-layout">' + renderDiffSide(leftLabel, item.left) + renderDiffSide(rightLabel, item.right) + '</div>';
    document.getElementById('detailBackdrop').classList.add('active');
    panel.classList.add('active');
}
