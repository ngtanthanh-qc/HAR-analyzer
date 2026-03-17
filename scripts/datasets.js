const datasetRegistry = {
    items: [],
    activeDatasetId: null,
    compareDatasetId: null,
    compareMode: false,
    nextId: 1
};

function getDatasetById(datasetId) {
    for (let index = 0; index < datasetRegistry.items.length; index++) {
        if (datasetRegistry.items[index].id === datasetId) {
            return datasetRegistry.items[index];
        }
    }
    return null;
}

function getActiveDataset() {
    return getDatasetById(datasetRegistry.activeDatasetId);
}

function getCompareDataset() {
    return getDatasetById(datasetRegistry.compareDatasetId);
}

function registerDataset(normalizedDataset) {
    const datasetId = 'dataset-' + datasetRegistry.nextId++;
    normalizedDataset.id = datasetId;
    normalizedDataset.metadata.id = datasetId;
    normalizedDataset.metadata.sourceLabel = normalizedDataset.metadata.sourceLabel || normalizedDataset.metadata.sourceName || datasetId;
    attachDatasetSourceInfo(normalizedDataset);
    datasetRegistry.items.push(normalizedDataset);
    return normalizedDataset;
}

function computeDatasetStats(requests) {
    if (!requests || requests.length === 0) {
        return {
            totalRequests: 0,
            totalRange: 0,
            avgDuration: 0,
            totalRequestTime: 0,
            totalResponseTime: 0,
            avgRequestTime: 0,
            avgResponseTime: 0,
            successCount: 0,
            failedCount: 0,
            topDelayed: null,
            maxDuration: 0
        };
    }

    const durations = requests.map(function(request) {
        return request.duration;
    });
    const maxDuration = Math.max.apply(null, durations);
    const topDelayedIndex = durations.indexOf(maxDuration);
    const topDelayed = requests[topDelayedIndex] || null;
    const minTime = requests[0].startTs;
    const maxTime = Math.max.apply(null, requests.map(function(request) {
        return request.endTs;
    }));
    const totalRequestTime = requests.reduce(function(sum, request) {
        return sum + request.requestTime;
    }, 0);
    const responseRequests = requests.filter(function(request) {
        return request.responseTime > 0;
    });
    const totalResponseTime = responseRequests.reduce(function(sum, request) {
        return sum + request.responseTime;
    }, 0);

    return {
        totalRequests: requests.length,
        totalRange: Math.max(0, maxTime - minTime),
        avgDuration: durations.reduce(function(sum, duration) {
            return sum + duration;
        }, 0) / requests.length,
        totalRequestTime: totalRequestTime,
        totalResponseTime: totalResponseTime,
        avgRequestTime: totalRequestTime / requests.length,
        avgResponseTime: responseRequests.length ? totalResponseTime / responseRequests.length : 0,
        successCount: requests.filter(function(request) {
            return request.status >= 200 && request.status < 300;
        }).length,
        failedCount: requests.filter(function(request) {
            return request.status >= 400 || request.status < 0;
        }).length,
        topDelayed: topDelayed,
        maxDuration: maxDuration
    };
}

function applyDatasetStats(stats) {
    document.getElementById('statsTotalRequests').textContent = stats.totalRequests;
    document.getElementById('statsTotalTime').textContent = formatDuration(stats.totalRange);
    document.getElementById('statsAvgDuration').textContent = formatDuration(stats.avgDuration);
    document.getElementById('statsAvgRequestTime').textContent = formatDuration(stats.avgRequestTime);
    document.getElementById('statsAvgResponseTime').textContent = formatDuration(stats.avgResponseTime);
    document.getElementById('statsTotalRequestTime').textContent = formatDuration(stats.totalRequestTime);
    document.getElementById('statsTotalResponseTime').textContent = formatDuration(stats.totalResponseTime);
    document.getElementById('statsSuccessCount').textContent = stats.successCount;
    document.getElementById('statsFailedCount').textContent = stats.failedCount;

    const topDelayedEl = document.getElementById('statsTopDelayed');
    topDelayedEl.textContent = stats.topDelayed ? 'ID#' + stats.topDelayed.id + ' (' + formatDuration(stats.maxDuration) + ')' : '--';
    topDelayedEl.dataset.requestId = stats.topDelayed ? stats.topDelayed.id : '';
}

function syncDatasetSelector() {
    const selector = document.getElementById('datasetSelect');
    if (!selector) {
        return;
    }

    selector.innerHTML = datasetRegistry.items.map(function(dataset) {
        const label = dataset.metadata.sourceLabel || dataset.metadata.sourceName || dataset.id;
        const type = dataset.metadata.sourceType || 'json';
        return '<option value="' + dataset.id + '">' + escapeHtml(label) + ' [' + escapeHtml(type.toUpperCase()) + ']</option>';
    }).join('');

    if (datasetRegistry.activeDatasetId) {
        selector.value = datasetRegistry.activeDatasetId;
    }
}

