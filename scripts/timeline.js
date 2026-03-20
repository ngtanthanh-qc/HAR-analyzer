// Convert slider value (0-100) to actual timeline width using logarithmic scale
function sliderToWidth(sliderValue) {
    // Slider 0-100 maps to 500-2M using exponential curve
    // This makes lower zoom levels less sensitive
    const minLog = Math.log(500);
    const maxLog = Math.log(2000000);
    const scale = (maxLog - minLog) / 100;
    return Math.round(Math.exp(minLog + scale * sliderValue));
}

function widthToSlider(width) {
    const minLog = Math.log(500);
    const maxLog = Math.log(2000000);
    const scale = (maxLog - minLog) / 100;
    return Math.round((Math.log(width) - minLog) / scale);
}

function getTimelineWidth() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return 20000;
    return sliderToWidth(parseInt(zoomSlider.value));
}

function handleZoomChange() {
    renderTimeline(true);
}

function zoomIn() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;
    const current = parseInt(zoomSlider.value);
    zoomSlider.value = Math.min(100, current + 5);
    handleZoomChange();
}

function zoomOut() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;
    const current = parseInt(zoomSlider.value);
    zoomSlider.value = Math.max(0, current - 5);
    handleZoomChange();
}

function renderTimeline(preserveScroll = false, scrollToId = null, savedScrollTop = null) {
    const zoomSlider = document.getElementById('zoomSlider');
    const prevWidth = zoomSlider ? parseInt(zoomSlider.getAttribute('data-prev-value') || 20000) : 20000;

    const container = document.getElementById('timeline');

    const timelineSection = document.querySelector('.timeline-section');
    const detailsSection = document.querySelector('.details-section');
    let firstVisibleTimestamp = null;
    let oldScrollTop = savedScrollTop || 0;

    if (preserveScroll && timelineSection && !scrollToId) {
        // Find the first visible cell's start timestamp
        const scrollLeft = timelineSection.scrollLeft;
        const bars = timelineSection.querySelectorAll('.timeline-bar');
        for (const bar of bars) {
            const barLeft = bar.offsetLeft;
            const barWidth = bar.offsetWidth;
            // Check if bar's start is visible (within viewport)
            if (barLeft >= scrollLeft) {
                firstVisibleTimestamp = parseInt(bar.dataset.start);
                break;
            }
            // Also check if bar is partially visible (start is before scroll but bar extends into view)
            if (barLeft + barWidth > scrollLeft) {
                firstVisibleTimestamp = parseInt(bar.dataset.start);
                break;
            }
        }
        oldScrollTop = detailsSection ? detailsSection.scrollTop : 0;
    }

    threadColors = {};

    const timelineWidth = getTimelineWidth();

    if (zoomSlider) {
        zoomSlider.setAttribute('data-prev-value', timelineWidth);
    }

    const displayValue = timelineWidth >= 1000000 ? (timelineWidth / 1000000).toFixed(1) + 'M px' :
        timelineWidth >= 1000 ? (timelineWidth / 1000).toFixed(0) + 'k px' :
            timelineWidth + 'px';
    document.getElementById('zoomValue').textContent = displayValue;

    const range = timeRange.max - timeRange.min || 1;

    let detailsHtml = `
        <div class="details-section">
            <table class="timeline-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Thread</th>
                        <th>Timestamp</th>
                        <th>Method</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Req</th>
                        <th>Res</th>
                        <th>Hdr</th>
                        <th>URI</th>
                    </tr>
                </thead>
                <tbody>
    `;

    const timelineSectionEl = document.querySelector('.timeline-section');
    const visibleWidth = timelineSectionEl ? timelineSectionEl.clientWidth : 1000;
    const effectiveTimelineWidth = Math.max(timelineWidth, visibleWidth);

    let timelineHtml = `
        <div class="timeline-section" id="timelineSection">
            <div class="timeline-header" style="width: ${effectiveTimelineWidth}px;">
                ${renderTimeHeader(range, timelineWidth)}
            </div>
            <div class="timeline-scroll" id="timelineScroll" style="width: ${effectiveTimelineWidth}px;">
    `;

    filteredRequests.forEach((req, index) => {
        const leftPx = ((req.startTs - timeRange.min) / range) * timelineWidth;
        const rightPx = ((req.endTs - timeRange.min) / range) * timelineWidth;
        const actualWidthPx = rightPx - leftPx;
        const threadColor = getThreadColor(req.threadId);
        const threadLabel = req.threadId !== '--' ? (req.threadId.length > 15 ? req.threadId.substring(0, 15) + '...' : req.threadId) : '--';
        const threadTitle = req.threadId !== '--' ? req.threadId : '';

        const minVisibleWidth = 4;
        const displayWidth = Math.max(actualWidthPx, minVisibleWidth);
        const isExaggerated = actualWidthPx < minVisibleWidth;
        const rowNum = index + 1;

        detailsHtml += `
            <tr class="request-row"
                data-id="${req.id}"
                data-start="${req.startTs}"
                data-end="${req.endTs}"
                data-duration="${req.duration}"
                data-uri="${escapeHtml(req.uri).replace(/"/g, '&quot;')}"
>
                <td style="text-align: center;">${rowNum}</td>
                <td style="font-size: 13px; font-weight: 500; cursor: pointer; color: #4fc3f7; text-decoration: underline;">${req.id}</td>
                <td><span class="thread-badge" style="background:${threadColor};font-size:10px;padding:2px 6px;" title="${threadTitle}">${threadLabel}</span></td>
                <td style="font-size: 12px; color: #ccc;">${formatTimestamp(req.startTs, 'table')}</td>
                <td style="text-align: center;"><span class="endpoint-method ${req.methodClass}" style="font-size: 11px; padding: 2px 7px;">${req.method}</span></td>
                <td class="duration-text" style="font-size: 12px;">${req.durationHuman}</td>
                <td><span class="status-badge ${req.statusClass}" style="font-size: 12px; padding: 2px 7px;" title="${req.msg}">${req.status}</span></td>
                <td style="text-align: center;"><span class="type-badge type-${(req.type || '').toLowerCase()}" title="${escapeHtml(req.type || '')}">${req.type || '-'}</span></td>
                <td style="text-align: center;">${getBodyCell(req.requestBodyChunks, req.requestBodyPath, 'request', req.id)}</td>
                <td style="text-align: center;">${getBodyCell(req.responseBodyChunks, req.responseBodyPath, 'response', req.id, req.responseContentLength)}</td>
                <td style="text-align: center;"><button class="action-btn" onclick="event.stopPropagation(); showHeaders(${req.id})">📚</button></td>
                <td class="endpoint-cell" style="font-size: 12px;" onmouseenter="showUriTooltipFromData(event, this)" onmouseleave="hideUriTooltip()" data-original-uri="${escapeHtml(req.uri).replace(/"/g, '&quot;')}">
                    ${escapeHtml(getDisplayUri(req.uri))}
                </td>
            </tr>
        `;

        const showContent = displayWidth > 60;
        const showBadge = displayWidth > 25;

        timelineHtml += `
            <div class="timeline-column" data-id="${req.id}">
                <div class="timeline-bar ${req.statusClass} ${isExaggerated ? 'exaggerated' : ''}" 
                     style="left: ${leftPx}px; width: ${displayWidth}px;"
                     data-id="${req.id}"
                     data-start="${req.startTs}"
                     data-end="${req.endTs}"
                     title="${req.endpoint} - ${req.durationHuman}">
                    <span class="thread-badge" style="background:${threadColor};font-size:10px;padding:2px 6px;" title="${threadTitle}">${threadLabel}</span>
                </div>
            </div>
        `;
    });

    detailsHtml += `
                </tbody>
            </table>
        </div>
        <div class="resizer" id="resizer"></div>
    `;

    timelineHtml += `
            </div>
        </div>
    `;

    container.innerHTML = detailsHtml + timelineHtml;

    initResizer();
    syncScrollHandler();
    setupResizeHandler();
    updateStickyColumns();

    // Restore measurement markers after re-render
    if (startTime !== null || endTime !== null) {
        const newTimelineScroll = document.querySelector('.timeline-scroll');
        const newWidth = getTimelineWidth();
        const range = timeRange.max - timeRange.min || 1;

        if (startTime !== null) {
            const startPx = ((startTime - timeRange.min) / range) * newWidth;
            startMarker = document.createElement('div');
            startMarker.className = 'measure-marker start';
            const label = document.createElement('div');
            label.className = 'measure-marker-label start';
            label.textContent = formatTimestamp(startTime, 'header');
            startMarker.appendChild(label);
            startMarker.style.left = startPx + 'px';
            startMarker.style.height = '100%';
            newTimelineScroll.appendChild(startMarker);
        }

        if (endTime !== null) {
            const endPx = ((endTime - timeRange.min) / range) * newWidth;
            endMarker = document.createElement('div');
            endMarker.className = 'measure-marker end';
            const label = document.createElement('div');
            label.className = 'measure-marker-label end';
            label.textContent = formatTimestamp(endTime, 'header');
            endMarker.appendChild(label);
            endMarker.style.left = endPx + 'px';
            endMarker.style.height = '100%';
            newTimelineScroll.appendChild(endMarker);
        }

        // Ensure measure panel is visible
        document.getElementById('measurePanel').classList.add('active');
    }

    const newTimelineSection = document.querySelector('.timeline-section');
    const newDetailsSection = document.querySelector('.details-section');

    if (newDetailsSection) {
        newDetailsSection.addEventListener('click', handleRowClick);
    }
    if (newTimelineSection) {
        newTimelineSection.addEventListener('click', handleTimelineBarClick);
    }

    if (scrollToId) {
        // Scroll to a specific request ID
        const row = document.querySelector(`.request-row[data-id="${scrollToId}"]`);
        if (row && newDetailsSection) {
            newDetailsSection.scrollTop = row.offsetTop - 10;
            newTimelineSection.scrollTop = newDetailsSection.scrollTop;
        }
    } else if (preserveScroll && firstVisibleTimestamp !== null) {
        const newWidth = getTimelineWidth();
        const range = timeRange.max - timeRange.min || 1;

        // Calculate the new scroll position so the first visible cell's start stays at the same position
        const newScrollLeft = ((firstVisibleTimestamp - timeRange.min) / range) * newWidth;

        if (newTimelineSection) {
            newTimelineSection.scrollLeft = Math.max(0, newScrollLeft);
            newTimelineSection.scrollTop = oldScrollTop;
        }
        if (newDetailsSection) {
            newDetailsSection.scrollTop = oldScrollTop;
        }
    }

    document.getElementById('content').classList.add('active');
    document.getElementById('empty').style.display = 'none';
}

