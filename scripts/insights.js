function aggregateBy(requests, keyGetter) {
    const map = {};
    requests.forEach(function(request) {
        const key = keyGetter(request) || '(unknown)';
        if (!map[key]) {
            map[key] = { key: key, count: 0, totalDuration: 0, totalBytes: 0, requests: [] };
        }
        map[key].count += 1;
        map[key].totalDuration += request.duration;
        map[key].totalBytes += request.transferSize || 0;
        map[key].requests.push(request);
    });
    return Object.keys(map).map(function(key) {
        return map[key];
    });
}

function computeInsights(requests) {
    const slowest = requests.slice().sort(function(left, right) {
        return right.duration - left.duration;
    }).slice(0, 10);
    const largest = requests.slice().sort(function(left, right) {
        return (right.transferSize || 0) - (left.transferSize || 0);
    }).slice(0, 10);
    const hostSummary = aggregateBy(requests, function(request) {
        return request.host || '(no host)';
    }).sort(function(left, right) {
        return right.totalDuration - left.totalDuration;
    }).slice(0, 10);
    const duplicates = aggregateBy(requests.filter(function(request) {
        return request.method === 'GET';
    }), function(request) {
        return request.requestKeyWithoutQuery;
    }).filter(function(item) {
        return item.count > 1;
    }).sort(function(left, right) {
        return right.count - left.count;
    }).slice(0, 10);
    const statusSummary = aggregateBy(requests, function(request) {
        return String(Math.floor((request.status || 0) / 100)) + 'xx';
    }).sort(function(left, right) {
        return right.count - left.count;
    });
    const typeSummary = aggregateBy(requests, function(request) {
        return request.type || 'UNKNOWN';
    }).sort(function(left, right) {
        return right.count - left.count;
    }).slice(0, 10);

    const staticRequests = requests.filter(function(request) {
        return /\.(js|css|png|jpg|jpeg|gif|webp|svg|woff|woff2|ttf|ico)$/i.test(request.path || '');
    });
    const cacheIssues = staticRequests.filter(function(request) {
        const cacheControl = String(getHeaderValue(request.responseHeaders, 'Cache-Control') || '').toLowerCase();
        return !cacheControl || cacheControl.indexOf('no-store') !== -1 || cacheControl.indexOf('max-age') === -1;
    }).slice(0, 10);

    const primaryHost = hostSummary.length ? hostSummary[0].key : '';
    const thirdParty = hostSummary.filter(function(item) {
        return primaryHost && item.key !== primaryHost;
    }).slice(0, 10);

    const timingRequests = requests.filter(function(request) {
        return request.dnsTime != null || request.connectTime != null || request.sslTime != null || request.waitTime != null || request.receiveTime != null;
    });
    const timingBreakdown = timingRequests.length ? {
        dns: timingRequests.reduce(function(sum, request) { return sum + (request.dnsTime || 0); }, 0) / timingRequests.length,
        connect: timingRequests.reduce(function(sum, request) { return sum + (request.connectTime || 0); }, 0) / timingRequests.length,
        ssl: timingRequests.reduce(function(sum, request) { return sum + (request.sslTime || 0); }, 0) / timingRequests.length,
        wait: timingRequests.reduce(function(sum, request) { return sum + (request.waitTime || 0); }, 0) / timingRequests.length,
        receive: timingRequests.reduce(function(sum, request) { return sum + (request.receiveTime || 0); }, 0) / timingRequests.length
    } : null;

    return {
        slowest: slowest,
        largest: largest,
        hostSummary: hostSummary,
        duplicates: duplicates,
        statusSummary: statusSummary,
        typeSummary: typeSummary,
        cacheIssues: cacheIssues,
        thirdParty: thirdParty,
        timingBreakdown: timingBreakdown
    };
}

function renderInsightRequestList(title, requests, metricGetter, metricFormatter) {
    const itemsHtml = requests.length ? requests.map(function(request) {
        return '<button class="insight-list-item" onclick="openDetailPanel(' + request.id + ')">' +
            '<span class="insight-list-main">' + escapeHtml(request.method + ' ' + request.path) + '</span>' +
            '<span class="insight-list-meta">#' + request.id + ' · ' + metricFormatter(metricGetter(request)) + '</span>' +
            '</button>';
    }).join('') : '<div class="compare-empty">No items</div>';
    return '<section class="insight-card"><h3>' + escapeHtml(title) + '</h3><div class="insight-list">' + itemsHtml + '</div></section>';
}

