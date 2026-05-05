const requestList = document.getElementById('request-list');
const filterInput = document.getElementById('filter');
const emptyState = document.getElementById('empty-state');
const detailsPane = document.getElementById('details');
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');

let isFirstRequest = true;
let currentCodeToCopy = "";

// --- Resizer ---
let isResizing = false;
resizer.addEventListener('mousedown', () => { isResizing = true; resizer.classList.add('active'); document.body.style.cursor = 'col-resize'; });
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = (e.clientX / window.innerWidth) * 100;
  if (newWidth > 15 && newWidth < 85) sidebar.style.width = `${newWidth}%`;
});
document.addEventListener('mouseup', () => { isResizing = false; resizer.classList.remove('active'); document.body.style.cursor = 'default'; });

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
  });
});

// --- Smart Filter Engine ---
function parseAndFilter(query, item) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const method = item.getAttribute('data-method') || '';
  const status = item.getAttribute('data-status') || '';
  const url = item.getAttribute('data-url') || '';
  const size = parseInt(item.getAttribute('data-size') || '0', 10);
  const resText = item.getAttribute('data-res') || '';
  const fullText = `${method} ${url}`.toLowerCase();

  return tokens.every(token => {
    const match = token.match(/^(method|status|url|res|size)(!=|>=|<=|>|<|=)(.+)$/i);
    if (!match) return fullText.includes(token.toLowerCase()); // plain text fallback

    const key = match[1].toLowerCase();
    const op = match[2];
    const val = match[3].toLowerCase();

    if (key === 'method') {
      const methods = val.split(',');
      if (op === '!=') return !methods.some(m => method.toLowerCase() === m);
      return methods.some(m => method.toLowerCase() === m);
    }
    
    if (key === 'status') {
      const checkStatus = (s) => val.endsWith('xx') ? s.startsWith(val[0]) : s === val;
      if (op === '!=') return !checkStatus(status);
      return checkStatus(status);
    }

    if (key === 'url') {
      if (op === '!=') return !url.toLowerCase().includes(val);
      return url.toLowerCase().includes(val);
    }

    if (key === 'res') {
      if (!resText) return false; 
      if (op === '!=') return !resText.includes(val);
      return resText.includes(val);
    }

    if (key === 'size') {
      const numVal = parseInt(val, 10);
      if (isNaN(numVal)) return true;
      if (op === '>') return size > numVal;
      if (op === '<') return size < numVal;
      if (op === '>=') return size >= numVal;
      if (op === '<=') return size <= numVal;
      if (op === '!=') return size !== numVal;
      return size === numVal;
    }

    return true;
  });
}

filterInput.addEventListener('input', (e) => {
  document.querySelectorAll('.request-item').forEach(item => {
    item.classList.toggle('hidden', !parseAndFilter(e.target.value, item));
  });
});

document.getElementById('copy-btn').addEventListener('click', () => copyToClipboard(currentCodeToCopy));

// --- Network Listener ---
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isFirstRequest) { requestList.innerHTML = ''; isFirstRequest = false; }

  const url = request.request.url;
  const method = request.request.method;
  const status = request.response ? request.response.status.toString() : '0';
  const size = request.response && request.response.content ? request.response.content.size : 0;
  
  const div = document.createElement('div');
  div.className = 'request-item';
  div.setAttribute('data-method', method);
  div.setAttribute('data-status', status);
  div.setAttribute('data-url', url);
  div.setAttribute('data-size', size);
  div.setAttribute('data-res', ''); 
  
  const sClass = status.startsWith('5') ? 's5xx' : status.startsWith('4') ? 's4xx' : status.startsWith('3') ? 's3xx' : 's2xx';
  div.innerHTML = `<span class="status-lbl ${sClass}">${status}</span> <span class="method">${method}</span> ${url}`;

  // Apply filter immediately
  div.classList.toggle('hidden', !parseAndFilter(filterInput.value, div));

  // Async grab response body for `res=` filtering
  request.getContent((content) => {
    if (content) {
      div.setAttribute('data-res', content.toLowerCase());
      if (filterInput.value) div.classList.toggle('hidden', !parseAndFilter(filterInput.value, div));
    }
  });

  div.addEventListener('click', () => {
    document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
    div.classList.add('selected');
    emptyState.style.display = 'none';
    detailsPane.style.display = 'flex';

    currentCodeToCopy = generateFetchCode(request.request);
    document.getElementById('code-block').innerHTML = highlightJS(currentCodeToCopy);
    copyToClipboard(currentCodeToCopy);
    populateResponseTab(request.response, request);
  });

  requestList.prepend(div);
});