function renderTimeHeader(range, width) {
    let html = '';
    const timelineSection = document.querySelector('.timeline-section');
    const visibleWidth = timelineSection ? timelineSection.clientWidth : 1000;
    const effectiveWidth = Math.max(width, visibleWidth);

    const minTickSpacing = 120;
    const tickCount = Math.max(5, Math.floor(effectiveWidth / minTickSpacing));

    for (let i = 0; i <= tickCount; i++) {
        const leftPx = (i / tickCount) * effectiveWidth;
        const time = timeRange.min + (range * i / tickCount);
        const timeStr = formatTimestamp(time, 'header');

        html += `
            <div class="timeline-header-tick" style="left: ${leftPx}px;"></div>
            <div class="timeline-header-label" style="left: ${leftPx}px;">${timeStr}</div>
        `;
    }
    return html;
}

let cursorLine = null;
let cursorTime = null;

function syncScrollHandler() {
    const detailsSection = document.querySelector('.details-section');
    const timelineSection = document.querySelector('.timeline-section');
    const timelineScroll = document.querySelector('.timeline-scroll');
    const tableContainer = document.querySelector('.table-container');

    if (!cursorLine) {
        cursorLine = document.createElement('div');
        cursorLine.className = 'cursor-line';
        cursorLine.id = 'cursorLine';
        document.body.appendChild(cursorLine);
    }

    if (!cursorTime) {
        cursorTime = document.createElement('div');
        cursorTime.className = 'cursor-time';
        cursorTime.id = 'cursorTime';
        document.body.appendChild(cursorTime);
    }

    if (detailsSection && timelineSection) {
        // Only sync vertical scrolling
        detailsSection.onscroll = () => {
            timelineSection.scrollTop = detailsSection.scrollTop;
        };
        timelineSection.onscroll = () => {
            detailsSection.scrollTop = timelineSection.scrollTop;
        };
    }

    // Global shift+scroll handler for horizontal scrolling
    document.addEventListener('wheel', (e) => {
        if (e.shiftKey) {
            const target = e.target;
            const isInDetails = detailsSection && detailsSection.contains(target);
            const isInTimeline = timelineSection && timelineSection.contains(target);

            if (isInDetails) {
                // Scroll details section (table) horizontally with reduced sensitivity
                e.preventDefault();
                if (detailsSection) detailsSection.scrollLeft += e.deltaY * 0.2;
            } else if (isInTimeline) {
                // Scroll timeline (gantt) horizontally
                e.preventDefault();
                if (timelineSection) timelineSection.scrollLeft += e.deltaY;
            } else {
                // Default: scroll timeline
                e.preventDefault();
                if (timelineSection) timelineSection.scrollLeft += e.deltaY;
            }
        }
    }, { passive: false, capture: true });

    if (timelineSection && cursorLine && cursorTime) {
        timelineSection.addEventListener('mousemove', (e) => {
            const rect = timelineSection.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const scrollLeft = timelineSection.scrollLeft;
            const adjustedX = x + scrollLeft;

            const timelineWidth = getTimelineWidth();
            const visibleWidth = timelineSection.clientWidth;
            const effectiveWidth = Math.max(timelineWidth, visibleWidth);
            const range = timeRange.max - timeRange.min || 1;

            if (adjustedX >= 0 && adjustedX <= effectiveWidth) {
                const timestamp = timeRange.min + (adjustedX / effectiveWidth) * range;
                const timeStr = formatTimestamp(timestamp, 'header');

                cursorLine.style.display = 'block';
                cursorLine.style.left = e.clientX + 'px';
                cursorLine.style.top = rect.top + 'px';
                cursorLine.style.height = rect.height + 'px';

                cursorTime.style.display = 'block';
                cursorTime.style.left = e.clientX + 'px';
                cursorTime.style.top = (rect.top + 5) + 'px';
                cursorTime.textContent = timeStr;
            }
        });

        timelineSection.addEventListener('mouseleave', () => {
            cursorLine.style.display = 'none';
            cursorTime.style.display = 'none';
        });

        timelineSection.addEventListener('click', (e) => {
            if (e.target.classList.contains('timeline-bar')) return;

            const rect = timelineSection.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const scrollLeft = timelineSection.scrollLeft;
            const adjustedX = x + scrollLeft;

            const timelineWidth = getTimelineWidth();
            const visibleWidth = timelineSection.clientWidth;
            const effectiveWidth = Math.max(timelineWidth, visibleWidth);
            const range = timeRange.max - timeRange.min || 1;

            if (adjustedX >= 0 && adjustedX <= effectiveWidth) {
                const timestamp = timeRange.min + (adjustedX / effectiveWidth) * range;
                handleTimelineClick(timestamp, adjustedX);
            }
        });
    }

    document.querySelectorAll('.request-row').forEach(row => {
        row.addEventListener('mouseenter', () => {
            const id = row.dataset.id;
            row.classList.add('hover');
            const col = document.querySelector(`.timeline-column[data-id="${id}"]`);
            if (col) col.classList.add('hover');
            const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
            if (bar) bar.classList.add('hover');
        });
        row.addEventListener('mouseleave', () => {
            const id = row.dataset.id;
            row.classList.remove('hover');
            const col = document.querySelector(`.timeline-column[data-id="${id}"]`);
            if (col) col.classList.remove('hover');
            const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
            if (bar) bar.classList.remove('hover');
        });
    });

    document.querySelectorAll('.timeline-column').forEach(col => {
        col.addEventListener('mouseenter', () => {
            const id = col.dataset.id;
            col.classList.add('hover');
            const row = document.querySelector(`.request-row[data-id="${id}"]`);
            if (row) row.classList.add('hover');
            const bar = col.querySelector('.timeline-bar');
            if (bar) bar.classList.add('hover');
        });
        col.addEventListener('mouseleave', () => {
            const id = col.dataset.id;
            col.classList.remove('hover');
            const row = document.querySelector(`.request-row[data-id="${id}"]`);
            if (row) row.classList.remove('hover');
            const bar = col.querySelector('.timeline-bar');
            if (bar) bar.classList.remove('hover');
        });
    });
}

