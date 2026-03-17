function normalizeHeaderMap(headers) {
    const map = {};
    if (!headers) {
        return map;
    }

    if (Array.isArray(headers)) {
        headers.forEach(function(header) {
            if (!header || !header.name) {
                return;
            }
            map[String(header.name)] = header.value == null ? '' : String(header.value);
        });
        return map;
    }

    if (typeof headers === 'string') {
        headers.split(/\r?\n/).forEach(function(line) {
            if (!line) {
                return;
            }
            const separatorIndex = line.indexOf(':');
            if (separatorIndex === -1) {
                return;
            }
            const key = line.substring(0, separatorIndex).trim();
            const value = line.substring(separatorIndex + 1).trim();
            if (key) {
                map[key] = value;
            }
        });
        return map;
    }

    Object.keys(headers).forEach(function(key) {
        map[key] = headers[key] == null ? '' : String(headers[key]);
    });
    return map;
}

function normalizeBodyChunks(chunks) {
    if (!chunks) {
        return [];
    }
    if (Array.isArray(chunks)) {
        return chunks.map(function(chunk) {
            return chunk == null ? '' : String(chunk);
        });
    }
    return [String(chunks)];
}

function toNonNegativeNumber(value) {
    const numericValue = Number(value);
    if (!isFinite(numericValue) || numericValue < 0) {
        return null;
    }
    return numericValue;
}

function toTimestamp(value) {
    if (value == null || value === '') {
        return 0;
    }
    if (typeof value === 'number') {
        return value;
    }
    const dateValue = new Date(value).getTime();
    return isFinite(dateValue) ? dateValue : 0;
}

function getStatusClassFromCode(status) {
    if (typeof status !== 'number') {
        return 'status-0xx';
    }
    if (status < 0 || status === 0) return 'status-0xx';
    if (status < 200) return 'status-1xx';
    if (status < 300) return 'status-2xx';
    if (status < 400) return 'status-3xx';
    if (status < 500) return 'status-4xx';
    if (status < 600) return 'status-5xx';
    return 'status-6xx';
}

function getDefaultStatusMessageForModel(status) {
    const defaults = {
        100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints',
        200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information', 204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status', 208: 'Already Reported', 226: 'IM Used',
        300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
        400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable', 417: 'Expectation Failed', 418: "I'm a teapot", 421: 'Misdirected Request', 422: 'Unprocessable Entity', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
        500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported', 506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected', 510: 'Not Extended', 511: 'Network Authentication Required'
    };
    return defaults[status] || 'Unknown';
}

function getTypeFromContentTypeModel(contentType) {
    if (!contentType) return '';
    const ct = String(contentType).toLowerCase();
    if (ct.indexOf('json') !== -1) return 'JSON';
    if (ct.indexOf('image/') !== -1) return 'IMG';
    if (ct.indexOf('xml') !== -1 && ct.indexOf('image/') === -1) return 'XML';
    if (ct.indexOf('html') !== -1) return 'HTML';
    if (ct.indexOf('javascript') !== -1 || ct.indexOf('application/x-javascript') !== -1) return 'JS';
    if (ct.indexOf('text/css') !== -1) return 'CSS';
    if (ct.indexOf('font') !== -1) return 'FONT';
    if (ct.indexOf('pdf') !== -1) return 'PDF';
    if (ct.indexOf('zip') !== -1 || ct.indexOf('gzip') !== -1 || ct.indexOf('tar') !== -1 || ct.indexOf('rar') !== -1) return 'ARCH';
    if (ct.indexOf('octet-stream') !== -1 || ct.indexOf('binary') !== -1) return 'BIN';
    if (ct.indexOf('text/') !== -1) return 'TEXT';
    return ct.split(';')[0].split('/').pop().substring(0, 8).toUpperCase();
}

function formatDurationForModel(ms) {
    if (ms < 0) return '0ms';
    ms = Math.round(ms);
    if (ms < 1000) return ms + 'ms';
    const seconds = ms / 1000;
    if (seconds < 60) return seconds.toFixed(2) + 's';
    const minutes = seconds / 60;
    if (minutes < 60) {
        return Math.floor(minutes) + 'm ' + Math.floor(seconds % 60) + 's';
    }
    return Math.floor(minutes / 60) + 'h ' + Math.floor(minutes % 60) + 'm';
}

