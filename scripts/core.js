let selectionState = null;
let startBar = null;
let endBar = null;
let allRequests = [];
let filteredRequests = [];
let timeRange = { min: 0, max: 0 };
let threadColors = {};
let startMarker = null;
let endMarker = null;
let startTime = null;
let endTime = null;
let requestsDataPath = null;
let jsonFileHandle = null;
let selectedTimezone = 'local';
// 0-based indices of columns that should be sticky (default: #, ID, Method, Status)
let stickyColumnIndices = [0, 1, 4, 6];
let selectedRows = new Set();
let lastSelectedId = null;
let regexMode = false;

function populateTimezoneSelect() {
    const select = document.getElementById('timezoneSelect');
    if (!select) return;

    // Fallback for older browsers that do not implement Intl.supportedValuesOf
    if (typeof Intl === 'undefined' || typeof Intl.supportedValuesOf !== 'function') {
        select.innerHTML = '<option value="local" selected>Local</option><option value="utc">UTC</option>';
        selectedTimezone = 'local';
        return;
    }

    let timezones = [];
    try {
        timezones = Intl.supportedValuesOf('timeZone') || [];
    } catch (e) {
        select.innerHTML = '<option value="local" selected>Local</option><option value="utc">UTC</option>';
        selectedTimezone = 'local';
        return;
    }

    let options = '<option value="local" selected>Local</option>';
    options += '<option value="utc">UTC</option>';

    const offsetMap = new Map();
    const now = new Date();

    for (const tz of timezones) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
            const parts = formatter.formatToParts(now);
            const offsetTimeZonePart = parts.find(p => p.type === 'timeZoneName');
            const offsetPart = (offsetTimeZonePart && offsetTimeZonePart.value) || '';

            const match = offsetPart.match(/GMT([+-]\d+)?/);
            let offsetHours = 0;
            if (match && match[1]) {
                offsetHours = parseInt(match[1]);
            } else {
                const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
                const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
                offsetHours = -(tzDate - utcDate) / 3600000;
            }

            if (!offsetMap.has(offsetHours)) {
                offsetMap.set(offsetHours, []);
            }
            offsetMap.get(offsetHours).push(tz);
        } catch (e) {
        }
    }

    const sortedOffsets = Array.from(offsetMap.keys()).sort((a, b) => a - b);

    for (const offset of sortedOffsets) {
        const tzs = offsetMap.get(offset);
        const label = offset === 0 ? 'UTC' : (offset > 0 ? `+${offset}:00` : `${offset}:00`);
        const sampleTz = tzs[0];
        options += `<option value="${sampleTz}">${label}</option>`;
    }

    select.innerHTML = options;
    selectedTimezone = 'local';
}

function handleTimezoneChange() {
    selectedTimezone = document.getElementById('timezoneSelect').value;
    renderTimeline();
}

// URI (index 11) is excluded — it's the main content column and shouldn't be sticky
const COLUMN_NAMES = ['#', 'ID', 'Thread', 'Timestamp', 'Method', 'Duration', 'Status', 'Type', 'Req', 'Res', 'Hdr'];

function initStickyPicker() {
    const popover = document.getElementById('stickyPickerPopover');
    if (!popover) return;
    popover.innerHTML = COLUMN_NAMES.map((name, i) => `
        <label>
            <input type="checkbox" data-col-index="${i}" ${stickyColumnIndices.includes(i) ? 'checked' : ''} onchange="handleStickyColChange(this)">
            ${name}
        </label>
    `).join('');
}

function toggleStickyPicker(e) {
    e.stopPropagation();
    const popover = document.getElementById('stickyPickerPopover');
    const btn = document.getElementById('stickyPickerBtn');
    if (!popover) return;
    const isOpen = popover.classList.toggle('open');
    btn.classList.toggle('active', isOpen);
}