function renderInsightAggregateList(title, items, formatter) {
    const itemsHtml = items.length ? items.map(function(item) {
        return '<div class="insight-list-item static">' + formatter(item) + '</div>';
    }).join('') : '<div class="compare-empty">No items</div>';
    return '<section class="insight-card"><h3>' + escapeHtml(title) + '</h3><div class="insight-list">' + itemsHtml + '</div></section>';
}

function renderInsightsPanel() {
    const dataset = getActiveDataset();
    const panel = document.getElementById('insightsPanel');
    const content = document.getElementById('insightsContent');
    if (!panel || !content) {
        return;
    }

    if (!dataset || !dataset.requests.length) {
        content.innerHTML = '<div class="compare-empty">Load a dataset to view insights.</div>';
        return;
    }

    const insights = computeInsights(dataset.requests);
    const timingHtml = insights.timingBreakdown
        ? '<section class="insight-card"><h3>Timing Breakdown</h3><div class="insight-grid">' +
            '<div><span class="diff-label">DNS</span><span class="diff-value">' + formatDuration(insights.timingBreakdown.dns) + '</span></div>' +
            '<div><span class="diff-label">Connect</span><span class="diff-value">' + formatDuration(insights.timingBreakdown.connect) + '</span></div>' +
            '<div><span class="diff-label">SSL</span><span class="diff-value">' + formatDuration(insights.timingBreakdown.ssl) + '</span></div>' +
            '<div><span class="diff-label">Wait</span><span class="diff-value">' + formatDuration(insights.timingBreakdown.wait) + '</span></div>' +
            '<div><span class="diff-label">Receive</span><span class="diff-value">' + formatDuration(insights.timingBreakdown.receive) + '</span></div>' +
            '</div></section>'
        : '<section class="insight-card"><h3>Timing Breakdown</h3><div class="compare-empty">No HAR timing data available.</div></section>';

    content.innerHTML = '<div class="insight-header">Insights for ' + escapeHtml(dataset.metadata.sourceLabel || dataset.metadata.sourceName || dataset.id) + '</div>' +
        '<div class="insight-layout">' +
        renderInsightRequestList('Slowest Requests', insights.slowest, function(request) { return request.duration; }, formatDuration) +
        renderInsightRequestList('Largest Responses', insights.largest, function(request) { return request.transferSize || 0; }, formatBytes) +
        renderInsightAggregateList('Host Summary', insights.hostSummary, function(item) {
            return '<span class="insight-list-main">' + escapeHtml(item.key) + '</span><span class="insight-list-meta">' + item.count + ' req · ' + formatDuration(item.totalDuration) + ' · ' + formatBytes(item.totalBytes) + '</span>';
        }) +
        renderInsightAggregateList('Duplicate GET Patterns', insights.duplicates, function(item) {
            return '<span class="insight-list-main">' + escapeHtml(item.key) + '</span><span class="insight-list-meta">' + item.count + ' requests</span>';
        }) +
        renderInsightAggregateList('Cache Issues', insights.cacheIssues, function(request) {
            return '<span class="insight-list-main">' + escapeHtml(request.method + ' ' + request.path) + '</span><span class="insight-list-meta">' + escapeHtml(getHeaderValue(request.responseHeaders, 'Cache-Control') || 'missing cache-control') + '</span>';
        }) +
        renderInsightAggregateList('Third-party Impact', insights.thirdParty, function(item) {
            return '<span class="insight-list-main">' + escapeHtml(item.key) + '</span><span class="insight-list-meta">' + item.count + ' req · ' + formatDuration(item.totalDuration) + ' · ' + formatBytes(item.totalBytes) + '</span>';
        }) +
        renderInsightAggregateList('Status Distribution', insights.statusSummary, function(item) {
            return '<span class="insight-list-main">' + escapeHtml(item.key) + '</span><span class="insight-list-meta">' + item.count + ' requests</span>';
        }) +
        renderInsightAggregateList('Content Types', insights.typeSummary, function(item) {
            return '<span class="insight-list-main">' + escapeHtml(item.key) + '</span><span class="insight-list-meta">' + item.count + ' requests</span>';
        }) +
        timingHtml +
        '</div>';
}

function openInsightsPanel() {
    renderInsightsPanel();
    document.getElementById('insightsBackdrop').classList.add('active');
    document.getElementById('insightsPanel').classList.add('active');
}

function closeInsightsPanel() {
    document.getElementById('insightsBackdrop').classList.remove('active');
    document.getElementById('insightsPanel').classList.remove('active');
}
