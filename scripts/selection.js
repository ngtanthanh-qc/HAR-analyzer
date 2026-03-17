let selectionState = null;
let startBar = null;
let endBar = null;
let selectedRows = new Set();
let lastSelectedId = null;
let startMarker = null;
let endMarker = null;
let startTime = null;
let endTime = null;

function simulateRowClick(row) {
    const id = row.dataset.id;
    const timelineCol = document.querySelector('.timeline-column[data-id="' + id + '"]');

    if (!selectionState) {
        selectionState = 'start';
        startBar = row;
        row.classList.add('selected-start');
        if (timelineCol) timelineCol.classList.add('selected-start');
        highlightBarById(id, 'selected-start');
        document.getElementById('measurePanel').classList.add('active');
        document.getElementById('measureStartId').textContent = 'ID ' + id;
        return;
    }

    if (selectionState === 'start') {
        selectionState = 'end';
        endBar = row;
        row.classList.add('selected-end');
        if (timelineCol) timelineCol.classList.add('selected-end');
        highlightBarById(id, 'selected-end');
        document.getElementById('measureEndId').textContent = 'ID ' + id;

        const startTs = parseInt(startBar.dataset.start, 10);
        const endTs = parseInt(row.dataset.end, 10);
        const diff = Math.abs(endTs - startTs);

        document.getElementById('measureTotal').textContent = formatDuration(diff);
        document.getElementById('measureTime').textContent = formatDuration(diff);
        highlightBetween(startBar, row);
        updateSelectionButtons();
        return;
    }

    clearMeasure();
}

function highlightBarById(id, className) {
    const bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
    if (bar) {
        bar.classList.add(className);
    }
}

function handleRowClick(event) {
    const panel = document.getElementById('detailPanel');
    if (panel.classList.contains('active') && !panel.contains(event.target)) {
        closeDetailPanel();
        event.stopPropagation();
        return;
    }

    const row = event.target.closest('.request-row');
    if (!row) {
        return;
    }

    const id = row.dataset.id;
    const clickedCell = event.target.closest('td');
    const isIdCell = clickedCell && (clickedCell.cellIndex === 0 || clickedCell.cellIndex === 1);

    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        clearMeasure();
        toggleRowSelection(id);
        return;
    }

    if (event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    clearMeasure();
    clearAllSelections();
    selectRow(id);
    scrollToRequest(id);

    if (isIdCell) {
        openDetailPanel(id);
    }
}

function selectRow(id) {
    selectedRows.clear();
    selectedRows.add(String(id));
    lastSelectedId = String(id);
    updateRowHighlights();
    document.getElementById('measurePanel').classList.remove('active');
}

function toggleRowSelection(id) {
    const normalizedId = String(id);
    if (selectedRows.has(normalizedId)) {
        selectedRows.delete(normalizedId);
    } else {
        selectedRows.add(normalizedId);
    }
    lastSelectedId = normalizedId;
    updateRowHighlights();
    updateMeasurePanelForSelection();
}

function addRangeSelection(id) {
    const normalizedId = String(id);
    if (lastSelectedId === null) {
        selectRow(normalizedId);
        return;
    }

    const rows = document.querySelectorAll('.request-row');
    const ids = Array.from(rows).map(function(row) {
        return row.dataset.id;
    });
    const startIdx = ids.indexOf(String(lastSelectedId));
    const endIdx = ids.indexOf(normalizedId);
    if (startIdx === -1 || endIdx === -1) {
        return;
    }

    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    for (let index = from; index <= to; index++) {
        selectedRows.add(ids[index]);
    }

    lastSelectedId = normalizedId;
    updateRowHighlights();
    updateMeasurePanelForSelection();
}

function updateMeasurePanelForSelection() {
    if (selectedRows.size === 0) {
        document.getElementById('measurePanel').classList.remove('active');
        updateSelectionButtons();
        return;
    }

    const rows = Array.from(document.querySelectorAll('.request-row'));
    const selectedArray = rows.filter(function(row) {
        return selectedRows.has(row.dataset.id);
    });

    if (selectedArray.length === 0) {
        document.getElementById('measurePanel').classList.remove('active');
        updateSelectionButtons();
        return;
    }

    selectedArray.sort(function(left, right) {
        return parseInt(left.dataset.start, 10) - parseInt(right.dataset.start, 10);
    });

    const firstRow = selectedArray[0];
    const lastRow = selectedArray[selectedArray.length - 1];
    const firstStart = parseInt(firstRow.dataset.start, 10);
    const lastEnd = parseInt(lastRow.dataset.end, 10);
    const lastStart = parseInt(lastRow.dataset.start, 10);
    const delta = lastStart - firstStart;
    const fullDuration = lastEnd - firstStart;
    const firstOrdinal = rows.indexOf(firstRow) + 1;
    const lastOrdinal = rows.indexOf(lastRow) + 1;

    document.getElementById('measurePanel').classList.add('active');
    document.getElementById('measureStartId').textContent = '#' + firstOrdinal;
    document.getElementById('measureEndId').textContent = '#' + lastOrdinal;
    document.getElementById('measureTotal').textContent = formatDuration(fullDuration) + ' (' + selectedRows.size + ')';
    document.getElementById('measureTime').textContent = formatDuration(delta);
    updateSelectionButtons();
}