function handleTimelineClick(timestamp, xPx) {
    const timelineScroll = document.querySelector('.timeline-scroll');

    // Clear table row highlights (unless only one row selected)
    if (selectedRows.size !== 1) {
        selectedRows.clear();
        lastSelectedId = null;
        updateRowHighlights();
    }

    // If both start and end are set, clear measurement first
    if (startTime && endTime) {
        if (startMarker) {
            startMarker.style.display = 'none';
        }
        if (endMarker) {
            endMarker.style.display = 'none';
        }
        startTime = null;
        endTime = null;
        selectionState = null;
        document.getElementById('measurePanel').classList.remove('active');
        return;
    }

    if (!selectionState) {
        if (startMarker) {
            startMarker.style.display = 'none';
        }
        if (endMarker) {
            endMarker.style.display = 'none';
        }

        selectionState = 'start';
        startTime = timestamp;

        if (!startMarker) {
            startMarker = document.createElement('div');
            startMarker.className = 'measure-marker start';
            timelineScroll.appendChild(startMarker);
        }

        const label = document.createElement('div');
        label.className = 'measure-marker-label start';
        label.textContent = formatTime(timestamp);
        startMarker.innerHTML = '';
        startMarker.appendChild(label);
        startMarker.style.display = 'block';
        startMarker.style.left = xPx + 'px';
        startMarker.style.height = '100%';

        document.getElementById('measurePanel').classList.add('active');
        document.getElementById('measureStartId').textContent = formatTime(timestamp);
        document.getElementById('measureEndId').textContent = '...';
        document.getElementById('measureTotal').textContent = '...';
        document.getElementById('measureTime').textContent = 'Select end...';

    } else if (selectionState === 'start') {
        selectionState = 'end';
        endTime = timestamp;

        if (!endMarker) {
            endMarker = document.createElement('div');
            endMarker.className = 'measure-marker end';
            timelineScroll.appendChild(endMarker);
        }

        const label = document.createElement('div');
        label.className = 'measure-marker-label end';
        label.textContent = formatTime(timestamp);
        endMarker.innerHTML = '';
        endMarker.appendChild(label);
        endMarker.style.display = 'block';
        endMarker.style.left = xPx + 'px';
        endMarker.style.height = '100%';

        const [minTs, maxTs] = startTime < timestamp ? [startTime, timestamp] : [timestamp, startTime];

        const rows = document.querySelectorAll('.request-row');
        let firstOrdinal = null, lastOrdinal = null;
        let firstStart = null, lastEnd = null;
        let count = 0;

        rows.forEach((row, idx) => {
            const rowStart = parseInt(row.dataset.start);
            const rowEnd = parseInt(row.dataset.end);
            if (rowEnd >= minTs && rowStart <= maxTs) {
                count++;
                if (firstOrdinal === null) {
                    firstOrdinal = idx + 1;
                    firstStart = rowStart;
                }
                lastOrdinal = idx + 1;
                lastEnd = rowEnd;
            }
        });

        const delta = Math.abs(timestamp - startTime);
        const fullDuration = lastEnd && firstStart ? lastEnd - firstStart : delta;

        document.getElementById('measureEndId').textContent = formatTime(timestamp);
        document.getElementById('measureTotal').textContent = firstOrdinal !== null ? `${formatDuration(fullDuration)} (${count})` : '--';
        document.getElementById('measureTime').textContent = formatDuration(delta);
        selectionState = null;
        updateSelectionButtons();
    }
}

