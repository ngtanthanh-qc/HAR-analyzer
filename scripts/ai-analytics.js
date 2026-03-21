// ===== AI Chat Analytics =====

function openAiAnalyticsPanel() {
    document.getElementById('aiAnalyticsPanel').classList.add('active');
    document.getElementById('aiAnalyticsBackdrop').classList.add('active');
    computeAndRenderAiAnalytics();
}

function closeAiAnalyticsPanel() {
    document.getElementById('aiAnalyticsPanel').classList.remove('active');
    document.getElementById('aiAnalyticsBackdrop').classList.remove('active');
}

function switchAiAnalyticsTab(tabName) {
    var tabs = document.getElementById('aiAnalyticsTabs');
    if (!tabs) return;
    tabs.querySelectorAll('.insights-tab').forEach(function (t) { t.classList.remove('active'); });
    var activeTab = tabs.querySelector('.insights-tab[data-tab="' + tabName + '"]');
    if (activeTab) activeTab.classList.add('active');
    var body = document.getElementById('aiAnalyticsBody');
    body.querySelectorAll('.insights-section').forEach(function (s) { s.classList.remove('active'); });
    var section = document.getElementById(tabName);
    if (section) section.classList.add('active');
}

// ===== SSE Request Detection =====

function decodeSseBody(req) {
    var chunks = req.responseBodyChunks;
    if (!chunks || chunks.length === 0) return null;
    var raw = chunks.join('\n');

    // If already looks like SSE, return as-is
    if (/^(event|data):\s/m.test(raw)) return raw;

    // Try base64 decode
    if (req.responseEncoding === 'base64' || /^[A-Za-z0-9+/=\s]+$/.test(raw.trim())) {
        try {
            var decoded = atob((req.responseOriginalBody || raw).trim());
            var bytes = Uint8Array.from(decoded, function (c) { return c.charCodeAt(0); });
            var utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            if (/^(event|data):\s/m.test(utf8)) return utf8;
        } catch (e) { }
    }

    return null;
}

function findSSERequests(requests) {
    var results = [];
    for (var i = 0; i < requests.length; i++) {
        var req = requests[i];
        var isSSE = false;
        var mimeType = req.responseMimeType || '';
        var resHeaders = req.responseHeaders || {};
        var ct = resHeaders['Content-Type'] || resHeaders['content-type'] || '';

        if (mimeType.includes('event-stream') || ct.includes('event-stream')) {
            isSSE = true;
        }

        if (!isSSE) {
            // Check body content
            var chunks = req.responseBodyChunks;
            if (chunks && chunks.length > 0) {
                var sample = chunks[0].substring(0, 500);
                if (/^(event|data):\s/m.test(sample)) isSSE = true;
                // Check for Google streaming format
                if (!isSSE && isGoogleStreamingFormat(sample)) isSSE = true;
            }
        }

        if (isSSE) {
            var rawBody = (req.responseBodyChunks || []).join('\n');
            // Check Google streaming format
            if (isGoogleStreamingFormat(rawBody)) {
                var googleChunks = parseGoogleStreamChunks(rawBody);
                if (googleChunks.length > 0) {
                    var sseReq = Object.assign({}, req);
                    // Determine if cumulative
                    var isCumul = googleChunks.length > 1 && googleChunks[1].length > googleChunks[0].length &&
                        googleChunks[1].substring(0, Math.min(20, googleChunks[0].length)) === googleChunks[0].substring(0, Math.min(20, googleChunks[0].length));
                    sseReq._sseContent = isCumul ? googleChunks[googleChunks.length - 1] : googleChunks.join('');
                    sseReq._sseEvents = googleChunks.map(function (t) { return { type: 'data', dataStr: t, data: [t], raw: t }; });
                    sseReq._sseFormat = 'google';
                    sseReq._sseMetrics = computeSSEMetrics(sseReq);
                    results.push(sseReq);
                }
            } else {
                var sseBody = decodeSseBody(req);
                if (sseBody) {
                    var sseReq = Object.assign({}, req);
                    sseReq._sseRaw = sseBody;
                    sseReq._sseEvents = parseSSEEvents(sseBody);
                    sseReq._sseContent = assembleSSEContent(sseReq._sseEvents);
                    sseReq._sseMetrics = computeSSEMetrics(sseReq);
                    results.push(sseReq);
                }
            }
        }
    }
    return results;
}

// ===== Metrics =====

