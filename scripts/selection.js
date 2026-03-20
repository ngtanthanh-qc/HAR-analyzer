function simulateRowClick(row) {
    const id = row.dataset.id;
    const timelineCol = document.querySelector(`.timeline-column[data-id="${id}"]`);

    if (!selectionState) {
        selectionState = 'start';
        startBar = row;
        row.classList.add('selected-start');
        if (timelineCol) timelineCol.classList.add('selected-start');
        highlightBarById(id, 'selected-start');
        document.getElementById('measurePanel').classList.add('active');
        document.getElementById('measureStartId').textContent = 'ID ' + id;
    } else if (selectionState === 'start') {
        selectionState = 'end';
        endBar = row;
        row.classList.add('selected-end');
        if (timelineCol) timelineCol.classList.add('selected-end');
        highlightBarById(id, 'selected-end');
        document.getElementById('measureEndId').textContent = 'ID ' + id;

        const startTs = parseInt(startBar.dataset.start);
        const endTs = parseInt(row.dataset.end);
        const diff = Math.abs(endTs - startTs);

        document.getElementById('measureTotal').textContent = formatDuration(diff);
        document.getElementById('measureTime').textContent = formatDuration(diff);
        highlightBetween(startBar, row);
        updateSelectionButtons();
    } else {
        clearMeasure();
    }
}

function highlightBarById(id, className) {
    const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
    if (bar) bar.classList.add(className);
}

function handleRowClick(event) {
    const panel = document.getElementById('detailPanel');
    if (panel.classList.contains('active') && !panel.contains(event.target)) {
        closeDetailPanel();
        event.stopPropagation();
        return;
    }
    const row = event.target.closest('.request-row');
    if (!row) return;

    const id = row.dataset.id;
    const clickedCell = event.target.closest('td');
    const isIdCell = clickedCell && (clickedCell.cellIndex === 0 || clickedCell.cellIndex === 1);

    // Ctrl+Shift+Click: add range to selection
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    // Ctrl+Click: toggle selection
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        clearMeasure();
        toggleRowSelection(id);
        return;
    }

    // Shift+Click: add to selection from last selected
    if (event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    // Regular click: select single row
    clearMeasure();
    clearAllSelections();
    selectRow(id);

    scrollToRequest(id);

    if (isIdCell) {
        openDetailPanel(id);
    }
}

// selectedRows and lastSelectedId are defined in core.js

function selectRow(id) {
    selectedRows.clear();
    selectedRows.add(id);
    lastSelectedId = id;
    updateRowHighlights();
    document.getElementById('measurePanel').classList.remove('active');
}

function toggleRowSelection(id) {
    if (selectedRows.has(id)) {
        selectedRows.delete(id);
    } else {
        selectedRows.add(id);
    }
    lastSelectedId = id;
    updateRowHighlights();
    updateMeasurePanelForSelection();
}

function addRangeSelection(id) {
    if (lastSelectedId === null) {
        selectRow(id);
        return;
    }
    const rows = document.querySelectorAll('.request-row');
    const ids = Array.from(rows).map(r => r.dataset.id);
    const startIdx = ids.indexOf(lastSelectedId);
    const endIdx = ids.indexOf(id);
    if (startIdx === -1 || endIdx === -1) return;

    const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    for (let i = from; i <= to; i++) {
        selectedRows.add(ids[i]);
    }
    lastSelectedId = id;
    updateRowHighlights();

    updateMeasurePanelForSelection();
}

function updateMeasurePanelForSelection() {
    if (selectedRows.size === 0) {
        document.getElementById('measurePanel').classList.remove('active');
        return;
    }

    const rows = Array.from(document.querySelectorAll('.request-row'));
    const selectedArray = rows.filter(r => selectedRows.has(r.dataset.id));

    if (selectedArray.length === 0) return;

    selectedArray.sort((a, b) => parseInt(a.dataset.start) - parseInt(b.dataset.start));

    const firstRow = selectedArray[0];
    const lastRow = selectedArray[selectedArray.length - 1];

    const firstStart = parseInt(firstRow.dataset.start);
    const lastEnd = parseInt(lastRow.dataset.end);
    const lastStart = parseInt(lastRow.dataset.start);

    const delta = lastStart - firstStart;
    const fullDuration = lastEnd - firstStart;

    const firstOrdinal = rows.indexOf(firstRow) + 1;
    const lastOrdinal = rows.indexOf(lastRow) + 1;

    document.getElementById('measurePanel').classList.add('active');
    document.getElementById('measureStartId').textContent = '#' + firstOrdinal;
    document.getElementById('measureEndId').textContent = '#' + lastOrdinal;
    document.getElementById('measureTotal').textContent = formatDuration(fullDuration) + ' (' + selectedRows.size + ')';
    document.getElementById('measureTime').textContent = formatDuration(delta);
}

