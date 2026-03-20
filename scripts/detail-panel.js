function toggleDetails(event, id) {
    event.stopPropagation();
}

function showHeaders(id) {
    const req = allRequests.find(r => r.id === id);
    if (!req) return;

    document.getElementById('headersTitle').textContent = `Headers - Request ID ${id}`;

    const reqHeaders = req.requestHeaders || {};
    const resHeaders = req.responseHeaders || {};

    let reqHtml = '';
    if (Object.keys(reqHeaders).length === 0) {
        reqHtml = '<div style="color: #666;">No request headers</div>';
    } else {
        for (const [key, value] of Object.entries(reqHeaders)) {
            reqHtml += `<div class="header-row"><span class="header-key">${escapeHtml(key)}:</span><span class="header-value">${escapeHtml(String(value))}</span></div>`;
        }
    }

    let resHtml = '';
    if (Object.keys(resHeaders).length === 0) {
        resHtml = '<div style="color: #666;">No response headers</div>';
    } else {
        for (const [key, value] of Object.entries(resHeaders)) {
            resHtml += `<div class="header-row"><span class="header-key">${escapeHtml(key)}:</span><span class="header-value">${escapeHtml(String(value))}</span></div>`;
        }
    }

    document.getElementById('requestHeadersList').innerHTML = reqHtml;
    document.getElementById('responseHeadersList').innerHTML = resHtml;
    document.getElementById('headersModal').classList.add('active');
}

function closeHeadersModal(event) {
    if (!event || event.target.id === 'headersModal') {
        document.getElementById('headersModal').classList.remove('active');
    }
}

function copyHeaders(type, btn) {
    const headersList = document.getElementById(type + 'HeadersList');
    if (!headersList) return;

    const rows = headersList.querySelectorAll('.header-row');
    let text = '';
    rows.forEach(row => {
        const keyEl = row.querySelector('.header-key');
        const valueEl = row.querySelector('.header-value');
        if (keyEl && valueEl) {
            // Remove trailing colon from key since we're adding it
            let key = keyEl.textContent.replace(/:$/, '').trim();
            const value = valueEl.textContent;
            if (key && value !== undefined) {
                text += key + ': ' + value + '\n';
            }
        }
    });

    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Copied';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    }).catch(() => {
        btn.textContent = 'Failed';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    });
}

function closeDetailPanel() {
    document.getElementById('detailPanel').classList.remove('active');
    document.getElementById('detailBackdrop').classList.remove('active');
}