function computeSSEMetrics(req) {
    var events = req._sseEvents || [];
    var content = req._sseContent || '';

    // TTFT: time from request start to first response byte
    var ttft = 0;
    if (req.startTs && req.endTs) {
        // requestTime = beginResponse - startRequest (already computed in processData)
        ttft = req.requestTime || 0;
    }

    // Streaming duration
    var streamDuration = req.responseTime || 0;

    // Token estimation (~4 chars per token for English, adjust for multilingual)
    var totalTokens = Math.round(content.length / 4);
    var totalWords = content.trim() ? content.trim().split(/\s+/).length : 0;

    // Tokens per second
    var tokensPerSec = streamDuration > 0 ? Math.round(totalTokens / (streamDuration / 1000)) : 0;

    // Data events count (content-bearing)
    var metaTypes = ['metadata', 'agent_updated', 'ping', 'error', 'done', 'heartbeat', 'status', 'message_persisted'];
    var dataEventCount = 0;
    var metaEventCount = 0;
    var hasError = false;
    var streamCompleted = false;

    for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        if (evt.type && metaTypes.indexOf(evt.type) !== -1) {
            metaEventCount++;
            if (evt.type === 'error') hasError = true;
            if (evt.type === 'done') streamCompleted = true;
        } else {
            dataEventCount++;
        }
        // Check for [DONE] signal
        if (evt.dataStr === '[DONE]') streamCompleted = true;
    }

    // Also consider stream complete if we have content and HTTP 200
    if (!streamCompleted && content.length > 0 && req.status >= 200 && req.status < 300) {
        // Check last event
        var lastEvt = events[events.length - 1];
        if (lastEvt && (lastEvt.type === 'done' || lastEvt.type === 'message_persisted' || lastEvt.dataStr === '[DONE]')) {
            streamCompleted = true;
        }
    }

    return {
        ttft: ttft,
        streamDuration: streamDuration,
        totalDuration: req.duration || 0,
        totalTokens: totalTokens,
        totalWords: totalWords,
        tokensPerSec: tokensPerSec,
        totalEvents: events.length,
        dataEventCount: dataEventCount,
        metaEventCount: metaEventCount,
        contentLength: content.length,
        hasError: hasError,
        streamCompleted: streamCompleted,
        httpStatus: req.status
    };
}

// ===== Main Render =====

function computeAndRenderAiAnalytics() {
    var sseReqs = findSSERequests(filteredRequests);
    var body = document.getElementById('aiAnalyticsBody');

    if (sseReqs.length === 0) {
        body.innerHTML = '<div class="insights-empty" style="padding:40px;text-align:center;color:#888;">' +
            '<div style="font-size:48px;margin-bottom:16px;">🤖</div>' +
            '<div style="font-size:16px;margin-bottom:8px;">No SSE streaming requests detected</div>' +
            '<div style="font-size:12px;">Load a HAR file containing AI chatbot API calls (text/event-stream responses)</div>' +
            '</div>';
        return;
    }

    var html = '';
    html += renderAiaOverview(sseReqs);
    html += renderAiaTtft(sseReqs);
    html += renderAiaSpeed(sseReqs);
    html += renderAiaCompare(sseReqs);
    html += renderAiaQuality(sseReqs);
    body.innerHTML = html;
}

// ===== Overview Tab =====