function getHeaderValue(headers, headerName) {
    if (!headers) {
        return '';
    }
    const directValue = headers[headerName];
    if (directValue != null) {
        return directValue;
    }
    const lowerName = headerName.toLowerCase();
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
        if (String(keys[i]).toLowerCase() === lowerName) {
            return headers[keys[i]];
        }
    }
    return '';
}

function parseUrlParts(uri) {
    const fallback = {
        host: '',
        path: '',
        queryString: '',
        scheme: '',
        port: ''
    };

    if (!uri) {
        return fallback;
    }

    try {
        const parsed = new URL(uri);
        let port = parsed.port || '';
        if (!port && parsed.protocol === 'https:') port = '443';
        if (!port && parsed.protocol === 'http:') port = '80';
        return {
            host: parsed.hostname || '',
            path: parsed.pathname || '/',
            queryString: parsed.search ? parsed.search.substring(1) : '',
            scheme: parsed.protocol ? parsed.protocol.replace(':', '') : '',
            port: port
        };
    } catch (error) {
        const queryIndex = String(uri).indexOf('?');
        return {
            host: '',
            path: queryIndex >= 0 ? String(uri).substring(0, queryIndex) : String(uri),
            queryString: queryIndex >= 0 ? String(uri).substring(queryIndex + 1) : '',
            scheme: '',
            port: ''
        };
    }
}

function buildRequestKey(method, uri, ignoreQuery) {
    const normalizedMethod = (method || 'GET').toUpperCase();
    if (!ignoreQuery) {
        return normalizedMethod + ' ' + (uri || '');
    }
    const parts = parseUrlParts(uri || '');
    const baseUri = parts.scheme && parts.host
        ? parts.scheme + '://' + parts.host + (parts.port ? ':' + parts.port : '') + (parts.path || '/')
        : (uri || '').split('?')[0];
    return normalizedMethod + ' ' + baseUri;
}

function getBodyTextFromRequest(req, bodyType) {
    const chunks = bodyType === 'request' ? req.requestBodyChunks : req.responseBodyChunks;
    if (chunks && chunks.length) {
        return chunks.join('');
    }
    return '';
}