function handleStickyColChange(checkbox) {
    const idx = parseInt(checkbox.dataset.colIndex, 10);
    if (checkbox.checked) {
        if (!stickyColumnIndices.includes(idx)) stickyColumnIndices.push(idx);
    } else {
        stickyColumnIndices = stickyColumnIndices.filter(i => i !== idx);
    }
    updateStickyColumns();
}

function formatTimestamp(timestamp, format = 'full') {
    const dt = new Date(timestamp);

    let localTime;
    if (selectedTimezone === 'utc') {
        localTime = new Date(dt.getTime() + (dt.getTimezoneOffset() * 60000));
    } else if (selectedTimezone === 'local' || selectedTimezone === Intl.DateTimeFormat().resolvedOptions().timeZone) {
        localTime = dt;
    } else {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: selectedTimezone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            const parts = formatter.formatToParts(dt);
            const getPart = (type) => {
                const part = parts.find(p => p.type === type);
                return (part && part.value) || '00';
            };
            localTime = new Date(
                parseInt(getPart('year')),
                parseInt(getPart('month')) - 1,
                parseInt(getPart('day')),
                parseInt(getPart('hour')),
                parseInt(getPart('minute')),
                parseInt(getPart('second')),
                dt.getMilliseconds()
            );
        } catch (e) {
            localTime = dt;
        }
    }

    const day = String(localTime.getDate()).padStart(2, '0');
    const month = String(localTime.getMonth() + 1).padStart(2, '0');
    const hours = String(localTime.getHours()).padStart(2, '0');
    const mins = String(localTime.getMinutes()).padStart(2, '0');
    const secs = String(localTime.getSeconds()).padStart(2, '0');
    const ms = String(localTime.getMilliseconds()).padStart(3, '0');

    if (format === 'short') {
        return `${hours}:${mins}:${secs}`;
    } else if (format === 'table') {
        return `${day}/${month} ${hours}:${mins}:${secs}.${ms}`;
    } else if (format === 'header') {
        return `${day}T${hours}:${mins}:${secs}.${ms}`;
    } else if (format === 'detail') {
        return `${localTime.getFullYear()}-${month}-${day} ${hours}:${mins}:${secs}.${ms}`;
    }
    return `${day}T${hours}:${mins}:${secs}.${ms}`;
}

const THREAD_COLORS = [
    '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
    '#00acc1', '#ffb300', '#6d4c41', '#546e7a', '#d81b60',
    '#5e35b1', '#039be5', '#7cb342', '#c0ca33', '#f4511e'
];

function getThreadColor(threadId) {
    if (!threadColors[threadId]) {
        const colorIndex = Object.keys(threadColors).length % THREAD_COLORS.length;
        threadColors[threadId] = THREAD_COLORS[colorIndex];
    }
    return threadColors[threadId];
}

function getTypeFromContentType(contentType) {
    if (!contentType) return '';
    const ct = contentType.toLowerCase();
    if (ct.includes('json')) return 'JSON';
    if (ct.includes('image/')) return 'IMG';
    if (ct.includes('xml') && !ct.includes('image/')) return 'XML';
    if (ct.includes('html')) return 'HTML';
    if (ct.includes('javascript') || ct.includes('application/x-javascript')) return 'JS';
    if (ct.includes('text/css')) return 'CSS';
    if (ct.includes('font')) return 'FONT';
    if (ct.includes('pdf')) return 'PDF';
    if (ct.includes('zip') || ct.includes('gzip') || ct.includes('tar') || ct.includes('rar')) return 'ARCH';
    if (ct.includes('octet-stream') || ct.includes('binary')) return 'BIN';
    if (ct.includes('text/')) return 'TEXT';
    return ct.split(';')[0].split('/').pop().substring(0, 8);
}

