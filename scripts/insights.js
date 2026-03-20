// ===== Performance Insights =====

function openInsightsPanel() {
    var panel = document.getElementById('insightsPanel');
    var backdrop = document.getElementById('insightsBackdrop');
    panel.classList.add('active');
    backdrop.classList.add('active');
    computeAndRenderInsights();
}

function closeInsightsPanel() {
    document.getElementById('insightsPanel').classList.remove('active');
    document.getElementById('insightsBackdrop').classList.remove('active');
}

function switchInsightsTab(tabName) {
    document.querySelectorAll('.insights-tab').forEach(function (t) { t.classList.remove('active'); });
    var activeTab = document.querySelector('.insights-tab[data-tab="' + tabName + '"]');
    if (activeTab) activeTab.classList.add('active');
    document.querySelectorAll('.insights-section').forEach(function (s) { s.classList.remove('active'); });
    var section = document.getElementById('insights-' + tabName);
    if (section) section.classList.add('active');
}

function insightsAggregateBy(reqs, keyFn) {
    var map = {};
    reqs.forEach(function (r) {
        var key = keyFn(r) || '(unknown)';
        if (!map[key]) map[key] = { key: key, count: 0, totalDuration: 0, totalBytes: 0, requests: [] };
        map[key].count++;
        map[key].totalDuration += r.duration || 0;
        map[key].totalBytes += (r.responseContentLength || 0);
        map[key].requests.push(r);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
}

function insightsGetHost(uri) {
    try { return new URL(uri).hostname; } catch (e) { return '(unknown)'; }
}

function insightsPercentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx];
}

function insightsSummaryCard(label, value, color) {
    var c = color || '#4fc3f7';
    return '<div class="insights-summary-item"><div class="insights-summary-label">' + label + '</div><div class="insights-summary-value" style="color:' + c + ';">' + value + '</div></div>';
}

function insightsRequestCard(rank, r, valueText, valueClass) {
    var html = '<div class="insights-card" style="cursor:pointer;" onclick="closeInsightsPanel(); insightsScrollToRequest(' + r.id + ')">';
    html += '<div class="insights-card-header">';
    html += '<span class="insights-card-rank">#' + rank + '</span>';
    html += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
    html += '<span class="insights-card-uri" title="' + escapeHtml(r.uri) + '">' + escapeHtml(r.uri) + '</span>';
    html += '<span class="insights-card-value ' + valueClass + '">' + valueText + '</span>';
    html += '</div></div>';
    return html;
}

function insightsScrollToRequest(id) {
    clearMeasure();
    document.querySelectorAll('.request-row').forEach(function (r) { r.classList.remove('highlight', 'selected-start', 'selected-end', 'selected'); });
    document.querySelectorAll('.timeline-bar').forEach(function (b) { b.classList.remove('highlight', 'selected-start', 'selected-end', 'selected'); });
    document.querySelectorAll('.timeline-column').forEach(function (c) { c.classList.remove('highlight', 'selected-start', 'selected-end', 'selected'); });

    var row = document.querySelector('.request-row[data-id="' + id + '"]');
    var detailsSection = document.querySelector('.details-section');
    if (row && detailsSection) {
        var rowTop = row.offsetTop;
        detailsSection.scrollTop = Math.max(0, rowTop - detailsSection.clientHeight / 2 + row.offsetHeight / 2);
        row.classList.add('selected-start');
    }
    var bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
    var timelineSection = document.querySelector('.timeline-section');
    if (bar && timelineSection) {
        timelineSection.scrollLeft = Math.max(0, bar.offsetLeft - timelineSection.clientWidth / 2 + bar.offsetWidth / 2);
        bar.classList.add('selected-start');
        var tc = document.querySelector('.timeline-column[data-id="' + id + '"]');
        if (tc) tc.classList.add('selected-start');
    }
}