function formatTime(timestamp) {
    return formatTimestamp(timestamp, 'header');
}

function updateSelectionButtons() {
    const selBtn = document.getElementById('selBtn');
    if (selBtn) {
        const hasTimeSelection = startTime && endTime;
        const hasRowSelection = selectedRows.size > 0;
        selBtn.disabled = !hasTimeSelection && !hasRowSelection;
    }
}

function updateTimelineHeader() {
    const timelineSection = document.querySelector('.timeline-section');
    const timelineHeader = document.querySelector('.timeline-header');
    const timelineScroll = document.querySelector('.timeline-scroll');
    if (!timelineSection || !timelineHeader || !timelineScroll) return;

    const timelineWidth = getTimelineWidth();
    const visibleWidth = timelineSection.clientWidth;
    const effectiveWidth = Math.max(timelineWidth, visibleWidth);
    const range = timeRange.max - timeRange.min || 1;

    timelineHeader.style.width = effectiveWidth + 'px';
    timelineScroll.style.width = effectiveWidth + 'px';
    timelineHeader.innerHTML = renderTimeHeader(range, timelineWidth);
}

let resizeTimeout = null;
let resizeHandlerSetup = false;
function updateStickyColumns() {
    const table = document.querySelector('.timeline-table');
    if (!table) return;
    const headerCells = Array.from(table.querySelectorAll('thead tr th'));
    if (!headerCells.length) return;
    // Sort sticky indices ascending so we accumulate left-to-right
    const stickyIndices = [...stickyColumnIndices].sort((a, b) => a - b);
    const stickySet = new Set(stickyIndices);
    // Reset ALL columns first
    headerCells.forEach((th, i) => {
        const nthChild = i + 1;
        table.querySelectorAll(`th:nth-child(${nthChild}), td:nth-child(${nthChild})`).forEach(cell => {
            cell.style.position = '';
            cell.style.left = '';
            cell.style.zIndex = '';
            cell.classList.remove('sticky-col');
        });
    });
    // Apply sticky to selected columns, stacking them at the left edge
    let stickyAccumulated = 0;
    stickyIndices.forEach(i => {
        const th = headerCells[i];
        if (!th) return;
        const leftPx = stickyAccumulated + 'px';
        const nthChild = i + 1;
        table.querySelectorAll(`th:nth-child(${nthChild}), td:nth-child(${nthChild})`).forEach(cell => {
            cell.style.position = 'sticky';
            cell.style.left = leftPx;
            cell.style.zIndex = cell.tagName === 'TH' ? '15' : '5';
            if (cell.tagName === 'TD') cell.classList.add('sticky-col');
        });
        stickyAccumulated += th.offsetWidth;
    });
}