function selectAllRows() {
    const rows = document.querySelectorAll('.request-row');
    rows.forEach(row => selectedRows.add(row.dataset.id));
    lastSelectedId = rows.length > 0 ? rows[rows.length - 1].dataset.id : null;
    updateRowHighlights();
    updateMeasurePanelForSelection();
}

function clearAllSelections(hidePanel = true) {
    selectedRows.clear();
    lastSelectedId = null;
    updateRowHighlights();
    if (hidePanel) {
        document.getElementById('measurePanel').classList.remove('active');
    }
}

function updateRowHighlights() {
    document.querySelectorAll('.request-row').forEach(row => {
        row.classList.remove('selected-start', 'selected-end', 'selected');
        const timelineCol = document.querySelector(`.timeline-column[data-id="${row.dataset.id}"]`);
        if (timelineCol) timelineCol.classList.remove('selected-start', 'selected-end', 'selected');
        const bar = document.querySelector(`.timeline-bar[data-id="${row.dataset.id}"]`);
        if (bar) bar.classList.remove('selected-start', 'selected-end', 'selected');
    });

    selectedRows.forEach(id => {
        const row = document.querySelector(`.request-row[data-id="${id}"]`);
        if (row) row.classList.add('selected');
        const timelineCol = document.querySelector(`.timeline-column[data-id="${id}"]`);
        if (timelineCol) timelineCol.classList.add('selected');
        const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
        if (bar) bar.classList.add('selected');
    });
}

function highlightRow(id, className) {
    const row = document.querySelector(`.request-row[data-id="${id}"]`);
    if (row) row.classList.add(className);
    const timelineCol = document.querySelector(`.timeline-column[data-id="${id}"]`);
    if (timelineCol) timelineCol.classList.add(className);
    const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
    if (bar) bar.classList.add(className);
}

function handleTimelineBarClick(event) {
    const panel = document.getElementById('detailPanel');
    if (panel.classList.contains('active') && !panel.contains(event.target)) {
        closeDetailPanel();
        event.stopPropagation();
        return;
    }
    const bar = event.target.closest('.timeline-bar');
    if (!bar) return;
    event.stopPropagation();

    const id = bar.dataset.id;
    const row = document.querySelector(`.request-row[data-id="${id}"]`);

    // Ctrl+Shift+Click: add range to selection
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    // Ctrl+Click: toggle selection
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        clearMeasure();
        toggleRowSelection(id);
        return;
    }

    // Shift+Click: add to selection from last selected
    if (event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    // Regular click: select single row
    clearMeasure();
    clearAllSelections();
    selectRow(id);

    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function scrollToRequest(id) {
    const bar = document.querySelector(`.timeline-bar[data-id="${id}"]`);
    if (!bar) return;

    const timelineSection = document.querySelector('.timeline-section');
    if (!timelineSection) return;

    const barLeft = bar.offsetLeft;
    timelineSection.scrollLeft = Math.max(0, barLeft - 20);
}

function highlightBetween(start, end) {
    document.querySelectorAll('.request-row').forEach(r => r.classList.remove('highlight'));
    document.querySelectorAll('.timeline-column').forEach(c => c.classList.remove('highlight'));
    document.querySelectorAll('.timeline-bar').forEach(b => b.classList.remove('highlight'));
    if (!start || !end) return;

    const startTime = parseInt(start.dataset.start);
    const endTime = parseInt(end.dataset.start);
    const minTime = Math.min(startTime, endTime);
    const maxTime = Math.max(startTime, endTime);

    document.querySelectorAll('.request-row').forEach(r => {
        const t = parseInt(r.dataset.start);
        if (t > minTime && t < maxTime) {
            r.classList.add('highlight');
            const col = document.querySelector(`.timeline-column[data-id="${r.dataset.id}"]`);
            if (col) col.classList.add('highlight');
        }
    });
}