function getDefaultStatusMessage(status) {
    const defaults = {
        100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints',
        200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information', 204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status', 208: 'Already Reported', 226: 'IM Used',
        300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
        400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable', 417: 'Expectation Failed', 418: "I'm a teapot", 421: 'Misdirected Request', 422: 'Unprocessable Entity', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
        500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported', 506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected', 510: 'Not Extended', 511: 'Network Authentication Required'
    };
    return defaults[status] || 'Unknown';
}

function formatBytes(bytes) {
    if (bytes == null || bytes < 0) return '- B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDuration(ms) {
    if (ms < 0) return '0ms';
    ms = Math.round(ms);
    if (ms < 1000) return ms + 'ms';
    const seconds = ms / 1000;
    if (seconds < 60) return seconds.toFixed(2) + 's';
    const minutes = seconds / 60;
    if (minutes < 60) {
        const secs = Math.floor(seconds % 60);
        const mins = Math.floor(minutes);
        return mins + 'm ' + secs + 's';
    }
    const hours = minutes / 60;
    const hrs = Math.floor(hours);
    const mins = Math.floor(minutes % 60);
    return hrs + 'h ' + mins + 'm';
}

function parseDuration(str) {
    if (!str || str.trim() === '') return null;
    str = str.trim().toLowerCase();

    // Check for range format: 1h-2h, 30m-1h, etc.
    if (str.includes('-')) {
        const parts = str.split('-').map(s => s.trim());
        if (parts.length === 2) {
            const minVal = parseSingleDuration(parts[0]);
            const maxVal = parseSingleDuration(parts[1]);
            if (minVal !== null && maxVal !== null) {
                return { min: minVal, max: maxVal, isRange: true };
            }
        }
        return null;
    }

    // Single value
    const val = parseSingleDuration(str);
    if (val !== null) {
        return { min: val, max: null, isRange: false };
    }

    return null;
}

function parseSingleDuration(str) {
    if (!str || str.trim() === '') return null;
    str = str.trim().toLowerCase();

    // If it's a plain number, treat as milliseconds
    if (/^\d+$/.test(str)) {
        return parseInt(str, 10);
    }

    // Parse human-readable format: 1h 30m 20s
    let totalMs = 0;
    let hasMatch = false;

    // Match hours, minutes, seconds
    const hoursMatch = str.match(/(\d+)\s*h/);
    const minsMatch = str.match(/(\d+)\s*m(?!s)/);
    const secsMatch = str.match(/(\d+)\s*s/);

    if (hoursMatch) {
        totalMs += parseInt(hoursMatch[1], 10) * 3600000;
        hasMatch = true;
    }
    if (minsMatch) {
        totalMs += parseInt(minsMatch[1], 10) * 60000;
        hasMatch = true;
    }
    if (secsMatch) {
        totalMs += parseInt(secsMatch[1], 10) * 1000;
        hasMatch = true;
    }

    // Also support plain number without unit (treat as ms)
    if (/^\d+$/.test(str)) {
        return parseInt(str, 10);
    }

    if (!hasMatch) {
        return null; // Invalid format
    }

    return totalMs;
}

function clearMeasure() {
    selectionState = null;
    startTime = null;
    endTime = null;
    if (startBar) startBar.classList.remove('selected-start');
    if (endBar) endBar.classList.remove('selected-end');
    startBar = null;
    endBar = null;
    document.querySelectorAll('.request-row').forEach(r => r.classList.remove('highlight', 'selected-start', 'selected-end'));
    document.querySelectorAll('.timeline-column').forEach(c => c.classList.remove('highlight', 'selected-start', 'selected-end'));
    document.querySelectorAll('.timeline-bar').forEach(b => b.classList.remove('highlight', 'selected-start', 'selected-end'));
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

function showError(msg) {
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.style.display = 'block';
    document.getElementById('content').classList.remove('active');
    const emptyEl = document.getElementById('empty');
    emptyEl.style.display = 'flex';
    emptyEl.classList.remove('hidden');
}

function showFilterError(msg) {
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.style.display = 'block';
}

function hideError() {
    document.getElementById('errorBox').style.display = 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

