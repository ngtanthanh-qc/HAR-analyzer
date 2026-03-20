// regexMode is defined in core.js

function toggleRegexMode() {
    regexMode = !regexMode;
    const btn = document.getElementById('regexToggle');
    if (regexMode) {
        btn.classList.add('active');
        document.getElementById('filterText').placeholder = 'Regex pattern...';
    } else {
        btn.classList.remove('active');
        document.getElementById('filterText').placeholder = 'Search...';
    }
    applyFilter();
}

function clearFilters() {
    document.getElementById('filterText').value = '';
    document.getElementById('filterThread').value = '';
    document.getElementById('filterMethod').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterMinDuration').value = '';
    document.getElementById('filterMaxDuration').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterBaseUri').value = '';
    hideError();
    applyFilter();
    updateClearButtonVisibility();
}

function updateClearButtonVisibility() {
    const hasFilters =
        document.getElementById('filterText').value ||
        document.getElementById('filterThread').value ||
        document.getElementById('filterMethod').value ||
        document.getElementById('filterStatus').value ||
        document.getElementById('filterMinDuration').value ||
        document.getElementById('filterMaxDuration').value ||
        document.getElementById('filterType').value ||
        document.getElementById('filterBaseUri').value;

    const clearBtn = document.getElementById('clearFiltersBtn');
    const separators = document.querySelectorAll('.filter-row .vertical-separator');

    if (clearBtn) {
        clearBtn.style.display = hasFilters ? 'inline-block' : 'none';
    }

    // Show/hide last separator before clear button
    if (separators.length > 0) {
        separators[separators.length - 1].style.display = hasFilters ? 'block' : 'none';
    }
}

function applyFilter() {
    hideError();

    const text = document.getElementById('filterText').value;
    const threadInput = document.getElementById('filterThread').value.trim();
    const methodInput = document.getElementById('filterMethod').value.trim().toUpperCase();
    const statusInput = document.getElementById('filterStatus').value.trim();
    const minDurationInput = document.getElementById('filterMinDuration').value;
    const maxDurationInput = document.getElementById('filterMaxDuration').value;
    const typeInput = document.getElementById('filterType').value.trim().toUpperCase();

    const minDuration = minDurationInput ? parseSingleDuration(minDurationInput) : null;
    const maxDuration = maxDurationInput ? parseSingleDuration(maxDurationInput) : null;

    if (minDurationInput && minDuration === null) {
        showFilterError('Invalid min duration format. Use formats like: 1h, 30m, 1m 30s');
        updateClearButtonVisibility();
        return;
    }
    if (maxDurationInput && maxDuration === null) {
        showFilterError('Invalid max duration format. Use formats like: 1h, 30m, 1m 30s');
        updateClearButtonVisibility();
        return;
    }
    if (minDuration !== null && maxDuration !== null && minDuration > maxDuration) {
        showFilterError('Min duration cannot be greater than max duration');
        updateClearButtonVisibility();
        return;
    }

    // Get the first visible request before filtering
    const detailsSection = document.querySelector('.details-section');
    const timelineSection = document.querySelector('.timeline-section');
    let firstVisibleId = null;
    let oldScrollTop = 0;

    if (detailsSection) {
        oldScrollTop = detailsSection.scrollTop;
        const rows = document.querySelectorAll('.request-row');
        for (const row of rows) {
            if (row.offsetTop >= oldScrollTop) {
                firstVisibleId = parseInt(row.dataset.id);
                break;
            }
        }
    }

    // Parse status codes from input
    const statusFilters = parseStatusFilter(statusInput);

    // Parse methods from input (comma-separated)
    const methodFilters = methodInput ? methodInput.split(',').map(m => m.trim()).filter(m => m) : [];

    // Parse thread IDs from input (comma-separated)
    const threadFilters = threadInput ? threadInput.split(',').map(t => t.trim()).filter(t => t) : [];

    // Parse type from input (comma-separated)
    const typeFilters = typeInput ? typeInput.split(',').map(t => t.trim()).filter(t => t) : [];

    // Compile regex if in regex mode
    let textRegex = null;
    if (regexMode && text) {
        try {
            textRegex = new RegExp(text, 'i');
        } catch (e) {
            // Invalid regex - fall back to normal text search
            textRegex = null;
        }
    }

    filteredRequests = allRequests.filter(req => {
        // Text/URI filter (regex or normal)
        if (text) {
            if (regexMode && textRegex) {
                if (!textRegex.test(req.uri) && !textRegex.test(req.endpoint)) {
                    return false;
                }
            } else {
                const textLower = text.toLowerCase();
                if (!req.endpoint.toLowerCase().includes(textLower) && !req.uri.toLowerCase().includes(textLower)) {
                    return false;
                }
            }
        }

        // Thread filter
        if (threadFilters.length > 0) {
            const reqThread = req.threadId.toString();
            const matches = threadFilters.some(t => reqThread === t || reqThread.endsWith(t));
            if (!matches) {
                return false;
            }
        }

        if (methodFilters.length > 0 && !methodFilters.includes(req.method.toUpperCase())) {
            return false;
        }
        if (statusFilters.length > 0 && !matchesStatusFilter(req.status, statusFilters)) {
            return false;
        }
        if (minDuration !== null && req.duration < minDuration) {
            return false;
        }
        if (maxDuration !== null && req.duration > maxDuration) {
            return false;
        }
        if (typeFilters.length > 0) {
            const reqType = (req.type || '').toUpperCase();
            const matches = typeFilters.some(t => reqType === t || reqType.includes(t));
            if (!matches) {
                return false;
            }
        }
        return true;
    });

    // Find the first matching request to scroll to
    let scrollToId = null;
    if (firstVisibleId !== null) {
        const found = filteredRequests.find(r => r.id === firstVisibleId);
        if (found) {
            scrollToId = firstVisibleId;
        }
    }

    renderTimeline(false, scrollToId, oldScrollTop);
    clearMeasure();
    updateClearButtonVisibility();
}

function parseStatusFilter(input) {
    if (!input) return [];

    const filters = [];
    const parts = input.split(',').map(s => s.trim()).filter(s => s);

    for (const part of parts) {
        // Check if it's a range (e.g., "200-299" but not "-1")
        const rangeMatch = part.match(/^(-?\d+)-(-?\d+)$/);
        if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            if (!isNaN(min) && !isNaN(max)) {
                filters.push({ type: 'range', min, max });
            }
        } else {
            // Single code: 200, -1, 0
            const code = parseInt(part);
            if (!isNaN(code)) {
                filters.push({ type: 'single', code });
            }
        }
    }

    return filters;
}

function matchesStatusFilter(status, filters) {
    if (typeof status !== 'number') return false;

    for (const filter of filters) {
        if (filter.type === 'single' && status === filter.code) {
            return true;
        }
        if (filter.type === 'range' && status >= filter.min && status <= filter.max) {
            return true;
        }
    }
    return false;
}