// --- Populate UI Details ---
function populateResponseTab(response, fullRequestObject) {
  const statusEl = document.getElementById('res-status');
  statusEl.innerText = `${response.status} ${response.statusText}`;
  statusEl.className = 'status-badge ' + (response.status >= 500 ? 'status-500' : response.status >= 400 ? 'status-400' : 'status-200');

  const headersObj = {};
  response.headers.forEach(h => headersObj[h.name] = h.value);
  document.getElementById('res-headers').innerHTML = highlightJSON(headersObj);

  const bodyEl = document.getElementById('res-body');
  bodyEl.innerText = "Loading body...";
  
  fullRequestObject.getContent((content) => {
    if (!content) { bodyEl.innerText = "(No response body)"; return; }
    try {
      bodyEl.innerHTML = highlightJSON(JSON.parse(content));
    } catch(e) {
      bodyEl.innerHTML = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
}

// --- Fetch Code Gen ---
function generateFetchCode(req) {
  const url = req.url;
  const method = req.method;
  const headersObj = {};
  req.headers.forEach(h => { if (!h.name.startsWith(':')) headersObj[h.name] = h.value; });

  const isBodyAllowed = !['GET', 'HEAD'].includes(method);
  let parsedDataObject = null;
  let bodyAssignment = "null";
  let dataType = "none"; 

  if (isBodyAllowed && req.postData && req.postData.text) {
    const rawText = req.postData.text;
    dataType = "string"; 
    try {
      const maybeJson = JSON.parse(rawText);
      if (typeof maybeJson === 'object' && maybeJson !== null) { parsedDataObject = maybeJson; dataType = "json"; }
    } catch (e) {
      if ((req.postData.mimeType || '').includes('application/x-www-form-urlencoded')) {
        parsedDataObject = Object.fromEntries(new URLSearchParams(rawText).entries());
        dataType = "form";
      }
    }
    if (dataType === "json") bodyAssignment = "JSON.stringify(data)";
    else if (dataType === "form") bodyAssignment = "new URLSearchParams(data)";
    else bodyAssignment = `\`${rawText}\``;
  }

  let script = `const url = "${url}";\nconst method = "${method}";\nconst headers = ${JSON.stringify(headersObj, null, 2)};\n`;
  if (parsedDataObject) script += `\nconst data = ${JSON.stringify(parsedDataObject, null, 2)};\n`;
  script += `\nconst body = ${bodyAssignment};\n\n`;
  script += `fetch(url, {\n  method,\n  headers,\n  ${isBodyAllowed ? 'body,' : ''}\n})\n.then(res => res.text())\n.then(final => {\n  try {\n    const json = JSON.parse(final);\n    console.log("Parsed JSON:", json);\n  } catch(e) {\n    console.log("Raw Response:", final);\n  }\n})\n.catch(err => console.error("Fetch Error:", err));`;
  return script;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  });
}

function highlightJS(code) {
  let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, '<span class="hl-string">$&</span>');
  ['const ', 'new ', 'try ', 'catch ', 'let '].forEach(kw => { html = html.replace(new RegExp(`\\b${kw}`, 'g'), `<span class="hl-keyword">${kw}</span>`); });
  ['fetch', 'then', 'catch', 'stringify', 'parse', 'log', 'error'].forEach(m => { html = html.replace(new RegExp(`\\b${m}\\b`, 'g'), `<span class="hl-function">${m}</span>`); });
  ['JSON', 'console', 'URLSearchParams'].forEach(b => { html = html.replace(new RegExp(`\\b${b}\\b`, 'g'), `<span class="hl-object">${b}</span>`); });
  return html;
}

function highlightJSON(obj) {
  let json = JSON.stringify(obj, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'hl-number';
      if (/^"/.test(match)) { cls = /:$/.test(match) ? 'hl-key' : 'hl-string'; }
      else if (/true|false/.test(match)) cls = 'hl-boolean';
      else if (/null/.test(match)) cls = 'hl-keyword';
      return `<span class="${cls}">${match}</span>`;
  });
}