function renderAiaOverview(sseReqs) {
    var ttfts = sseReqs.map(function (r) { return r._sseMetrics.ttft; });
    var speeds = sseReqs.map(function (r) { return r._sseMetrics.tokensPerSec; });
    var durations = sseReqs.map(function (r) { return r._sseMetrics.totalDuration; });
    var tokens = sseReqs.map(function (r) { return r._sseMetrics.totalTokens; });

    var avgTtft = ttfts.reduce(function (a, b) { return a + b; }, 0) / ttfts.length;
    var avgSpeed = speeds.reduce(function (a, b) { return a + b; }, 0) / speeds.length;
    var totalTokens = tokens.reduce(function (a, b) { return a + b; }, 0);
    var avgDur = durations.reduce(function (a, b) { return a + b; }, 0) / durations.length;

    var minTtft = Math.min.apply(null, ttfts);
    var maxTtft = Math.max.apply(null, ttfts);
    var p50Ttft = insightsPercentile(ttfts, 0.5);
    var p95Ttft = insightsPercentile(ttfts, 0.95);

    var passedCount = sseReqs.filter(function (r) {
        var m = r._sseMetrics;
        return m.streamCompleted && !m.hasError && m.httpStatus >= 200 && m.httpStatus < 300 && m.contentLength > 0;
    }).length;

    var html = '<div class="insights-section active" id="aia-overview">';
    html += '<div class="insights-summary-grid">';
    html += insightsSummaryCard('SSE Requests', sseReqs.length, '#a78bfa');
    html += insightsSummaryCard('Avg TTFT', formatDuration(avgTtft), '#4fc3f7');
    html += insightsSummaryCard('P50 TTFT', formatDuration(p50Ttft), '#4fc3f7');
    html += insightsSummaryCard('P95 TTFT', formatDuration(p95Ttft), '#ff9800');
    html += insightsSummaryCard('Fastest TTFT', formatDuration(minTtft), '#81c784');
    html += insightsSummaryCard('Slowest TTFT', formatDuration(maxTtft), '#e57373');
    html += insightsSummaryCard('Avg Speed', avgSpeed.toFixed(0) + ' tok/s', '#ffb74d');
    html += insightsSummaryCard('Total Tokens', totalTokens.toLocaleString(), '#ce93d8');
    html += insightsSummaryCard('Avg Duration', formatDuration(avgDur));
    html += insightsSummaryCard('Quality', passedCount + '/' + sseReqs.length + ' passed', passedCount === sseReqs.length ? '#81c784' : '#ffa726');
    html += '</div>';

    // Alerts
    var slowReqs = sseReqs.filter(function (r) { return r._sseMetrics.ttft > 3000; });
    if (slowReqs.length > 0) {
        html += '<div class="insights-alert warning"><span class="insights-alert-icon">🐢</span><div class="insights-alert-text"><strong>' + slowReqs.length + ' request(s)</strong> have TTFT > 3 seconds</div></div>';
    }
    var errorReqs = sseReqs.filter(function (r) { return r._sseMetrics.hasError; });
    if (errorReqs.length > 0) {
        html += '<div class="insights-alert"><span class="insights-alert-icon">🔥</span><div class="insights-alert-text"><strong>' + errorReqs.length + ' request(s)</strong> contain error events</div></div>';
    }
    var incompleteReqs = sseReqs.filter(function (r) { return !r._sseMetrics.streamCompleted; });
    if (incompleteReqs.length > 0) {
        html += '<div class="insights-alert warning"><span class="insights-alert-icon">⚠️</span><div class="insights-alert-text"><strong>' + incompleteReqs.length + ' stream(s)</strong> may not have completed normally</div></div>';
    }

    html += '</div>';
    return html;
}

// ===== TTFT Tab =====