function setupResizeHandler() {
    if (resizeHandlerSetup) return;
    resizeHandlerSetup = true;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateTimelineHeader();
            updateStickyColumns();
        }, 100);
    });
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const detailsSection = document.querySelector('.details-section');

    if (!resizer || !detailsSection) return;

    let isResizing = false;
    let lastUpdate = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const container = document.querySelector('.table-container');
        const containerRect = container.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;

        if (newWidth >= 200 && newWidth <= containerRect.width - 300) {
            detailsSection.style.width = newWidth + 'px';
            const now = Date.now();
            if (now - lastUpdate > 50) {
                lastUpdate = now;
                updateTimelineHeader();
                updateStickyColumns();
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            updateTimelineHeader();
            updateStickyColumns();
        }
    });
}

function zoomToFit() {
    initResizer();
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;

    const timelineSection = document.querySelector('.timeline-section');
    if (!timelineSection) return;

    const visibleWidth = timelineSection.clientWidth;

    let low = 0, high = 100;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (sliderToWidth(mid) <= visibleWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    zoomSlider.value = low;
    handleZoomChange();
}

function zoomToSelection() {
    let minTime = null;
    let maxTime = null;

    // Prefer timeline selection if available
    if (startTime && endTime) {
        minTime = Math.min(startTime, endTime);
        maxTime = Math.max(startTime, endTime);
    } else if (selectedRows.size > 0) {
        // Fall back to row selection
        const rows = document.querySelectorAll('.request-row');
        rows.forEach(row => {
            if (selectedRows.has(row.dataset.id)) {
                const start = parseInt(row.dataset.start);
                const end = parseInt(row.dataset.end);
                if (minTime === null || start < minTime) minTime = start;
                if (maxTime === null || end > maxTime) maxTime = end;
            }
        });
    }

    if (minTime === null || maxTime === null) {
        alert('Please select a time range first by clicking two points on the timeline or selecting rows');
        return;
    }

    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;

    const selectionRange = maxTime - minTime;
    const totalRange = timeRange.max - timeRange.min;
    const selectionRatio = selectionRange / totalRange;

    const timelineSection = document.querySelector('.timeline-section');
    const visibleWidth = timelineSection ? timelineSection.clientWidth - 50 : 1000;

    const requiredWidth = Math.max(visibleWidth / selectionRatio, 10000);
    zoomSlider.value = Math.min(100, widthToSlider(requiredWidth));

    handleZoomChange();

    setTimeout(() => {
        const newRange = timeRange.max - timeRange.min;
        const newTimelineWidth = getTimelineWidth();

        const scrollX = ((minTime - timeRange.min) / newRange) * newTimelineWidth - 50;
        const ts = document.querySelector('.timeline-section');
        if (ts) ts.scrollLeft = Math.max(0, scrollX);

        // Re-apply row selection highlights after zoom
        updateRowHighlights();
    }, 100);
}

let uriTooltip = null;
function showUriTooltipFromData(event, element) {
    const uri = element.dataset.originalUri || element.parentElement.dataset.uri || element.dataset.uri;
    if (!uri) return;
    if (!uriTooltip) {
        uriTooltip = document.createElement('div');
        uriTooltip.className = 'uri-tooltip';
        document.body.appendChild(uriTooltip);
    }
    uriTooltip.textContent = uri;
    uriTooltip.style.display = 'block';
    uriTooltip.style.left = event.clientX + 10 + 'px';
    uriTooltip.style.top = event.clientY + 10 + 'px';
}

function showUriTooltip(event, uri) {
    if (!uriTooltip) {
        uriTooltip = document.createElement('div');
        uriTooltip.className = 'uri-tooltip';
        document.body.appendChild(uriTooltip);
    }
    uriTooltip.textContent = uri;
    uriTooltip.style.display = 'block';
    uriTooltip.style.left = event.clientX + 10 + 'px';
    uriTooltip.style.top = event.clientY + 10 + 'px';
}

function hideUriTooltip() {
    if (uriTooltip) uriTooltip.style.display = 'none';
}