function createViewerRequest(baseReq, datasetMeta) {
    const requestHeaders = normalizeHeaderMap(baseReq.requestHeaders);
    const responseHeaders = normalizeHeaderMap(baseReq.responseHeaders);
    const startTs = toTimestamp(baseReq.startRequestTimestamp || baseReq.startTs);
    const beginResponseTimestamp = toTimestamp(baseReq.beginResponseTimestamp || baseReq.beginTs || startTs);
    let endTs = toTimestamp(baseReq.endResponseTimestamp || baseReq.endTs || beginResponseTimestamp || startTs);
    if (!endTs || endTs < startTs) {
        endTs = startTs;
    }

    const duration = Math.max(0, endTs - startTs);
    const requestTime = Math.max(0, beginResponseTimestamp - startTs);
    const responseTime = Math.max(0, endTs - beginResponseTimestamp);
    const method = String(baseReq.method || 'GET').toUpperCase();
    const status = baseReq.statusCode == null ? 0 : Number(baseReq.statusCode);
    const statusMessage = baseReq.statusMessage || getDefaultStatusMessageForModel(status);
    const uri = baseReq.uri || '';
    const urlParts = parseUrlParts(uri);
    const contentType = getHeaderValue(responseHeaders, 'Content-Type') || baseReq.responseMimeType || '';
    const requestBodyChunks = normalizeBodyChunks(baseReq.requestBodyChunks);
    const responseBodyChunks = normalizeBodyChunks(baseReq.responseBodyChunks);
    const responseContentLength = baseReq.responseContentLength != null
        ? Number(baseReq.responseContentLength)
        : (function() {
            const contentLength = getHeaderValue(responseHeaders, 'Content-Length');
            const numericValue = Number(contentLength);
            return isFinite(numericValue) ? numericValue : null;
        })();

    return {
        id: baseReq.id,
        sourceId: datasetMeta.id || '',
        sourceLabel: datasetMeta.sourceLabel || datasetMeta.sourceName || '',
        sourceType: datasetMeta.sourceType || 'json',
        sourceName: datasetMeta.sourceName || '',
        loadTimestamp: datasetMeta.loadTimestamp || Date.now(),
        uri: uri,
        method: method,
        methodClass: method.toLowerCase(),
        statusCode: status,
        status: status,
        msg: statusMessage,
        statusMessage: statusMessage,
        statusClass: getStatusClassFromCode(status),
        startRequestTimestamp: startTs,
        beginResponseTimestamp: beginResponseTimestamp,
        endResponseTimestamp: endTs,
        startTs: startTs,
        endTs: endTs,
        duration: duration,
        durationHuman: formatDurationForModel(duration),
        requestTime: requestTime,
        requestTimeHuman: formatDurationForModel(requestTime),
        responseTime: responseTime,
        responseTimeHuman: formatDurationForModel(responseTime),
        endpoint: uri.split('?')[0].split('/').pop() || uri,
        threadId: baseReq.threadId || baseReq.ThreadId || '--',
        requestHeaders: requestHeaders,
        responseHeaders: responseHeaders,
        requestBodyChunks: requestBodyChunks,
        responseBodyChunks: responseBodyChunks,
        requestBodyPath: baseReq.requestBodyPath || '',
        responseBodyPath: baseReq.responseBodyPath || '',
        responseMimeType: baseReq.responseMimeType || contentType || '',
        responseEncoding: baseReq.responseEncoding || 'text',
        responseOriginalBody: baseReq.responseOriginalBody || null,
        responseContentLength: responseContentLength,
        transferSize: baseReq.transferSize != null ? Number(baseReq.transferSize) : responseContentLength,
        dnsTime: toNonNegativeNumber(baseReq.dnsTime),
        connectTime: toNonNegativeNumber(baseReq.connectTime),
        sslTime: toNonNegativeNumber(baseReq.sslTime),
        waitTime: toNonNegativeNumber(baseReq.waitTime),
        receiveTime: toNonNegativeNumber(baseReq.receiveTime),
        sendTime: toNonNegativeNumber(baseReq.sendTime),
        host: baseReq.host || urlParts.host,
        path: baseReq.path || urlParts.path,
        queryString: baseReq.queryString || urlParts.queryString,
        scheme: baseReq.scheme || urlParts.scheme,
        port: baseReq.port || urlParts.port,
        requestKey: baseReq.requestKey || buildRequestKey(method, uri, false),
        requestKeyWithoutQuery: buildRequestKey(method, uri, true),
        type: baseReq.type || getTypeFromContentTypeModel(contentType),
        requestBodyText: getBodyTextFromRequest({ requestBodyChunks: requestBodyChunks }, 'request'),
        responseBodyText: getBodyTextFromRequest({ responseBodyChunks: responseBodyChunks }, 'response')
    };
}