function renderAiaTtft(sseReqs) {
    var sorted = sseReqs.slice().sort(function (a, b) { return a._sseMetrics.ttft - b._sseMetrics.ttft; });
    var maxTtft = sorted.length > 0 ? sorted[sorted.length - 1]._sseMetrics.ttft : 1;

    var html = '<div class="insights-section" id="aia-ttft">';
    html += '<div class="insights-section-title">⏱ Time To First Token (ranked fastest → slowest)</div>';

    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        var m = r._sseMetrics;
        var pct = maxTtft > 0 ? Math.max(3, Math.round(m.ttft / maxTtft * 100)) : 3;
        var ttftClass = m.ttft < 1000 ? 'aia-fast' : m.ttft < 3000 ? 'aia-medium' : 'aia-slow';
        var uri = r.uri.length > 60 ? r.uri.substring(0, 60) + '...' : r.uri;

        html += '<div class="aia-ttft-card" onclick="closeAiAnalyticsPanel(); insightsScrollToRequest(' + r.id + ')" style="cursor:pointer;">';
        html += '<div class="aia-ttft-header">';
        html += '<span class="insights-card-rank">#' + (i + 1) + '</span>';
        html += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
        html += '<span class="insights-card-uri" title="' + escapeHtml(r.uri) + '">' + escapeHtml(uri) + '</span>';
        html += '<span class="aia-ttft-value ' + ttftClass + '">' + formatDuration(m.ttft) + '</span>';
        html += '</div>';
        html += '<div class="aia-ttft-bar-track"><div class="aia-ttft-bar ' + ttftClass + '" style="width:' + pct + '%;"></div></div>';
        html += '<div class="aia-ttft-meta">';
        html += '<span>Stream: ' + formatDuration(m.streamDuration) + '</span>';
        html += '<span>' + m.tokensPerSec + ' tok/s</span>';
        html += '<span>~' + m.totalTokens + ' tokens</span>';
        html += '<span>ID: ' + r.id + '</span>';
        html += '</div>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ===== Speed Tab =====

function renderAiaSpeed(sseReqs) {
    var sorted = sseReqs.slice().sort(function (a, b) { return b._sseMetrics.tokensPerSec - a._sseMetrics.tokensPerSec; });
    var speeds = sorted.map(function (r) { return r._sseMetrics.tokensPerSec; });

    var avgSpeed = speeds.reduce(function (a, b) { return a + b; }, 0) / speeds.length;
    var p50 = insightsPercentile(speeds, 0.5);
    var p95 = insightsPercentile(speeds, 0.95);
    var maxSpeed = speeds.length > 0 ? speeds[0] : 1;

    var html = '<div class="insights-section" id="aia-speed">';
    html += '<div class="insights-summary-grid">';
    html += insightsSummaryCard('Avg Speed', avgSpeed.toFixed(0) + ' tok/s');
    html += insightsSummaryCard('P50', p50 + ' tok/s');
    html += insightsSummaryCard('P95', p95 + ' tok/s');
    html += insightsSummaryCard('Max', maxSpeed + ' tok/s', '#81c784');
    html += '</div>';

    html += '<div class="insights-section-title">⚡ Streaming Speed (ranked fastest → slowest)</div>';

    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        var m = r._sseMetrics;
        var pct = maxSpeed > 0 ? Math.max(3, Math.round(m.tokensPerSec / maxSpeed * 100)) : 3;
        var uri = r.uri.length > 60 ? r.uri.substring(0, 60) + '...' : r.uri;

        html += '<div class="aia-ttft-card" onclick="closeAiAnalyticsPanel(); insightsScrollToRequest(' + r.id + ')" style="cursor:pointer;">';
        html += '<div class="aia-ttft-header">';
        html += '<span class="insights-card-rank">#' + (i + 1) + '</span>';
        html += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
        html += '<span class="insights-card-uri" title="' + escapeHtml(r.uri) + '">' + escapeHtml(uri) + '</span>';
        html += '<span class="aia-ttft-value">' + m.tokensPerSec + ' tok/s</span>';
        html += '</div>';
        html += '<div class="aia-ttft-bar-track"><div class="aia-ttft-bar aia-fast" style="width:' + pct + '%;"></div></div>';
        html += '<div class="aia-ttft-meta">';
        html += '<span>~' + m.totalTokens + ' tokens</span>';
        html += '<span>~' + m.totalWords + ' words</span>';
        html += '<span>Stream: ' + formatDuration(m.streamDuration) + '</span>';
        html += '<span>TTFT: ' + formatDuration(m.ttft) + '</span>';
        html += '</div>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ===== Compare Tab =====

function renderAiaCompare(sseReqs) {
    var html = '<div class="insights-section" id="aia-compare">';
    html += '<div class="insights-section-title">⇄ Side-by-Side Comparison</div>';

    html += '<table class="aia-compare-table">';
    html += '<thead><tr>';
    html += '<th>ID</th><th>Method</th><th>URI</th><th>TTFT</th><th>Speed</th>';
    html += '<th>Tokens</th><th>Duration</th><th>Status</th><th>Quality</th>';
    html += '</tr></thead><tbody>';

    // Find min/max for highlighting
    var ttfts = sseReqs.map(function (r) { return r._sseMetrics.ttft; });
    var speeds = sseReqs.map(function (r) { return r._sseMetrics.tokensPerSec; });
    var minTtft = Math.min.apply(null, ttfts);
    var maxTtft = Math.max.apply(null, ttfts);
    var maxSpeed = Math.max.apply(null, speeds);
    var minSpeed = Math.min.apply(null, speeds);

    for (var i = 0; i < sseReqs.length; i++) {
        var r = sseReqs[i];
        var m = r._sseMetrics;
        var uri = r.uri.length > 50 ? r.uri.substring(0, 50) + '...' : r.uri;

        var ttftClass = m.ttft === minTtft && sseReqs.length > 1 ? 'aia-best' : m.ttft === maxTtft && sseReqs.length > 1 ? 'aia-worst' : '';
        var speedClass = m.tokensPerSec === maxSpeed && sseReqs.length > 1 ? 'aia-best' : m.tokensPerSec === minSpeed && sseReqs.length > 1 ? 'aia-worst' : '';

        var passed = m.streamCompleted && !m.hasError && m.httpStatus >= 200 && m.httpStatus < 300 && m.contentLength > 0;
        var qualityHtml = passed ? '<span class="aia-best">✓ Pass</span>' : '<span class="aia-worst">✗ Fail</span>';

        html += '<tr onclick="closeAiAnalyticsPanel(); insightsScrollToRequest(' + r.id + ')">';
        html += '<td>' + r.id + '</td>';
        html += '<td><span class="endpoint-method ' + r.methodClass + '" style="font-size:10px;padding:2px 6px;">' + r.method + '</span></td>';
        html += '<td title="' + escapeHtml(r.uri) + '">' + escapeHtml(uri) + '</td>';
        html += '<td class="' + ttftClass + '">' + formatDuration(m.ttft) + '</td>';
        html += '<td class="' + speedClass + '">' + m.tokensPerSec + ' tok/s</td>';
        html += '<td>~' + m.totalTokens + '</td>';
        html += '<td>' + formatDuration(m.totalDuration) + '</td>';
        html += '<td><span class="status-badge ' + r.statusClass + '" style="font-size:11px;padding:2px 6px;">' + r.status + '</span></td>';
        html += '<td>' + qualityHtml + '</td>';
        html += '</tr>';
    }

    html += '</tbody></table>';
    html += '</div>';
    return html;
}

// ===== Quality Tab =====

function renderAiaQuality(sseReqs) {
    var html = '<div class="insights-section" id="aia-quality">';
    html += '<div class="insights-section-title">✓ Quality Checklist</div>';

    var allPassed = 0;

    for (var i = 0; i < sseReqs.length; i++) {
        var r = sseReqs[i];
        var m = r._sseMetrics;
        var uri = r.uri.length > 60 ? r.uri.substring(0, 60) + '...' : r.uri;

        var checks = [
            { label: 'HTTP Status 2xx', pass: m.httpStatus >= 200 && m.httpStatus < 300, detail: 'Status: ' + m.httpStatus },
            { label: 'Stream Completed', pass: m.streamCompleted, detail: m.streamCompleted ? 'Received done/[DONE] signal' : 'No completion signal detected' },
            { label: 'No Error Events', pass: !m.hasError, detail: m.hasError ? 'Error event(s) found in stream' : 'Clean stream' },
            { label: 'Response Has Content', pass: m.contentLength > 0, detail: m.contentLength + ' chars assembled' },
            { label: 'TTFT < 3s', pass: m.ttft < 3000, detail: 'TTFT: ' + formatDuration(m.ttft) },
            { label: 'Streaming Speed > 10 tok/s', pass: m.tokensPerSec > 10, detail: m.tokensPerSec + ' tok/s' }
        ];

        var passCount = checks.filter(function (c) { return c.pass; }).length;
        var allPass = passCount === checks.length;
        if (allPass) allPassed++;

        html += '<div class="aia-quality-card">';
        html += '<div class="aia-quality-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<span class="insights-card-rank">#' + (i + 1) + '</span>';
        html += '<span class="insights-card-method ' + r.methodClass + '">' + r.method + '</span>';
        html += '<span class="insights-card-uri" title="' + escapeHtml(r.uri) + '">ID ' + r.id + ' — ' + escapeHtml(uri) + '</span>';
        html += '<span class="aia-quality-score ' + (allPass ? 'aia-best' : 'aia-worst') + '">' + passCount + '/' + checks.length + '</span>';
        html += '</div>';
        html += '<div class="aia-quality-checks">';

        for (var j = 0; j < checks.length; j++) {
            var c = checks[j];
            html += '<div class="aia-check-item">';
            html += '<span class="' + (c.pass ? 'aia-check-pass' : 'aia-check-fail') + '">' + (c.pass ? '✓' : '✗') + '</span>';
            html += '<span class="aia-check-label">' + c.label + '</span>';
            html += '<span class="aia-check-detail">' + c.detail + '</span>';
            html += '</div>';
        }

        html += '</div></div>';
    }

    // Summary at top
    var summaryClass = allPassed === sseReqs.length ? 'aia-best' : 'aia-worst';
    var summaryHtml = '<div class="aia-quality-summary">';
    summaryHtml += '<span class="' + summaryClass + '" style="font-size:16px;font-weight:600;">' + allPassed + ' / ' + sseReqs.length + '</span>';
    summaryHtml += '<span style="color:#aaa;"> requests passed all quality checks</span>';
    summaryHtml += '</div>';

    html = html.replace('<div class="insights-section-title">✓ Quality Checklist</div>',
        '<div class="insights-section-title">✓ Quality Checklist</div>' + summaryHtml);

    html += '</div>';
    return html;
}
