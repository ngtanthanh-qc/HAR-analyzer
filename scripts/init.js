function downloadSampleJson() {
    fetch('https://raw.githubusercontent.com/omega0verride/HAR-Viewer/main/samples/custom/sample.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sample_http_requests.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(err => {
            alert('Failed to download sample: ' + err.message);
        });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('exportDialogBackdrop').classList.contains('active')) {
            closeFiddlerExportDialog();
            return;
        }
        clearMeasure();
        closeHeadersModal();
        closeBodyModal();
        clearAllSelections();
    }
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-' || e.key === '_') zoomOut();
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        selectAllRows();
    }
});

// Initialize button states
updateSelectionButtons();

// Initialize timezone dropdown
populateTimezoneSelect();

// Initialize sticky column picker
initStickyPicker();

// Close sticky picker popover when clicking outside
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('stickyPickerWrap');
    if (wrap && !wrap.contains(e.target)) {
        const popover = document.getElementById('stickyPickerPopover');
        const btn = document.getElementById('stickyPickerBtn');
        if (popover) popover.classList.remove('open');
        if (btn) btn.classList.remove('active');
    }
});

// Setup drag and drop
setupDragAndDrop();

function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('dropZoneFileInput');

    if (!dropZone || !fileInput) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    // Handle file selection from the hidden input
    fileInput.addEventListener('change', handleFileSelect);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropZone.classList.add('drag-over');
    }

    function unhighlight() {
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }

    function processFile(file) {
        if (!file.name.endsWith('.json') && !file.name.endsWith('.har')) {
            showError('Please select a HAR or JSON file');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);
                // Check if it's a HAR file
                if (data.log && data.log.entries) {
                    const converted = convertHarToRequests(data);
                    processData(converted);
                } else {
                    processData(data);
                }
            } catch (err) {
                showError('Failed to parse file: ' + err.message);
            }
        };
        reader.onerror = function () {
            showError('Failed to read file');
        };
        reader.readAsText(file);
    }
}

document.addEventListener('click', function (e) {
    const panel = document.getElementById('detailPanel');
    if (panel.classList.contains('active')) {
        if (!panel.contains(e.target) && !e.target.closest('.request-row') && !e.target.closest('.timeline-bar')) {
            closeDetailPanel();
        }
        e.stopPropagation();
    }
});

// Initialize body modal resizer
initBodyModalResizer();

// Check for preloaded data after all initialization is complete
checkPreloadedData();

// Self-test mode: ?test=1 (JSON) or ?test=har (HAR)
const testMode = new URLSearchParams(window.location.search).get('test');
if (testMode) {
    console.log('Running self-test...');
    let testData;
    if (testMode === 'har') {
        testData = {
            log: {
                entries: [
                    { startedDateTime: '2024-01-01T00:00:00Z', time: 200, request: { url: 'http://localhost/api', method: 'GET', headers: [] }, response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'application/json', size: 1234 } } },
                    { startedDateTime: '2024-01-01T00:00:01Z', time: 150, request: { url: 'http://localhost/api2', method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: '{"a":1}' } }, response: { status: 201, statusText: 'Created', headers: [], content: { mimeType: 'application/json', text: '{"b":2}' } } }
                ]
            }
        };
    } else {
        testData = [
            { id: 1, uri: 'http://localhost:3000/api/users', method: 'GET', statusCode: 200, statusMessage: 'OK', startRequestTimestamp: 1704067200000, beginResponseTimestamp: 1704067200150, endResponseTimestamp: 1704067200200, threadId: 'main', responseContentLength: 256 },
            { id: 2, uri: 'http://localhost:3000/api/users', method: 'POST', statusCode: 201, statusMessage: 'Created', startRequestTimestamp: 1704067200300, beginResponseTimestamp: 1704067200500, endResponseTimestamp: 1704067200800, threadId: 'worker-1', requestBodyChunks: ['{"name":"John"}'], responseBodyChunks: ['{"id":2,"name":"John"}'], responseContentLength: 28 }
        ];
    }
    document.getElementById('preloadData').textContent = JSON.stringify(testData);
    checkPreloadedData();
    console.log('Test data loaded, requests:', allRequests.length);
    if (testMode === 'har') {
        if (allRequests.length !== 2) { console.error('TEST FAILED: Expected 2 requests, got', allRequests.length); }
        else if (allRequests[0].responseContentLength !== 1234) { console.error('TEST FAILED: Expected responseContentLength 1234, got', allRequests[0].responseContentLength); }
        else { console.log('HAR TEST PASSED!'); }
    } else {
        if (allRequests.length !== 2) { console.error('TEST FAILED: Expected 2 requests, got', allRequests.length); }
        else if (allRequests[0].responseContentLength !== 256) { console.error('TEST FAILED: Expected responseContentLength 256, got', allRequests[0].responseContentLength); }
        else if (allRequests[1].responseContentLength !== 28) { console.error('TEST FAILED: Expected responseContentLength 28, got', allRequests[1].responseContentLength); }
        else { console.log('JSON TEST PASSED!'); }
    }
}
