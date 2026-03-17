let cursorLine = null;
let cursorTime = null;
let uriTooltip = null;
let resizeTimeout = null;
let resizeHandlerSetup = false;
let timelineWheelHandlerSetup = false;
let resizerDocumentHandlersSetup = false;
let isResizingTimeline = false;
let timelineResizerLastUpdate = 0;

function getDisplayUri(uri) {
    const baseUriInput = document.getElementById('filterBaseUri');
    const baseUri = baseUriInput && baseUriInput.value ? baseUriInput.value.trim() : '';
    if (!baseUri || !uri) return uri;
    if (uri.startsWith(baseUri)) {
        return uri.substring(baseUri.length);
    }
    return uri;
}

function sliderToWidth(sliderValue) {
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
    return sliderToWidth(parseInt(zoomSlider.value, 10));
}

function handleZoomChange() {
    renderTimeline(true);
}

function zoomIn() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;
    const current = parseInt(zoomSlider.value, 10);
    zoomSlider.value = Math.min(100, current + 5);
    handleZoomChange();
}

function zoomOut() {
    const zoomSlider = document.getElementById('zoomSlider');
    if (!zoomSlider) return;
    const current = parseInt(zoomSlider.value, 10);
    zoomSlider.value = Math.max(0, current - 5);
    handleZoomChange();
}