function computeAndRenderInsights() {
    var reqs = filteredRequests;
    if (!reqs || reqs.length === 0) {
        document.getElementById('insightsBody').innerHTML = '<div class="insights-empty">No data loaded. Load a HAR or JSON file first.</div>';
        return;
    }

    var durations = reqs.map(function (r) { return r.duration || 0; });
    var sizes = reqs.map(function (r) { return r.responseContentLength || 0; });
    var totalDuration = durations.reduce(function (a, b) { return a + b; }, 0);
    var totalSize = sizes.reduce(function (a, b) { return a + b; }, 0);
    var avgDuration = totalDuration / reqs.length;
    var p50 = insightsPercentile(durations, 0.5);
    var p95 = insightsPercentile(durations, 0.95);
    var p99 = insightsPercentile(durations, 0.99);
    var maxD = Math.max.apply(null, durations);

    var successCount = reqs.filter(function (r) { return r.status >= 200 && r.status < 300; }).length;
    var clientErrors = reqs.filter(function (r) { return r.status >= 400 && r.status < 500; }).length;
    var serverErrors = reqs.filter(function (r) { return r.status >= 500; }).length;
    var redirects = reqs.filter(function (r) { return r.status >= 300 && r.status < 400; }).length;

    // ===== OVERVIEW =====
    var overviewHtml = '<div class="insights-section active" id="insights-overview">';
    overviewHtml += '<div class="insights-summary-grid">';
    overviewHtml += insightsSummaryCard('Total Requests', reqs.length);
    overviewHtml += insightsSummaryCard('Avg Duration', formatDuration(avgDuration));
    overviewHtml += insightsSummaryCard('P50', formatDuration(p50));
    overviewHtml += insightsSummaryCard('P95', formatDuration(p95));
    overviewHtml += insightsSummaryCard('P99', formatDuration(p99));
    overviewHtml += insightsSummaryCard('Max', formatDuration(maxD));
    overviewHtml += insightsSummaryCard('Total Size', formatBytes(totalSize));
    overviewHtml += insightsSummaryCard('\u2705 2xx', successCount, '#81c784');
    overviewHtml += insightsSummaryCard('\u21a9\ufe0f 3xx', redirects, '#ffb74d');
    overviewHtml += insightsSummaryCard('\u26a0\ufe0f 4xx', clientErrors, '#ff8a65');
    overviewHtml += insightsSummaryCard('\ud83d\udd25 5xx', serverErrors, '#e57373');
    overviewHtml += '</div>';

    // Quick alerts
    if (serverErrors > 0) {
        overviewHtml += '<div class="insights-alert"><span class="insights-alert-icon">\ud83d\udd25</span><div class="insights-alert-text"><strong>' + serverErrors + ' server error(s)</strong> detected (5xx). These indicate server-side failures.</div></div>';
    }
    if (clientErrors > 0) {
        overviewHtml += '<div class="insights-alert warning"><span class="insights-alert-icon">\u26a0\ufe0f</span><div class="insights-alert-text"><strong>' + clientErrors + ' client error(s)</strong> detected (4xx). Check for broken endpoints or missing resources.</div></div>';
    }
    var slowReqs = reqs.filter(function (r) { return r.duration > 5000; });
    if (slowReqs.length > 0) {
        overviewHtml += '<div class="insights-alert warning"><span class="insights-alert-icon">\ud83d\udc22</span><div class="insights-alert-text"><strong>' + slowReqs.length + ' slow request(s)</strong> exceeded 5 seconds.</div></div>';
    }
    overviewHtml += '</div>';

    // ===== SLOWEST =====
    var slowest = reqs.slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 20);
    var slowHtml = '<div class="insights-section" id="insights-slowest">';
    slowHtml += '<div class="insights-section-title">\ud83d\udc22 Top 20 Slowest Requests</div>';
    slowest.forEach(function (r, i) {
        slowHtml += insightsRequestCard(i + 1, r, formatDuration(r.duration), 'slow');
    });
    slowHtml += '</div>';

    // ===== LARGEST =====
    var largest = reqs.filter(function (r) { return r.responseContentLength > 0; })
        .sort(function (a, b) { return (b.responseContentLength || 0) - (a.responseContentLength || 0); }).slice(0, 20);
    var largeHtml = '<div class="insights-section" id="insights-largest">';
    largeHtml += '<div class="insights-section-title">\ud83d\udce6 Top 20 Largest Responses</div>';
    if (largest.length === 0) {
        largeHtml += '<div class="insights-empty">No response size data available.</div>';
    } else {
        largest.forEach(function (r, i) {
            largeHtml += insightsRequestCard(i + 1, r, formatBytes(r.responseContentLength), 'large');
        });
    }
    largeHtml += '</div>';

    // ===== BY HOST =====
    var hostGroups = insightsAggregateBy(reqs, function (r) { return insightsGetHost(r.uri); })
        .sort(function (a, b) { return b.totalDuration - a.totalDuration; });
    var hostHtml = '<div class="insights-section" id="insights-hosts">';
    hostHtml += '<div class="insights-section-title">\ud83c\udf10 Requests by Host</div>';
    hostHtml += '<div class="insights-summary-grid">';
    hostHtml += insightsSummaryCard('Unique Hosts', hostGroups.length);
    hostHtml += '</div>';
    var maxHostDuration = hostGroups.length > 0 ? hostGroups[0].totalDuration : 1;
    hostGroups.forEach(function (g) {
        var pct = Math.max(3, Math.round(g.totalDuration / maxHostDuration * 100));
        hostHtml += '<div class="insights-card">';
        hostHtml += '<div class="insights-card-header">';
        hostHtml += '<span class="insights-host-domain">' + escapeHtml(g.key) + '</span>';
        hostHtml += '<span class="insights-card-value neutral">' + g.count + ' req \u00b7 ' + formatDuration(g.totalDuration) + '</span>';
        hostHtml += '</div>';
        hostHtml += '<div style="padding: 0 14px 10px 14px;">';
        hostHtml += '<div class="insights-bar-track"><div class="insights-bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#1565c0,#4fc3f7);">' + formatBytes(g.totalBytes) + '</div></div>';
        hostHtml += '</div></div>';
    });
    hostHtml += '</div>';

    // ===== STATUS & TYPE =====
    var statusGroups = insightsAggregateBy(reqs, function (r) {
        var s = Number(r.status) || 0;
        if (s < 100) return '0xx/Other';
        return Math.floor(s / 100) + 'xx';
    }).sort(function (a, b) { return b.count - a.count; });

    var typeGroups = insightsAggregateBy(reqs, function (r) { return r.type || 'UNKNOWN'; })
        .sort(function (a, b) { return b.count - a.count; });

    var statusColors = { '1xx': '#00acc1', '2xx': '#66bb6a', '3xx': '#ffa726', '4xx': '#ff7043', '5xx': '#ef5350', '0xx/Other': '#757575' };
    var typeColors = ['#4fc3f7', '#7c4dff', '#ffb74d', '#81c784', '#f06292', '#ba68c8', '#4dd0e1', '#aed581', '#ff8a65', '#9575cd'];

    var distHtml = '<div class="insights-section" id="insights-status">';
    distHtml += '<div class="insights-section-title">\ud83d\udcca Status Code Distribution</div>';
    distHtml += '<div class="insights-bar-chart">';
    var maxStatusCount = statusGroups.length > 0 ? statusGroups[0].count : 1;
    statusGroups.forEach(function (g) {
        var pct = Math.max(3, Math.round(g.count / maxStatusCount * 100));
        var color = statusColors[g.key] || '#888';
        distHtml += '<div class="insights-bar-row">';
        distHtml += '<span class="insights-bar-label">' + g.key + '</span>';
        distHtml += '<div class="insights-bar-track"><div class="insights-bar-fill" style="width:' + pct + '%;background:' + color + ';">' + g.count + '</div></div>';
        distHtml += '<span class="insights-bar-count">' + (g.count / reqs.length * 100).toFixed(1) + '%</span>';
        distHtml += '</div>';
    });
    distHtml += '</div>';

    distHtml += '<div class="insights-section-title" style="margin-top:20px;">\ud83d\udcc4 Content Type Distribution</div>';
    distHtml += '<div class="insights-bar-chart">';
    var maxTypeCount = typeGroups.length > 0 ? typeGroups[0].count : 1;
    typeGroups.forEach(function (g, i) {
        var pct = Math.max(3, Math.round(g.count / maxTypeCount * 100));
        var color = typeColors[i % typeColors.length];
        distHtml += '<div class="insights-bar-row">';
        distHtml += '<span class="insights-bar-label">' + escapeHtml(g.key) + '</span>';
        distHtml += '<div class="insights-bar-track"><div class="insights-bar-fill" style="width:' + pct + '%;background:' + color + ';">' + g.count + '</div></div>';
        distHtml += '<span class="insights-bar-count">' + formatBytes(g.totalBytes) + '</span>';
        distHtml += '</div>';
    });
    distHtml += '</div></div>';

    // ===== DUPLICATES =====
    var getReqs = reqs.filter(function (r) { return r.method === 'GET'; });
    var dupGroups = insightsAggregateBy(getReqs, function (r) {
        try { var u = new URL(r.uri); return r.method + ' ' + u.origin + u.pathname; }
        catch (e) { return r.method + ' ' + r.uri.split('?')[0]; }
    }).filter(function (g) { return g.count > 1; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, 20);

    var dupHtml = '<div class="insights-section" id="insights-duplicates">';
    dupHtml += '<div class="insights-section-title">\ud83d\udd01 Duplicate Requests (Same URL, Multiple Calls)</div>';
    if (dupGroups.length === 0) {
        dupHtml += '<div class="insights-empty">No duplicate GET requests detected. \u2705</div>';
    } else {
        dupHtml += '<div class="insights-alert warning"><span class="insights-alert-icon">\ud83d\udca1</span><div class="insights-alert-text">Found <strong>' + dupGroups.length + ' endpoint(s)</strong> called multiple times. Consider caching or deduplication.</div></div>';
        dupGroups.forEach(function (g, i) {
            dupHtml += '<div class="insights-card">';
            dupHtml += '<div class="insights-card-header">';
            dupHtml += '<span class="insights-card-rank">' + (i + 1) + '</span>';
            dupHtml += '<span class="insights-card-uri">' + escapeHtml(g.key) + '</span>';
            dupHtml += '<span class="insights-card-value count">\u00d7' + g.count + '</span>';
            dupHtml += '</div></div>';
        });
    }
    dupHtml += '</div>';

    // ===== ISSUES (Cache Analysis + Errors) =====
    var issuesHtml = '<div class="insights-section" id="insights-issues">';
    issuesHtml += '<div class="insights-section-title">\u26a0\ufe0f Potential Issues</div>';

    // Server errors
    var errors5xx = reqs.filter(function (r) { return r.status >= 500; });
    if (errors5xx.length > 0) {
        issuesHtml += '<div class="insights-section-title" style="color:#e57373;font-size:12px;">Server Errors (5xx)</div>';
        errors5xx.forEach(function (r) {
            issuesHtml += '<div class="insights-alert"><span class="insights-alert-icon">\ud83d\udd25</span><div><div class="insights-alert-text"><strong>' + r.status + '</strong> ' + escapeHtml(r.msg || '') + '</div><div class="insights-alert-uri">' + escapeHtml(r.method) + ' ' + escapeHtml(r.uri) + '</div></div></div>';
        });
    }

    // Client errors
    var errors4xx = reqs.filter(function (r) { return r.status >= 400 && r.status < 500; });
    if (errors4xx.length > 0) {
        issuesHtml += '<div class="insights-section-title" style="color:#ff8a65;font-size:12px;margin-top:16px;">Client Errors (4xx)</div>';
        errors4xx.slice(0, 20).forEach(function (r) {
            issuesHtml += '<div class="insights-alert warning"><span class="insights-alert-icon">\u26a0\ufe0f</span><div><div class="insights-alert-text"><strong>' + r.status + '</strong> ' + escapeHtml(r.msg || '') + '</div><div class="insights-alert-uri">' + escapeHtml(r.method) + ' ' + escapeHtml(r.uri) + '</div></div></div>';
        });
        if (errors4xx.length > 20) {
            issuesHtml += '<div class="insights-empty">...and ' + (errors4xx.length - 20) + ' more</div>';
        }
    }

    // Cache analysis: static resources without cache headers
    var staticTypes = ['IMG', 'JS', 'CSS', 'FONT'];
    var noCacheStatic = reqs.filter(function (r) {
        if (staticTypes.indexOf(r.type) === -1) return false;
        var headers = r.responseHeaders || {};
        var cc = (headers['Cache-Control'] || headers['cache-control'] || '').toLowerCase();
        var expires = headers['Expires'] || headers['expires'] || '';
        var etag = headers['ETag'] || headers['etag'] || '';
        return !cc && !expires && !etag;
    });
    if (noCacheStatic.length > 0) {
        issuesHtml += '<div class="insights-section-title" style="color:#ffb74d;font-size:12px;margin-top:16px;">Missing Cache Headers on Static Resources</div>';
        issuesHtml += '<div class="insights-alert info"><span class="insights-alert-icon">\ud83d\udca1</span><div class="insights-alert-text"><strong>' + noCacheStatic.length + ' static resource(s)</strong> (images, JS, CSS, fonts) have no Cache-Control, Expires, or ETag headers. Consider adding caching for better performance.</div></div>';
        noCacheStatic.slice(0, 10).forEach(function (r) {
            issuesHtml += '<div class="insights-card"><div class="insights-card-header">';
            issuesHtml += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
            issuesHtml += '<span class="insights-card-uri">' + escapeHtml(r.uri) + '</span>';
            issuesHtml += '<span class="insights-card-value neutral">' + (r.type || '?') + '</span>';
            issuesHtml += '</div></div>';
        });
    }

    // Large uncompressed text
    var bigUncompressed = reqs.filter(function (r) {
        if ((r.responseContentLength || 0) < 10240) return false;
        var textTypes = ['JSON', 'HTML', 'XML', 'JS', 'CSS', 'TEXT'];
        if (textTypes.indexOf(r.type) === -1) return false;
        var headers = r.responseHeaders || {};
        var enc = (headers['Content-Encoding'] || headers['content-encoding'] || '').toLowerCase();
        return !enc;
    });
    if (bigUncompressed.length > 0) {
        issuesHtml += '<div class="insights-section-title" style="color:#ffb74d;font-size:12px;margin-top:16px;">Large Uncompressed Text Responses</div>';
        issuesHtml += '<div class="insights-alert info"><span class="insights-alert-icon">\ud83d\udccf</span><div class="insights-alert-text"><strong>' + bigUncompressed.length + ' response(s)</strong> larger than 10 KB are served without compression (no gzip/br). Enabling compression could reduce transfer size significantly.</div></div>';
        bigUncompressed.sort(function (a, b) { return (b.responseContentLength || 0) - (a.responseContentLength || 0); })
            .slice(0, 10).forEach(function (r) {
                issuesHtml += '<div class="insights-card"><div class="insights-card-header">';
                issuesHtml += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
                issuesHtml += '<span class="insights-card-uri">' + escapeHtml(r.uri) + '</span>';
                issuesHtml += '<span class="insights-card-value large">' + formatBytes(r.responseContentLength) + '</span>';
                issuesHtml += '</div></div>';
            });
    }

    if (errors5xx.length === 0 && errors4xx.length === 0 && noCacheStatic.length === 0 && bigUncompressed.length === 0) {
        issuesHtml += '<div class="insights-empty">No issues detected. Looking good! \u2705</div>';
    }
    issuesHtml += '</div>';

    // ===== Combine all =====
    document.getElementById('insightsBody').innerHTML = overviewHtml + slowHtml + largeHtml + hostHtml + distHtml + dupHtml + issuesHtml;
}
