const requestList = document.getElementById('request-list');
const filterInput = document.getElementById('filter');
const emptyState = document.getElementById('empty-state');
const detailsPane = document.getElementById('details');
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');

let isFirstRequest = true;
let currentCodeToCopy = "";

// --- Resizer / Panel Coverage Logic ---
let isResizing = false;
resizer.addEventListener('mousedown', () => { isResizing = true; resizer.classList.add('active'); document.body.style.cursor = 'col-resize'; });
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = (e.clientX / window.innerWidth) * 100;
  if (newWidth > 15 && newWidth < 85) sidebar.style.width = `${newWidth}%`;
});
document.addEventListener('mouseup', () => { isResizing = false; resizer.classList.remove('active'); document.body.style.cursor = 'default'; });

// --- Tab Switching Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
  });
});

// --- Filter Logic ---
filterInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  document.querySelectorAll('.request-item').forEach(item => {
    const text = item.getAttribute('data-search').toLowerCase();
    item.classList.toggle('hidden', !text.includes(searchTerm));
  });
});

// --- Manual Copy Button ---
document.getElementById('copy-btn').addEventListener('click', () => { copyToClipboard(currentCodeToCopy); });

// --- Network Listener ---
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isFirstRequest) { requestList.innerHTML = ''; isFirstRequest = false; }

  const url = request.request.url;
  const method = request.request.method;
  const div = document.createElement('div');
  div.className = 'request-item';
  div.setAttribute('data-search', `${method} ${url}`);
  div.innerHTML = `<span class="method">${method}</span> ${url}`;
  
  if (filterInput.value && !`${method} ${url}`.toLowerCase().includes(filterInput.value.toLowerCase())) {
    div.classList.add('hidden');
  }

  div.addEventListener('click', () => {
    document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
    div.classList.add('selected');
    emptyState.style.display = 'none';
    detailsPane.style.display = 'flex';

    currentCodeToCopy = generateFetchCode(request.request);
    
    // Apply Syntax Highlighting to UI
    document.getElementById('code-block').innerHTML = highlightJS(currentCodeToCopy);
    copyToClipboard(currentCodeToCopy);
    populateResponseTab(request.response, request);
  });

  requestList.prepend(div);
});

// --- Populate Response Details ---
function populateResponseTab(response, fullRequestObject) {
  const statusEl = document.getElementById('res-status');
  statusEl.innerText = `${response.status} ${response.statusText}`;
  statusEl.className = 'status-badge ' + (response.status >= 500 ? 'status-500' : response.status >= 400 ? 'status-400' : 'status-200');

  const headersObj = {};
  response.headers.forEach(h => headersObj[h.name] = h.value);
  document.getElementById('res-headers').innerHTML = highlightJSON(headersObj);

  const bodyEl = document.getElementById('res-body');
  bodyEl.innerText = "Loading body...";
  
  fullRequestObject.getContent((content, encoding) => {
    if (!content) { bodyEl.innerText = "(No response body)"; return; }
    try {
      const json = JSON.parse(content);
      bodyEl.innerHTML = highlightJSON(json);
    } catch(e) {
      // Not JSON, escape HTML and show raw text
      bodyEl.innerHTML = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  });
}

// --- Fetch Code Generator ---
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
      if (typeof maybeJson === 'object' && maybeJson !== null) {
        parsedDataObject = maybeJson;
        dataType = "json";
      }
    } catch (e) {
      const mimeType = req.postData.mimeType || '';
      if (mimeType.includes('application/x-www-form-urlencoded')) {
        const searchParams = new URLSearchParams(rawText);
        parsedDataObject = Object.fromEntries(searchParams.entries());
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

// --- Custom Syntax Highlighters ---
function highlightJS(code) {
  let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Highlight Strings
  html = html.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, '<span class="hl-string">$&</span>');
  
  // Highlight Keywords
  ['const ', 'new ', 'try ', 'catch ', 'let '].forEach(kw => {
    html = html.replace(new RegExp(`\\b${kw}`, 'g'), `<span class="hl-keyword">${kw}</span>`);
  });
  
  // Highlight Functions
  ['fetch', 'then', 'catch', 'stringify', 'parse', 'log', 'error'].forEach(m => {
     html = html.replace(new RegExp(`\\b${m}\\b`, 'g'), `<span class="hl-function">${m}</span>`);
  });

  // Highlight Built-in Objects
  ['JSON', 'console', 'URLSearchParams'].forEach(b => {
     html = html.replace(new RegExp(`\\b${b}\\b`, 'g'), `<span class="hl-object">${b}</span>`);
  });

  return html;
}

function highlightJSON(obj) {
  let json = JSON.stringify(obj, null, 2);
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'hl-number';
      if (/^"/.test(match)) {
          if (/:$/.test(match)) cls = 'hl-key';
          else cls = 'hl-string';
      } else if (/true|false/.test(match)) cls = 'hl-boolean';
      else if (/null/.test(match)) cls = 'hl-keyword';
      return `<span class="${cls}">${match}</span>`;
  });
}