function renderTimeline(preserveScroll, scrollToId, savedScrollTop) {
    const shouldPreserveScroll = !!preserveScroll;
    const targetId = scrollToId || null;
    const previousScrollTop = savedScrollTop || 0;
    const zoomSlider = document.getElementById('zoomSlider');
    const container = document.getElementById('timeline');
    const timelineSection = document.querySelector('.timeline-section');
    const detailsSection = document.querySelector('.details-section');
    let firstVisibleTimestamp = null;
    let oldScrollTop = previousScrollTop;

    if (shouldPreserveScroll && timelineSection && !targetId) {
        const scrollLeft = timelineSection.scrollLeft;
        const bars = timelineSection.querySelectorAll('.timeline-bar');
        for (const bar of bars) {
            const barLeft = bar.offsetLeft;
            const barWidth = bar.offsetWidth;
            if (barLeft >= scrollLeft || barLeft + barWidth > scrollLeft) {
                firstVisibleTimestamp = parseInt(bar.dataset.start, 10);
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

    const displayValue = timelineWidth >= 1000000
        ? (timelineWidth / 1000000).toFixed(1) + 'M px'
        : timelineWidth >= 1000
            ? (timelineWidth / 1000).toFixed(0) + 'k px'
            : timelineWidth + 'px';
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

    filteredRequests.forEach(function(req, index) {
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

    if (startTime !== null || endTime !== null) {
        const newTimelineScroll = document.querySelector('.timeline-scroll');
        const newWidth = getTimelineWidth();
        const activeRange = timeRange.max - timeRange.min || 1;

        if (startTime !== null) {
            const startPx = ((startTime - timeRange.min) / activeRange) * newWidth;
            startMarker = document.createElement('div');
            startMarker.className = 'measure-marker start';
            const startLabel = document.createElement('div');
            startLabel.className = 'measure-marker-label start';
            startLabel.textContent = formatTimestamp(startTime, 'header');
            startMarker.appendChild(startLabel);
            startMarker.style.left = startPx + 'px';
            startMarker.style.height = '100%';
            newTimelineScroll.appendChild(startMarker);
        }

        if (endTime !== null) {
            const endPx = ((endTime - timeRange.min) / activeRange) * newWidth;
            endMarker = document.createElement('div');
            endMarker.className = 'measure-marker end';
            const endLabel = document.createElement('div');
            endLabel.className = 'measure-marker-label end';
            endLabel.textContent = formatTimestamp(endTime, 'header');
            endMarker.appendChild(endLabel);
            endMarker.style.left = endPx + 'px';
            endMarker.style.height = '100%';
            newTimelineScroll.appendChild(endMarker);
        }

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

    if (targetId) {
        const row = document.querySelector('.request-row[data-id="' + targetId + '"]');
        if (row && newDetailsSection) {
            newDetailsSection.scrollTop = row.offsetTop - 10;
            newTimelineSection.scrollTop = newDetailsSection.scrollTop;
        }
    } else if (shouldPreserveScroll && firstVisibleTimestamp !== null) {
        const newWidth = getTimelineWidth();
        const activeRange = timeRange.max - timeRange.min || 1;
        const newScrollLeft = ((firstVisibleTimestamp - timeRange.min) / activeRange) * newWidth;

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

function syncScrollHandler() {
    const detailsSection = document.querySelector('.details-section');
    const timelineSection = document.querySelector('.timeline-section');

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
        detailsSection.onscroll = function() {
            timelineSection.scrollTop = detailsSection.scrollTop;
        };
        timelineSection.onscroll = function() {
            detailsSection.scrollTop = timelineSection.scrollTop;
        };
    }

    if (!timelineWheelHandlerSetup) {
        timelineWheelHandlerSetup = true;
        document.addEventListener('wheel', function(e) {
            if (!e.shiftKey) return;

            const activeDetailsSection = document.querySelector('.details-section');
            const activeTimelineSection = document.querySelector('.timeline-section');
            const target = e.target;
            const isInDetails = activeDetailsSection && activeDetailsSection.contains(target);
            const isInTimeline = activeTimelineSection && activeTimelineSection.contains(target);

            e.preventDefault();
            if (isInDetails && activeDetailsSection) {
                activeDetailsSection.scrollLeft += e.deltaY * 0.2;
            } else if (activeTimelineSection) {
                activeTimelineSection.scrollLeft += e.deltaY;
            }
        }, { passive: false, capture: true });
    }

    if (timelineSection && cursorLine && cursorTime) {
        timelineSection.addEventListener('mousemove', function(e) {
            const rect = timelineSection.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const adjustedX = x + timelineSection.scrollLeft;
            const timelineWidth = getTimelineWidth();
            const effectiveWidth = Math.max(timelineWidth, timelineSection.clientWidth);
            const range = timeRange.max - timeRange.min || 1;

            if (adjustedX < 0 || adjustedX > effectiveWidth) return;

            const timestamp = timeRange.min + (adjustedX / effectiveWidth) * range;
            cursorLine.style.display = 'block';
            cursorLine.style.left = e.clientX + 'px';
            cursorLine.style.top = rect.top + 'px';
            cursorLine.style.height = rect.height + 'px';

            cursorTime.style.display = 'block';
            cursorTime.style.left = e.clientX + 'px';
            cursorTime.style.top = rect.top + 5 + 'px';
            cursorTime.textContent = formatTimestamp(timestamp, 'header');
        });

        timelineSection.addEventListener('mouseleave', function() {
            cursorLine.style.display = 'none';
            cursorTime.style.display = 'none';
        });

        timelineSection.addEventListener('click', function(e) {
            if (e.target.classList.contains('timeline-bar')) return;

            const rect = timelineSection.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const adjustedX = x + timelineSection.scrollLeft;
            const timelineWidth = getTimelineWidth();
            const effectiveWidth = Math.max(timelineWidth, timelineSection.clientWidth);
            const range = timeRange.max - timeRange.min || 1;

            if (adjustedX < 0 || adjustedX > effectiveWidth) return;

            const timestamp = timeRange.min + (adjustedX / effectiveWidth) * range;
            handleTimelineClick(timestamp, adjustedX);
        });
    }

    document.querySelectorAll('.request-row').forEach(function(row) {
        row.addEventListener('mouseenter', function() {
            const id = row.dataset.id;
            row.classList.add('hover');
            const col = document.querySelector('.timeline-column[data-id="' + id + '"]');
            if (col) col.classList.add('hover');
            const bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
            if (bar) bar.classList.add('hover');
        });
        row.addEventListener('mouseleave', function() {
            const id = row.dataset.id;
            row.classList.remove('hover');
            const col = document.querySelector('.timeline-column[data-id="' + id + '"]');
            if (col) col.classList.remove('hover');
            const bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
            if (bar) bar.classList.remove('hover');
        });
    });

    document.querySelectorAll('.timeline-column').forEach(function(col) {
        col.addEventListener('mouseenter', function() {
            const id = col.dataset.id;
            col.classList.add('hover');
            const row = document.querySelector('.request-row[data-id="' + id + '"]');
            if (row) row.classList.add('hover');
            const bar = col.querySelector('.timeline-bar');
            if (bar) bar.classList.add('hover');
        });
        col.addEventListener('mouseleave', function() {
            const id = col.dataset.id;
            col.classList.remove('hover');
            const row = document.querySelector('.request-row[data-id="' + id + '"]');
            if (row) row.classList.remove('hover');
            const bar = col.querySelector('.timeline-bar');
            if (bar) bar.classList.remove('hover');
        });
    });
}

function handleTimelineClick(timestamp, xPx) {
    const timelineScroll = document.querySelector('.timeline-scroll');

    if (selectedRows.size !== 1) {
        selectedRows.clear();
        lastSelectedId = null;
        updateRowHighlights();
    }

    if (startTime && endTime) {
        if (startMarker) startMarker.style.display = 'none';
        if (endMarker) endMarker.style.display = 'none';
        startTime = null;
        endTime = null;
        selectionState = null;
        document.getElementById('measurePanel').classList.remove('active');
        return;
    }

    if (!selectionState) {
        if (startMarker) startMarker.style.display = 'none';
        if (endMarker) endMarker.style.display = 'none';

        selectionState = 'start';
        startTime = timestamp;

        if (!startMarker) {
            startMarker = document.createElement('div');
            startMarker.className = 'measure-marker start';
            timelineScroll.appendChild(startMarker);
        }

        const startLabel = document.createElement('div');
        startLabel.className = 'measure-marker-label start';
        startLabel.textContent = formatTime(timestamp);
        startMarker.innerHTML = '';
        startMarker.appendChild(startLabel);
        startMarker.style.display = 'block';
        startMarker.style.left = xPx + 'px';
        startMarker.style.height = '100%';

        document.getElementById('measurePanel').classList.add('active');
        document.getElementById('measureStartId').textContent = formatTime(timestamp);
        document.getElementById('measureEndId').textContent = '...';
        document.getElementById('measureTotal').textContent = '...';
        document.getElementById('measureTime').textContent = 'Select end...';
        return;
    }

    selectionState = 'end';
    endTime = timestamp;

    if (!endMarker) {
        endMarker = document.createElement('div');
        endMarker.className = 'measure-marker end';
        timelineScroll.appendChild(endMarker);
    }

    const endLabel = document.createElement('div');
    endLabel.className = 'measure-marker-label end';
    endLabel.textContent = formatTime(timestamp);
    endMarker.innerHTML = '';
    endMarker.appendChild(endLabel);
    endMarker.style.display = 'block';
    endMarker.style.left = xPx + 'px';
    endMarker.style.height = '100%';

    const minTs = Math.min(startTime, timestamp);
    const maxTs = Math.max(startTime, timestamp);
    const rows = document.querySelectorAll('.request-row');
    let firstOrdinal = null;
    let firstStart = null;
    let lastEnd = null;
    let count = 0;

    rows.forEach(function(row, idx) {
        const rowStart = parseInt(row.dataset.start, 10);
        const rowEnd = parseInt(row.dataset.end, 10);
        if (rowEnd >= minTs && rowStart <= maxTs) {
            count++;
            if (firstOrdinal === null) {
                firstOrdinal = idx + 1;
                firstStart = rowStart;
            }
            lastEnd = rowEnd;
        }
    });

    const delta = Math.abs(timestamp - startTime);
    const fullDuration = lastEnd && firstStart ? lastEnd - firstStart : delta;
    document.getElementById('measureEndId').textContent = formatTime(timestamp);
    document.getElementById('measureTotal').textContent = firstOrdinal !== null ? formatDuration(fullDuration) + ' (' + count + ')' : '--';
    document.getElementById('measureTime').textContent = formatDuration(delta);
    selectionState = null;
    updateSelectionButtons();
}

function formatTime(timestamp) {
    return formatTimestamp(timestamp, 'header');
}

function updateSelectionButtons() {
    const selBtn = document.getElementById('selBtn');
    if (!selBtn) return;
    const hasTimeSelection = startTime && endTime;
    const hasRowSelection = selectedRows.size > 0;
    selBtn.disabled = !hasTimeSelection && !hasRowSelection;
}

function updateTimelineHeader() {
    const timelineSection = document.querySelector('.timeline-section');
    const timelineHeader = document.querySelector('.timeline-header');
    const timelineScroll = document.querySelector('.timeline-scroll');
    if (!timelineSection || !timelineHeader || !timelineScroll) return;

    const timelineWidth = getTimelineWidth();
    const effectiveWidth = Math.max(timelineWidth, timelineSection.clientWidth);
    const range = timeRange.max - timeRange.min || 1;
    timelineHeader.style.width = effectiveWidth + 'px';
    timelineScroll.style.width = effectiveWidth + 'px';
    timelineHeader.innerHTML = renderTimeHeader(range, timelineWidth);
}

function updateStickyColumns() {
    const table = document.querySelector('.timeline-table');
    if (!table) return;
    const headerCells = Array.from(table.querySelectorAll('thead tr th'));
    if (!headerCells.length) return;

    const stickyIndices = stickyColumnIndices.slice().sort(function(a, b) {
        return a - b;
    });

    headerCells.forEach(function(th, i) {
        const nthChild = i + 1;
        table.querySelectorAll('th:nth-child(' + nthChild + '), td:nth-child(' + nthChild + ')').forEach(function(cell) {
            cell.style.position = '';
            cell.style.left = '';
            cell.style.zIndex = '';
            cell.classList.remove('sticky-col');
        });
    });

    let stickyAccumulated = 0;
    stickyIndices.forEach(function(i) {
        const th = headerCells[i];
        if (!th) return;
        const nthChild = i + 1;
        const leftPx = stickyAccumulated + 'px';
        table.querySelectorAll('th:nth-child(' + nthChild + '), td:nth-child(' + nthChild + ')').forEach(function(cell) {
            cell.style.position = 'sticky';
            cell.style.left = leftPx;
            cell.style.zIndex = cell.tagName === 'TH' ? '15' : '5';
            if (cell.tagName === 'TD') {
                cell.classList.add('sticky-col');
            }
        });
        stickyAccumulated += th.offsetWidth;
    });
}

function setupResizeHandler() {
    if (resizeHandlerSetup) return;
    resizeHandlerSetup = true;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            updateTimelineHeader();
            updateStickyColumns();
        }, 100);
    });
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    if (!resizer) return;

    resizer.addEventListener('mousedown', function(e) {
        isResizingTimeline = true;
        timelineResizerLastUpdate = 0;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    if (!resizerDocumentHandlersSetup) {
        resizerDocumentHandlersSetup = true;

        document.addEventListener('mousemove', function(e) {
            if (!isResizingTimeline) return;

            const detailsSection = document.querySelector('.details-section');
            const container = document.querySelector('.table-container');
            if (!detailsSection || !container) return;

            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            if (newWidth < 200 || newWidth > containerRect.width - 300) return;

            detailsSection.style.width = newWidth + 'px';
            const now = Date.now();
            if (now - timelineResizerLastUpdate > 50) {
                timelineResizerLastUpdate = now;
                updateTimelineHeader();
                updateStickyColumns();
            }
        });

        document.addEventListener('mouseup', function() {
            if (!isResizingTimeline) return;

            isResizingTimeline = false;
            const activeResizer = document.getElementById('resizer');
            if (activeResizer) {
                activeResizer.classList.remove('dragging');
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            updateTimelineHeader();
            updateStickyColumns();
        });
    }
}

function zoomToFit() {
    initResizer();
    const zoomSlider = document.getElementById('zoomSlider');
    const timelineSection = document.querySelector('.timeline-section');
    if (!zoomSlider || !timelineSection) return;

    const visibleWidth = timelineSection.clientWidth;
    let low = 0;
    let high = 100;

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

    if (startTime && endTime) {
        minTime = Math.min(startTime, endTime);
        maxTime = Math.max(startTime, endTime);
    } else if (selectedRows.size > 0) {
        document.querySelectorAll('.request-row').forEach(function(row) {
            if (!selectedRows.has(row.dataset.id)) return;
            const start = parseInt(row.dataset.start, 10);
            const end = parseInt(row.dataset.end, 10);
            if (minTime === null || start < minTime) minTime = start;
            if (maxTime === null || end > maxTime) maxTime = end;
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

    setTimeout(function() {
        const newRange = timeRange.max - timeRange.min;
        const newTimelineWidth = getTimelineWidth();
        const scrollX = ((minTime - timeRange.min) / newRange) * newTimelineWidth - 50;
        const activeTimelineSection = document.querySelector('.timeline-section');
        if (activeTimelineSection) {
            activeTimelineSection.scrollLeft = Math.max(0, scrollX);
        }
        updateRowHighlights();
    }, 100);
}

function showUriTooltipFromData(event, element) {
    const uri = element.dataset.originalUri || (element.parentElement && element.parentElement.dataset.uri) || element.dataset.uri;
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
    if (uriTooltip) {
        uriTooltip.style.display = 'none';
    }
}