function openDetailPanel(id) {
    const req = allRequests.find(r => r.id === Number(id));
    if (!req) return;

    const ordinalIndex = filteredRequests.findIndex(r => r.id === req.id);
    const ordinal = ordinalIndex >= 0 ? ordinalIndex + 1 : req.id;

    const threadId = req.threadId || req.threadName || '--';
    const threadColor = getThreadColor(threadId);
    const threadLabel = threadId !== '--' ? (threadId.length > 15 ? threadId.substring(0, 15) + '...' : threadId) : '--';

    const startTime = formatTimestamp(req.startTs, 'detail');

    document.getElementById('detailOrdinal').textContent = ordinal;
    document.getElementById('detailId').textContent = req.id;
    document.getElementById('detailThreadBadge').style.background = threadColor;
    document.getElementById('detailThreadBadge').textContent = threadId;
    document.getElementById('detailTimestamp').textContent = startTime;
    document.getElementById('detailBackdrop').classList.add('active');

    const content = document.getElementById('detailPanelContent');

    const statusClass = req.status >= 200 && req.status < 300 ? 'status-2xx' : req.status >= 300 && req.status < 400 ? 'status-3xx' : req.status >= 400 && req.status < 500 ? 'status-4xx' : 'status-5xx';

    let html = `
        <div class="detail-section">
            <div class="detail-row" style="flex-direction: column; gap: 4px;">
                <span class="detail-title-row">
                    <span class="detail-method" style="font-weight: bold; color: #81c784;">${req.method}</span>
                    <button class="detail-copy-btn" onclick="copyDetail('curl', this)">Copy as cURL</button>
                </span>
                <a href="${escapeHtml(req.uri)}" target="_blank" class="detail-uri" style="color: #4fc3f7; word-break: break-all; font-size: 12px;">${escapeHtml(req.uri)}</a>
            </div>
            ${getDetailBodySection(req, 'request')}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">
                Response
            </div>
            <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value ${statusClass}">${req.status} ${req.msg}</span></div>
            <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${req.durationHuman}</span></div>
            <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value"><span class="type-badge type-${(req.type || '').toLowerCase()}">${req.type || '-'}</span></span></div>
            <div class="detail-row"><span class="detail-label">Size</span><span class="detail-value">${formatBytes(req.responseContentLength)}</span></div>
            ${getDetailBodySection(req, 'response')}
        </div>
    `;

    const reqHeaders = req.requestHeaders || {};
    if (Object.keys(reqHeaders).length > 0) {
        html += `<div class="detail-section collapsible">
            <div class="detail-section-title">
                <div class="collapsible-title" onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
                    <span>Request Headers (${Object.keys(reqHeaders).length})</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <button class="detail-copy-btn" onclick="copyDetail('reqHeaders', this)">Copy</button>
            </div>
            <div class="collapsible-content">
                <div class="headers-list">`;
        for (const [key, value] of Object.entries(reqHeaders)) {
            html += `<div class="header-row"><span class="header-key">${escapeHtml(key)}</span><span class="header-value">${escapeHtml(String(value))}</span></div>`;
        }
        html += `</div></div></div>`;
    }

    const resHeaders = req.responseHeaders || {};
    if (Object.keys(resHeaders).length > 0) {
        html += `<div class="detail-section collapsible">
            <div class="detail-section-title">
                <div class="collapsible-title" onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
                    <span>Response Headers (${Object.keys(resHeaders).length})</span>
                    <span class="collapse-icon">▼</span>
                </div>
                <button class="detail-copy-btn" onclick="copyDetail('resHeaders', this)">Copy</button>
            </div>
            <div class="collapsible-content">
                <div class="headers-list">`;
        for (const [key, value] of Object.entries(resHeaders)) {
            html += `<div class="header-row"><span class="header-key">${escapeHtml(key)}</span><span class="header-value">${escapeHtml(String(value))}</span></div>`;
        }
        html += `</div></div></div>`;
    }

    content.innerHTML = html;
    document.getElementById('detailPanel').classList.add('active');
}

function copyDetail(type, btn) {
    let text = '';

    if (type === 'curl') {
        // Generate curl command
        const panel = document.getElementById('detailPanel');
        const methodEl = panel.querySelector('.detail-method');
        const uriEl = panel.querySelector('.detail-uri');
        const method = (methodEl && methodEl.textContent) || 'GET';
        const uri = (uriEl && uriEl.textContent) || '';

        text = `curl -X ${method}`;

        // Add headers - find request headers section
        const sections = panel.querySelectorAll('.detail-section');
        sections.forEach(section => {
            const title = section.querySelector('.detail-section-title');
            if (title && title.textContent.includes('Request Headers')) {
                const headersList = section.querySelector('.headers-list');
                if (headersList) {
                    const rows = headersList.querySelectorAll('.header-row');
                    rows.forEach(row => {
                        const keyEl = row.querySelector('.header-key');
                        const valueEl = row.querySelector('.header-value');
                        if (keyEl && valueEl) {
                            let key = keyEl.textContent;
                            const value = valueEl.textContent;
                            if (key && value) {
                                text += ` \\\n  -H '${key}: ${value}'`;
                            }
                        }
                    });
                }
            }
        });

        text += ` \\\n  '${uri}'`;

    } else if (type === 'reqHeaders' || type === 'resHeaders') {
        // Find the section that contains this button
        const section = btn.closest('.detail-section');
        const headersList = section.querySelector('.headers-list');
        if (headersList) {
            const rows = headersList.querySelectorAll('.header-row');
            rows.forEach(row => {
                const keyEl = row.querySelector('.header-key');
                const valueEl = row.querySelector('.header-value');
                if (keyEl && valueEl) {
                    let key = keyEl.textContent;
                    const value = valueEl.textContent;
                    if (key && value !== undefined) {
                        text += key + ': ' + value + '\n';
                    }
                }
            });
        }
    } else if (type === 'reqBody') {
        const panel = document.getElementById('detailPanel');
        const rows = panel.querySelectorAll('.detail-row');
        rows.forEach(row => {
            const labelEl = row.querySelector('.detail-label');
            const label = labelEl && labelEl.textContent;
            if (label === 'File') {
                const valueEl = row.querySelector('.detail-value');
                text = (valueEl && valueEl.textContent) || '';
            }
        });
    } else if (type === 'resBody') {
        const panel = document.getElementById('detailPanel');
        const sections = panel.querySelectorAll('.detail-section');
        sections.forEach(section => {
            const title = section.querySelector('.detail-section-title');
            if (title && title.textContent.includes('Response Body')) {
                const rows = section.querySelectorAll('.detail-row');
                rows.forEach(row => {
                    const labelEl = row.querySelector('.detail-label');
                    const label = labelEl && labelEl.textContent;
                    if (label === 'File') {
                        const valueEl = row.querySelector('.detail-value');
                        text = (valueEl && valueEl.textContent) || '';
                    }
                });
            }
        });
    }

    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Copied';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    }).catch(() => {
        btn.textContent = 'Failed';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    });
}