function normalizeHarEntry(entry, id) {
    const request = entry && entry.request ? entry.request : {};
    const response = entry && entry.response ? entry.response : {};
    const content = response && response.content ? response.content : {};
    const timings = entry && entry.timings ? entry.timings : {};
    const startedAt = toTimestamp(entry && entry.startedDateTime);
    const totalTime = toNonNegativeNumber(entry && entry.time) || 0;
    const sendTime = toNonNegativeNumber(timings.send);
    const waitTime = toNonNegativeNumber(timings.wait);
    const receiveTime = toNonNegativeNumber(timings.receive);
    const dnsTime = toNonNegativeNumber(timings.dns);
    const connectTime = toNonNegativeNumber(timings.connect);
    const sslTime = toNonNegativeNumber(timings.ssl);

    const requestHeaders = normalizeHeaderMap(request.headers);
    const responseHeaders = normalizeHeaderMap(response.headers);
    const responseMimeType = content.mimeType || '';
    const normalizedMimeType = String(responseMimeType).toLowerCase();
    const explicitEncoding = content.encoding || '';
    const isBase64 = explicitEncoding === 'base64' || (normalizedMimeType.indexOf('image/') === 0 && normalizedMimeType !== 'image/svg+xml');
    const responseText = content.text != null ? String(content.text) : '';

    const beginResponseTimestamp = startedAt + Math.round(
        (sendTime || 0) + (waitTime || 0) + Math.max(0, (dnsTime || 0)) + Math.max(0, (connectTime || 0))
    );
    const computedEnd = receiveTime != null ? beginResponseTimestamp + receiveTime : startedAt + totalTime;

    return {
        id: id,
        uri: request.url || '',
        method: request.method || 'GET',
        statusCode: response.status || 0,
        statusMessage: response.statusText || '',
        startRequestTimestamp: startedAt,
        beginResponseTimestamp: beginResponseTimestamp,
        endResponseTimestamp: computedEnd,
        threadId: 'HAR-' + (entry && entry.pageref ? entry.pageref : '1'),
        requestHeaders: requestHeaders,
        responseHeaders: responseHeaders,
        requestBodyChunks: request.postData && request.postData.text ? [String(request.postData.text)] : [],
        responseBodyChunks: responseText ? [responseText] : [],
        responseMimeType: responseMimeType,
        responseEncoding: isBase64 ? 'base64' : 'text',
        responseOriginalBody: isBase64 && responseText ? responseText : null,
        responseContentLength: content.size >= 0 ? content.size : (response.bodySize >= 0 ? response.bodySize : null),
        transferSize: response.bodySize >= 0 ? response.bodySize : (content.size >= 0 ? content.size : null),
        dnsTime: dnsTime,
        connectTime: connectTime,
        sslTime: sslTime,
        waitTime: waitTime,
        receiveTime: receiveTime,
        sendTime: sendTime
    };
}

function normalizeInputData(data, options) {
    const normalizedOptions = options || {};
    let requests = [];
    let requestsDataPath = null;
    let sourceType = normalizedOptions.sourceType || 'json';

    if (data && data.log && data.log.entries) {
        sourceType = 'har';
        const entries = data.log.entries || [];
        for (let index = 0; index < entries.length; index++) {
            requests.push(normalizeHarEntry(entries[index], index + 1));
        }
    } else if (Array.isArray(data)) {
        requests = data.slice();
    } else if (typeof data === 'object' && data !== null) {
        requests = Array.isArray(data.requests) ? data.requests.slice() : [];
        requestsDataPath = data.requests_data_path || null;
    }

    const metadata = {
        id: '',
        sourceName: normalizedOptions.sourceName || 'Untitled dataset',
        sourceType: sourceType,
        loadTimestamp: Date.now(),
        sourceLabel: normalizedOptions.sourceLabel || '',
        requestsDataPath: requestsDataPath,
        originalFileName: normalizedOptions.sourceName || ''
    };

    const viewerRequests = requests.map(function(request, index) {
        const baseRequest = Object.assign({}, request);
        if (baseRequest.id == null) {
            baseRequest.id = index + 1;
        }
        return createViewerRequest(baseRequest, metadata);
    }).sort(function(left, right) {
        return left.startTs - right.startTs;
    });

    return {
        metadata: metadata,
        requests: viewerRequests,
        requestsDataPath: requestsDataPath
    };
}

function convertHarToRequests(har) {
    return normalizeInputData(har, { sourceType: 'har', sourceName: 'HAR Import' }).requests;
}

function attachDatasetSourceInfo(dataset) {
    if (!dataset || !dataset.requests) {
        return;
    }
    dataset.requests.forEach(function(request) {
        request.sourceId = dataset.id;
        request.sourceLabel = dataset.metadata.sourceLabel || dataset.metadata.sourceName || dataset.id;
        request.sourceName = dataset.metadata.sourceName || '';
        request.sourceType = dataset.metadata.sourceType || 'json';
        request.loadTimestamp = dataset.metadata.loadTimestamp;
    });
}

function getRequestHeadersAsText(headers) {
    const map = normalizeHeaderMap(headers);
    return Object.keys(map).map(function(key) {
        return key + ': ' + map[key];
    }).join('\n');
}
