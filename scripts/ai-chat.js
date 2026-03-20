// ===== AI Chat =====

function openAiChatPanel() {
    var panel = document.getElementById('aiChatPanel');
    var backdrop = document.getElementById('aiChatBackdrop');
    if(panel && backdrop) {
        panel.classList.add('active');
        backdrop.classList.add('active');
        handleAiProviderChange();
    }
}

function closeAiChatPanel() {
    var panel = document.getElementById('aiChatPanel');
    var backdrop = document.getElementById('aiChatBackdrop');
    if(panel && backdrop) {
        panel.classList.remove('active');
        backdrop.classList.remove('active');
    }
}

function handleAiProviderChange() {
    var provider = document.getElementById('aiProviderSelect');
    var azureFields = document.getElementById('aiAzureFields');
    var modelGroup = document.getElementById('aiModelGroup');
    var modelInput = document.getElementById('aiModelName');
    
    if (provider && azureFields && modelGroup && modelInput) {
        var p = provider.value;
        if (p === 'azure') {
            azureFields.style.display = 'block';
            modelGroup.style.display = 'none';
        } else {
            azureFields.style.display = 'none';
            modelGroup.style.display = 'block';
            
            // Set default placeholders
            if (p === 'gemini' || p === 'google_ai') {
                modelInput.placeholder = 'gemini-2.5-flash';
                if(!modelInput.value || modelInput.value.startsWith('gpt-') || modelInput.value.startsWith('grok') || modelInput.value.startsWith('claude')) modelInput.value = 'gemini-2.5-flash';
            } else if (p === 'chatgpt') {
                modelInput.placeholder = 'gpt-4o';
                if(!modelInput.value || modelInput.value.startsWith('gemini') || modelInput.value.startsWith('grok') || modelInput.value.startsWith('claude')) modelInput.value = 'gpt-4o';
            } else if (p === 'grok') {
                modelInput.placeholder = 'grok-beta';
                if(!modelInput.value || modelInput.value.startsWith('gemini') || modelInput.value.startsWith('gpt') || modelInput.value.startsWith('claude')) modelInput.value = 'grok-beta';
            } else if (p === 'claude') {
                modelInput.placeholder = 'claude-3-5-sonnet-20241022';
                if(!modelInput.value || modelInput.value.startsWith('gemini') || modelInput.value.startsWith('gpt') || modelInput.value.startsWith('grok')) modelInput.value = 'claude-3-5-sonnet-20241022';
            }
        }
    }
}

var aiChatHistory = [];