function selectAllRows() {
    const rows = document.querySelectorAll('.request-row');
    rows.forEach(function(row) {
        selectedRows.add(row.dataset.id);
    });
    lastSelectedId = rows.length > 0 ? rows[rows.length - 1].dataset.id : null;
    updateRowHighlights();
    updateMeasurePanelForSelection();
}

function clearAllSelections(hidePanel) {
    selectedRows.clear();
    lastSelectedId = null;
    updateRowHighlights();
    if (hidePanel !== false) {
        document.getElementById('measurePanel').classList.remove('active');
    }
    updateSelectionButtons();
}

function updateRowHighlights() {
    document.querySelectorAll('.request-row').forEach(function(row) {
        row.classList.remove('selected-start', 'selected-end', 'selected');
        const timelineCol = document.querySelector('.timeline-column[data-id="' + row.dataset.id + '"]');
        const bar = document.querySelector('.timeline-bar[data-id="' + row.dataset.id + '"]');
        if (timelineCol) timelineCol.classList.remove('selected-start', 'selected-end', 'selected');
        if (bar) bar.classList.remove('selected-start', 'selected-end', 'selected');
    });

    selectedRows.forEach(function(id) {
        const row = document.querySelector('.request-row[data-id="' + id + '"]');
        const timelineCol = document.querySelector('.timeline-column[data-id="' + id + '"]');
        const bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
        if (row) row.classList.add('selected');
        if (timelineCol) timelineCol.classList.add('selected');
        if (bar) bar.classList.add('selected');
    });

    updateSelectionButtons();
}

function highlightRow(id, className) {
    const normalizedId = String(id);
    const row = document.querySelector('.request-row[data-id="' + normalizedId + '"]');
    const timelineCol = document.querySelector('.timeline-column[data-id="' + normalizedId + '"]');
    const bar = document.querySelector('.timeline-bar[data-id="' + normalizedId + '"]');
    if (row) row.classList.add(className);
    if (timelineCol) timelineCol.classList.add(className);
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
    if (!bar) {
        return;
    }
    event.stopPropagation();

    const id = bar.dataset.id;
    const row = document.querySelector('.request-row[data-id="' + id + '"]');

    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        clearMeasure();
        toggleRowSelection(id);
        return;
    }

    if (event.shiftKey) {
        event.preventDefault();
        clearMeasure();
        addRangeSelection(id);
        return;
    }

    clearMeasure();
    clearAllSelections();
    selectRow(id);

    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function scrollToRequest(id) {
    const bar = document.querySelector('.timeline-bar[data-id="' + id + '"]');
    const timelineSection = document.querySelector('.timeline-section');
    if (!bar || !timelineSection) {
        return;
    }
    timelineSection.scrollLeft = Math.max(0, bar.offsetLeft - 20);
}

function clearMeasure() {
    selectionState = null;
    startTime = null;
    endTime = null;
    if (startBar) startBar.classList.remove('selected-start');
    if (endBar) endBar.classList.remove('selected-end');
    startBar = null;
    endBar = null;
    document.querySelectorAll('.request-row').forEach(function(row) {
        row.classList.remove('highlight', 'selected-start', 'selected-end');
    });
    document.querySelectorAll('.timeline-column').forEach(function(column) {
        column.classList.remove('highlight', 'selected-start', 'selected-end');
    });
    document.querySelectorAll('.timeline-bar').forEach(function(bar) {
        bar.classList.remove('highlight', 'selected-start', 'selected-end');
    });
    if (startMarker) {
        startMarker.remove();
        startMarker = null;
    }
    if (endMarker) {
        endMarker.remove();
        endMarker = null;
    }
    document.getElementById('measurePanel').classList.remove('active');
    document.getElementById('measureStartId').textContent = '--';
    document.getElementById('measureEndId').textContent = '--';
    document.getElementById('measureTotal').textContent = '--';
    document.getElementById('measureTime').textContent = '--';
    updateSelectionButtons();
}