function syncCompareToolbar() {
    const toolbar = document.getElementById('compareToolbar');
    const compareView = document.getElementById('compareView');
    const timelineView = document.getElementById('timeline');
    const primaryInput = document.getElementById('comparePrimaryLabel');
    const secondaryInput = document.getElementById('compareSecondaryLabel');
    const status = document.getElementById('compareStatus');
    const activeDataset = getActiveDataset();
    const compareDataset = getCompareDataset();
    const hasComparePair = !!(activeDataset && compareDataset);

    if (toolbar) {
        toolbar.style.display = datasetRegistry.compareMode && hasComparePair ? 'flex' : 'none';
    }
    if (compareView) {
        compareView.style.display = datasetRegistry.compareMode && hasComparePair ? 'block' : 'none';
    }
    if (timelineView) {
        timelineView.style.display = datasetRegistry.compareMode && hasComparePair ? 'none' : 'flex';
    }
    if (primaryInput && activeDataset) {
        primaryInput.value = activeDataset.metadata.sourceLabel || activeDataset.metadata.sourceName || activeDataset.id;
    }
    if (secondaryInput && compareDataset) {
        secondaryInput.value = compareDataset.metadata.sourceLabel || compareDataset.metadata.sourceName || compareDataset.id;
    }
    if (status) {
        status.textContent = hasComparePair
            ? (activeDataset.requests.length + ' vs ' + compareDataset.requests.length + ' requests')
            : 'Load a second file to compare datasets';
    }
}

function refreshDatasetUi() {
    syncDatasetSelector();
    syncCompareToolbar();
}

function activateDataset(datasetId) {
    const dataset = getDatasetById(datasetId);
    if (!dataset) {
        return;
    }

    datasetRegistry.activeDatasetId = dataset.id;
    window.requestsDataPath = dataset.requestsDataPath || dataset.metadata.requestsDataPath || null;
    allRequests = dataset.requests.slice();
    filteredRequests = allRequests.slice();

    if (allRequests.length > 0) {
        timeRange = {
            min: allRequests[0].startTs,
            max: Math.max.apply(null, allRequests.map(function(request) {
                return request.endTs;
            }))
        };
    } else {
        timeRange = { min: 0, max: 0 };
    }

    applyDatasetStats(computeDatasetStats(allRequests));
    document.getElementById('statsButton').style.display = allRequests.length ? 'inline-block' : 'none';
    document.getElementById('exportFiddlerBtn').style.display = allRequests.length ? 'inline-block' : 'none';
    document.getElementById('replayExportBtn').style.display = allRequests.length ? 'inline-block' : 'none';
    document.getElementById('insightsBtn').style.display = allRequests.length ? 'inline-block' : 'none';
    hideError();
    document.getElementById('content').classList.add('active');
    document.getElementById('empty').style.display = 'none';
    setupStatsPopupHover();
    refreshDatasetUi();

    if (datasetRegistry.compareMode && getCompareDataset()) {
        clearMeasure();
        clearAllSelections();
        renderCompareView();
        return;
    }

    if (typeof applyFilter === 'function') {
        applyFilter();
    } else {
        renderTimeline();
        zoomToFit();
    }
}

function loadDataIntoDataset(data, options) {
    const normalizedOptions = options || {};
    const normalized = normalizeInputData(data, normalizedOptions);
    if (!normalized.requests || !normalized.requests.length) {
        showError('No requests found in JSON');
        return null;
    }

    const dataset = registerDataset(normalized);
    if (normalizedOptions.mode === 'compare') {
        datasetRegistry.compareDatasetId = dataset.id;
        datasetRegistry.compareMode = true;
        if (!datasetRegistry.activeDatasetId && datasetRegistry.items.length > 1) {
            datasetRegistry.activeDatasetId = datasetRegistry.items[0].id;
        }
        refreshDatasetUi();
        if (datasetRegistry.activeDatasetId) {
            activateDataset(datasetRegistry.activeDatasetId);
        }
    } else {
        activateDataset(dataset.id);
    }

    return dataset;
}

function setActiveDatasetFromSelector() {
    const selector = document.getElementById('datasetSelect');
    if (!selector || !selector.value) {
        return;
    }
    activateDataset(selector.value);
}

function updateDatasetLabel(kind, value) {
    const dataset = kind === 'compare' ? getCompareDataset() : getActiveDataset();
    if (!dataset) {
        return;
    }
    dataset.metadata.sourceLabel = value.trim() || dataset.metadata.sourceName || dataset.id;
    attachDatasetSourceInfo(dataset);
    refreshDatasetUi();
    if (datasetRegistry.compareMode && getCompareDataset()) {
        renderCompareView();
    }
}

function openCompareFilePicker() {
    document.getElementById('compareFileInput').click();
}

function exitCompareMode() {
    datasetRegistry.compareMode = false;
    refreshDatasetUi();
    if (datasetRegistry.activeDatasetId) {
        activateDataset(datasetRegistry.activeDatasetId);
    }
}