const AI_SYSTEM_PROMPT = `You are **HAR Analyst** — a senior web performance and security engineer embedded in a HAR Viewer tool. You receive a JSON array of parsed HTTP requests as context and answer user queries with precise, actionable technical analysis.

---

## CONTEXT FORMAT

Each request object in the array may contain:
id, uri, method, statusCode, startRequestTimestamp, endResponseTimestamp, requestHeaders, responseHeaders, responseContentLength, type (IMG, JSON, JS, HTML, CSS, FONT, MEDIA, OTHER).

Derive **duration** as endResponseTimestamp - startRequestTimestamp (in ms). Treat missing fields as unavailable — never fabricate values.

---

## CORE CAPABILITIES

### 1 · Performance Diagnosis

- **Slowest requests:** Rank by duration. Flag anything > 1 s as slow, > 3 s as critical.
- **Largest payloads:** Rank by responseContentLength. Flag uncompressed assets (missing content-encoding: gzip | br | zstd in response headers).
- **Render-blocking resources:** Identify JS/CSS requests that fire early in the waterfall (low startRequestTimestamp) with large payloads or long durations — they likely block first paint.
- **Caching gaps:** Flag responses missing cache-control, etag, or last-modified headers, especially for static assets (IMG, JS, CSS, FONT).
- **Redundant requests:** Detect duplicate URIs (same method + URI fired more than once). Call out potential N+1 query patterns when you see repeated API calls to parameterized endpoints (e.g., /api/users/1, /api/users/2, …).
- **Connection overhead:** When timestamps allow, note requests to many distinct origins (potential DNS/TLS cost) and suggest domain consolidation or preconnect hints.

### 2 · Error Triaging

- **4xx errors:** Group by status code. For each, show the URI, method, and relevant request headers (e.g., missing or malformed Authorization, bad Content-Type). Suggest likely root causes (auth expiry, incorrect endpoint, CORS preflight rejection for 403/405).
- **5xx errors:** Treat as high severity. Surface the URI, timing, and any x-request-id / x-trace-id / x-correlation-id headers to assist backend log correlation. Note if the failure is intermittent (same endpoint succeeds elsewhere in the data).
- **Redirects (3xx):** Flag redirect chains (> 1 hop) and unnecessary HTTP→HTTPS redirects.

### 3 · Security & Best Practices

- **PII / credential leaks:** Scan query strings and request headers for tokens, API keys, emails, SSNs, or anything resembling password=, token=, api_key=, secret=, exposed Authorization or Cookie values in GET URIs.
- **Missing security headers** on HTML document responses: strict-transport-security, x-content-type-options, x-frame-options, content-security-policy, referrer-policy, permissions-policy.
- **CORS misconfiguration:** Flag access-control-allow-origin: * on authenticated or sensitive endpoints.
- **Mixed content:** HTTP resources loaded within what appears to be an HTTPS page context.

### 4 · Summary & Recommendations

When the user asks for a general analysis or "overview," provide a structured report:

1. **Quick Stats** — total requests, total transfer size, overall time span, breakdown by type.
2. **Top Issues** — the 3–5 most impactful findings ranked by severity (critical → warning → info).
3. **Action Items** — a numbered, prioritized checklist the user can hand to a dev team.

---

## RESPONSE RULES

| Rule | Detail |
|---|---|
| **Format** | Use Markdown. Use tables when comparing ≥ 3 items. Use fenced code blocks for headers, payloads, or example fixes. Bold key metrics and severity labels. |
| **Conciseness** | Lead with the finding, then the evidence, then the fix. No filler sentences. |
| **Accuracy** | Only reference data present in the context. If information is insufficient to answer, say so explicitly and state what additional data you would need (e.g., response bodies, full waterfall timing). |
| **Tone** | Expert engineer speaking to another engineer. Direct, professional, no hedging language like "it might be possible that…" — state findings with confidence when the data supports them, and flag uncertainty clearly when it doesn't. |
| **Scope** | You analyze HTTP traffic data only. Decline requests unrelated to web performance, networking, or security analysis of the provided data. |
| **No Fabrication** | Never invent request entries, header values, or status codes. Every claim must be traceable to a specific id or URI in the dataset. |`;

function startAiChat() {
    var apiKey = document.getElementById('aiApiKey') ? document.getElementById('aiApiKey').value : '';
    var providerUrl = document.getElementById('aiProviderSelect') ? document.getElementById('aiProviderSelect').value : '';

    if(!apiKey) {
        alert('Please enter an API Key to continue.');
        return;
    }
    if (providerUrl === 'azure') {
        var endpoint = document.getElementById('aiAzureEndpoint') ? document.getElementById('aiAzureEndpoint').value : '';
        var deployment = document.getElementById('aiAzureDeployment') ? document.getElementById('aiAzureDeployment').value : '';
        if(!endpoint || !deployment) {
            alert('Please enter both Azure Endpoint and Deployment Name.');
            return;
        }
    }

    // Switch view
    var setupView = document.getElementById('aiSetupView');
    var chatView = document.getElementById('aiChatView');
    if(setupView && chatView) {
        setupView.style.display = 'none';
        chatView.style.display = 'flex';
    }
    
    // Build Context Data
    var contextData = [];
    for (var i = 0; i < filteredRequests.length; i++) {
        var r = filteredRequests[i];
        contextData.push({
            id: r.id,
            uri: r.uri,
            method: r.method,
            statusCode: r.statusCode,
            startRequestTimestamp: r.startRequestTimestamp,
            endResponseTimestamp: r.endResponseTimestamp,
            requestHeaders: r.requestHeaders,
            responseHeaders: r.responseHeaders,
            responseContentLength: r.responseContentLength,
            type: r.type
        });
    }
    var contextStr = "Here is the JSON array of parsed HTTP requests for analysis:\\n" + JSON.stringify(contextData);

    // Initialize History
    aiChatHistory = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: contextStr }
    ];

    // Generate basic context summary UI
    var ctxMsg = "HAR Profile loaded with " + filteredRequests.length + " requests. Ready for analysis. Ask me about slowest requests, cache gaps, or error triaging!";
    appendAiMessage(ctxMsg, 'system');
}

function handleAiChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
    }
}

async function sendAiMessage() {
    var input = document.getElementById('aiChatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    appendAiMessage(text, 'user');
    
    var msgId = appendAiMessage(" Thinking...", 'assistant');
    var elContent = document.getElementById(msgId + '-content');
    
    aiChatHistory.push({ role: 'user', content: text });
    
    var provider = document.getElementById('aiProviderSelect').value;
    var apiKey = document.getElementById('aiApiKey').value.trim();
    var modelName = document.getElementById('aiModelName') && document.getElementById('aiModelName').value.trim() 
                    ? document.getElementById('aiModelName').value.trim() 
                    : (document.getElementById('aiModelName') ? document.getElementById('aiModelName').placeholder : '');
    var responseText = "";
    var isError = false;
    
    var updateUI = function(delta) {
        if (delta) {
            responseText += delta;
            if (elContent) elContent.innerHTML = renderMarkdown(responseText);
            var container = document.getElementById('aiChatMessages');
            if (container) container.scrollTop = container.scrollHeight;
        }
    };
    
    try {
        if (elContent) elContent.innerHTML = "<em>Connecting...</em>";
        if (provider === 'gemini' || provider === 'google_ai') {
            await streamGeminiAPI(apiKey, modelName, aiChatHistory, updateUI);
        } else if (provider === 'chatgpt' || provider === 'grok') {
            var apiUrl = provider === 'chatgpt' ? "https://api.openai.com/v1/chat/completions" : "https://api.x.ai/v1/chat/completions";
            await streamOpenAIChatAPI(apiUrl, apiKey, modelName, aiChatHistory, updateUI);
        } else if (provider === 'claude') {
            await streamClaudeAPI(apiKey, modelName, aiChatHistory, updateUI);
        } else if (provider === 'azure') {
            var ep = document.getElementById('aiAzureEndpoint').value.trim();
            var dep = document.getElementById('aiAzureDeployment').value.trim();
            if (!ep.endsWith('/')) ep += '/';
            var apiUrl = ep + "openai/deployments/" + dep + "/chat/completions?api-version=2024-02-15-preview";
            await streamOpenAIChatAPI(apiUrl, apiKey, null, aiChatHistory, updateUI);
        }
    } catch(e) {
        console.error("AI Chat Error:", e);
        isError = true;
        if (!responseText) {
            responseText = "Error communicating with AI: " + e.message + "\n\n(Note: Some APIs like Claude and OpenAI may block direct browser requests due to CORS unless you run this through a proxy).";
        } else {
            responseText += "\n\n**[Stream Interrupted: " + e.message + "]**";
        }
        if (elContent) elContent.innerHTML = renderMarkdown(responseText);
    }
    
    aiChatHistory.push({ role: 'assistant', content: responseText });
    
    // Add copy button once streaming is fully complete
    var elActions = document.getElementById(msgId + '-actions');
    if (elActions && !isError) {
        elActions.style.display = 'flex';
        var btn = document.createElement('button');
        btn.className = 'ai-action-btn';
        btn.innerHTML = '📋 Copy';
        // Safe handling of closure issue for async button clicks
        var finalResponse = responseText;
        btn.onclick = function() { copyAiMessage(this, finalResponse); };
        elActions.appendChild(btn);
    }
}

// Basic Markdown Parser for AI Chat Responses
function renderMarkdown(text) {
    if (!text) return "";
    
    // 1. Multi-line code blocks (```lang ... ```)
    // Extract them first to avoid escaping HTML inside them
    var codeBlocks = [];
    var textWithPlaceholders = text.replace(/```([a-z]*)\n([\s\S]*?)```/g, function(match, lang, code) {
        var escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var langLabel = lang ? ('<div style="font-size:10px; color:#888; margin-bottom:4px; text-transform:uppercase;">' + lang + '</div>') : '';
        codeBlocks.push('<pre style="background:#222; padding:10px; border-radius:6px; overflow-x:auto; margin:14px 0;"><code style="color:#e6e6e6; font-family:monospace; display:block; padding:0; background:transparent;">' + langLabel + escapedCode + '</code></pre>');
        return '\n___CODE_BLOCK_' + (codeBlocks.length - 1) + '___\n';
    });

    // Now escape the rest of the text
    var html = textWithPlaceholders.replace(/&/g, '&amp;')
                                   .replace(/</g, '&lt;')
                                   .replace(/>/g, '&gt;');

    // 2. Headings (### Heading)
    html = html.replace(/^#{1,6}\s+(.+)$/gm, function(match, title) {
        var level = match.trim().split(' ')[0].length;
        var size = 20 - (level * 2);
        var margin = level <= 2 ? "20px 0 10px 0" : "14px 0 6px 0";
        return '<h' + level + ' style="margin:' + margin + '; font-size:' + size + 'px; font-weight:600; color:#fff; line-height:1.3;">' + title + '</h' + level + '>';
    });

    // 3. Bold (**text**)
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong style="color:#fff;">$1</strong>');
    
    // 4. Italic (*text* or _text_)
    html = html.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^\_\n]+)_/g, '<em>$1</em>');

    // 5. Inline Code (`text`)
    html = html.replace(/`([^`\n]+)`/g, '<code style="background:#3a3a3a; color:#f8bbd0; padding:2px 5px; border-radius:4px; font-family:monospace; font-size:13px;">$1</code>');

    // 6. Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#4fc3f7; text-decoration:none;">$1</a>');

    // 7. List Items (bullet or numbered)
    html = html.replace(/^[ \t]*[*+-]\s+(.+)$/gm, '<li style="margin-bottom: 6px; padding-left: 4px;">$1</li>');
    html = html.replace(/^[ \t]*\d+\.\s+(.+)$/gm, '<li style="margin-bottom: 6px; padding-left: 4px;">$1</li>');

    // Wrap consecutive <li> into an <ul>
    html = html.replace(/(<li style="margin-bottom: 6px; padding-left: 4px;">[\s\S]*?<\/li>\n*)+/g, function(match) {
        return '<ul style="margin: 12px 0 12px 24px; padding: 0;">\n' + match + '</ul>\n';
    });

    // 8. Line breaks
    var paragraphs = html.split('\n');
    var result = [];
    for (var p = 0; p < paragraphs.length; p++) {
        var line = paragraphs[p].trim();
        if (line.match(/^<(ul|li|h\d)/) || line.match(/<\/(ul)>/) || line.includes('___CODE_BLOCK_')) {
            result.push(line);
        } else if (line !== '') {
            result.push(line + '<br>');
        } else {
            result.push('<br>'); // Empty lines become breaks
        }
    }
    
    var finalHtml = result.join('\n');
    // Clean up excessive breaks
    finalHtml = finalHtml.replace(/(<br>\n*){3,}/g, '<br><br>');
    
    // 9. Restore code blocks
    for (var i = 0; i < codeBlocks.length; i++) {
        finalHtml = finalHtml.replace(new RegExp('___CODE_BLOCK_' + i + '___(?:<br>)?', 'g'), codeBlocks[i]);
    }
    
    return finalHtml;
}

// --- API Backend Handlers ---

async function handleApiError(res) {
    var errText = await res.text();
    var errMsg = "API returned " + res.status;
    try {
        var errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) {
            errMsg += " - " + errJson.error.message;
        } else if (errJson.error) {
            errMsg += " - " + (typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error));
        }
    } catch(e) {
        if (errText) errMsg += " - " + errText.substring(0, 150) + (errText.length > 150 ? '...' : '');
    }
    if (res.status === 429) {
        errMsg += "\n\n(Note: Status 429 means Rate Limit Exceeded or Quota Reached. Your payload might be too large or you are sending too many requests. Free API tiers have strict limits.)";
    } else if (res.status === 413) {
        errMsg += "\n\n(Note: Status 413 means Payload Too Large. The HAR context might have too many request headers to process in a single chat.)";
    }
    return new Error(errMsg);
}

async function readSSEStream(response, onData) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buffer = "";
    while (true) {
        var { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        var lines = buffer.split("\n");
        buffer = lines.pop(); // save incomplete line
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith("data:")) {
                var dataStr = line.substring(5).trim();
                if (dataStr === "[DONE]") continue;
                if (!dataStr) continue;
                try {
                    var data = JSON.parse(dataStr);
                    onData(data);
                } catch (e) {
                    // ignore incomplete json chunk or formatting
                }
            }
        }
    }
}

async function streamGeminiAPI(apiKey, modelName, messages, onChunk) {
    var m = modelName || 'gemini-2.5-flash';
    // Removed key from URL for better console privacy
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":streamGenerateContent?alt=sse";
    
    var contents = [];
    var systemInstruction = null;
    
    for (var i = 0; i < messages.length; i++) {
        var mMsg = messages[i];
        if (mMsg.role === 'system') {
            systemInstruction = { parts: [{ text: mMsg.content }] };
        } else {
            contents.push({
                role: mMsg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: mMsg.content }]
            });
        }
    }
    
    var body = { contents: contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    
    var res = await fetch(url, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey 
        },
        body: JSON.stringify(body)
    });
    
    if (!res.ok) throw await handleApiError(res);
    
    await readSSEStream(res, function(data) {
        if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            onChunk(data.candidates[0].content.parts[0].text);
        }
    });
}

async function streamOpenAIChatAPI(apiUrl, apiKey, modelName, messages, onChunk) {
    var body = {
        messages: messages,
        temperature: 0.1,
        stream: true
    };
    if (modelName) body.model = modelName;

    var headers = { "Content-Type": "application/json" };
    if (apiKey) {
        headers["Authorization"] = "Bearer " + apiKey;
        headers["api-key"] = apiKey; // covers Azure requirement
    }

    var res = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
    });
    
    if (!res.ok) throw await handleApiError(res);
    
    await readSSEStream(res, function(data) {
        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            onChunk(data.choices[0].delta.content);
        }
    });
}

async function streamClaudeAPI(apiKey, modelName, messages, onChunk) {
    var sysPrompt = "";
    var claudeMessages = [];
    for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === 'system') sysPrompt = m.content;
        else claudeMessages.push({ role: m.role, content: m.content });
    }
    
    var res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerously-allow-browser": "true" 
        },
        body: JSON.stringify({
            model: modelName || "claude-3-5-sonnet-20241022",
            system: sysPrompt,
            messages: claudeMessages,
            max_tokens: 4096,
            stream: true
        })
    });
    
    if (!res.ok) throw await handleApiError(res);
    
    await readSSEStream(res, function(data) {
        if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
            onChunk(data.delta.text);
        }
    });
}

function copyAiMessage(btn, text) {
    navigator.clipboard.writeText(text).then(function() {
        var originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.color = '#4caf50';
        btn.style.borderColor = '#4caf50';
        setTimeout(function() {
            btn.innerHTML = originalText;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    }).catch(function(err) {
        console.error('Copy failed', err);
        btn.innerHTML = '❌ Failed';
        setTimeout(function() { btn.innerHTML = '📋 Copy'; }, 2000);
    });
}

function appendAiMessage(text, role) {
    var container = document.getElementById('aiChatMessages');
    if (!container) return null;
    
    var div = document.createElement('div');
    div.className = 'ai-message ' + role;
    div.id = 'ai-msg-' + Date.now() + Math.floor(Math.random() * 1000);
    
    if (role === 'system' || role === 'user') {
        div.innerText = text;
    } else {
        div.innerHTML = '<div class="ai-avatar">✨</div><div style="flex:1; min-width:0;"><div class="ai-content" id="' + div.id + '-content"></div><div class="ai-message-actions" id="' + div.id + '-actions" style="display:none;"></div></div>';
    }
    
    container.appendChild(div);
    
    if (role === 'assistant' && text) {
        document.getElementById(div.id + '-content').innerText = text;
    }
    // Auto scroll
    container.scrollTop = container.scrollHeight;
    return div.id;
}