let statsPopupTimeout = null;
let statsPopupVisible = false;

function setupStatsPopupHover() {
    const statsButton = document.getElementById('statsButton');
    const statsPopup = document.getElementById('statsPopup');
    const statsTopDelayed = document.getElementById('statsTopDelayed');

    if (!statsButton || !statsPopup) return;

    function showStatsPopup() {
        clearTimeout(statsPopupTimeout);
        statsPopup.classList.add('active');
        statsPopupVisible = true;
    }

    function hideStatsPopup() {
        statsPopupTimeout = setTimeout(() => {
            statsPopup.classList.remove('active');
            statsPopupVisible = false;
        }, 200);
    }

    statsButton.addEventListener('mouseenter', showStatsPopup);
    statsButton.addEventListener('mouseleave', hideStatsPopup);
    statsPopup.addEventListener('mouseenter', showStatsPopup);
    statsPopup.addEventListener('mouseleave', hideStatsPopup);
    statsPopup.addEventListener('click', showStatsPopup);

    // Click on top delayed request to scroll to it
    if (statsTopDelayed) {
        statsTopDelayed.addEventListener('click', (e) => {
            e.stopPropagation();
            const topDelayedId = statsTopDelayed.dataset.requestId;
            if (topDelayedId) {
                // Clear previous highlights including measurement highlights
                clearMeasure();
                document.querySelectorAll('.request-row').forEach(r => r.classList.remove('highlight', 'selected-start', 'selected-end'));
                document.querySelectorAll('.timeline-bar').forEach(b => b.classList.remove('highlight', 'selected-start', 'selected-end'));
                document.querySelectorAll('.timeline-column').forEach(c => c.classList.remove('highlight', 'selected-start', 'selected-end'));

                // Find and scroll to the row in details section
                const detailsSection = document.querySelector('.details-section');
                const row = document.querySelector(`.request-row[data-id="${topDelayedId}"]`);
                if (row && detailsSection) {
                    const rowTop = row.offsetTop;
                    const containerHeight = detailsSection.clientHeight;
                    const rowHeight = row.offsetHeight;
                    detailsSection.scrollTop = Math.max(0, rowTop - containerHeight / 2 + rowHeight / 2);
                    row.classList.add('selected-start');
                }

                // Scroll timeline to show the bar
                const bar = document.querySelector(`.timeline-bar[data-id="${topDelayedId}"]`);
                const timelineSection = document.querySelector('.timeline-section');
                if (bar && timelineSection) {
                    const barLeft = bar.offsetLeft;
                    const containerWidth = timelineSection.clientWidth;
                    const barWidth = bar.offsetWidth;
                    timelineSection.scrollLeft = Math.max(0, barLeft - containerWidth / 2 + barWidth / 2);
                    bar.classList.add('selected-start');
                    const timelineCol = document.querySelector(`.timeline-column[data-id="${topDelayedId}"]`);
                    if (timelineCol) timelineCol.classList.add('selected-start');
                }
            }
        });
    }
}
