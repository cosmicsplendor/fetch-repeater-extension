const requestList = document.getElementById('request-list');
const filterInput = document.getElementById('filter');
const emptyState = document.getElementById('empty-state');
const detailsPane = document.getElementById('details');

let isFirstRequest = true;
let currentCodeToCopy = "";

// --- Tab Switching Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked tab
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
document.getElementById('copy-btn').addEventListener('click', () => {
  copyToClipboard(currentCodeToCopy);
});

// --- Network Listener ---
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isFirstRequest) {
    requestList.innerHTML = ''; 
    isFirstRequest = false;
  }

  const url = request.request.url;
  const method = request.request.method;

  const div = document.createElement('div');
  div.className = 'request-item';
  div.setAttribute('data-search', `${method} ${url}`);
  div.innerHTML = `<span class="method">${method}</span> ${url}`;
  
  const currentFilter = filterInput.value.toLowerCase();
  if (currentFilter && !`${method} ${url}`.toLowerCase().includes(currentFilter)) {
    div.classList.add('hidden');
  }

  div.addEventListener('click', () => {
    // 1. UI Selection highlight
    document.querySelectorAll('.request-item').forEach(el => el.classList.remove('selected'));
    div.classList.add('selected');

    // 2. Show Details Pane
    emptyState.style.display = 'none';
    detailsPane.style.display = 'flex';

    // 3. Generate Request Code & auto-copy
    currentCodeToCopy = generateFetchCode(request.request);
    document.getElementById('code-block').innerText = currentCodeToCopy;
    copyToClipboard(currentCodeToCopy);

    // 4. Populate Response Tab
    populateResponseTab(request.response, request);
  });

  requestList.prepend(div);
});

// --- Populate Response Details ---
function populateResponseTab(response, fullRequestObject) {
  // Status Badge
  const statusEl = document.getElementById('res-status');
  statusEl.innerText = `${response.status} ${response.statusText}`;
  statusEl.className = 'status-badge ' + 
    (response.status >= 500 ? 'status-500' : 
     response.status >= 400 ? 'status-400' : 'status-200');

  // Headers
  const headersObj = {};
  response.headers.forEach(h => headersObj[h.name] = h.value);
  document.getElementById('res-headers').innerText = JSON.stringify(headersObj, null, 2);

  // Body - We must fetch this asynchronously
  const bodyEl = document.getElementById('res-body');
  bodyEl.innerText = "Loading body...";
  
  fullRequestObject.getContent((content, encoding) => {
    if (!content) {
      bodyEl.innerText = "(No response body)";
      return;
    }
    
    // Try to beautifully format JSON if possible
    try {
      const json = JSON.parse(content);
      bodyEl.innerText = JSON.stringify(json, null, 2);
    } catch(e) {
      bodyEl.innerText = content; // Fallback to raw text
    }
  });
}

// --- Intelligent Parse Fetch Code (Unchanged) ---
function generateFetchCode(req) {
  const url = req.url;
  const method = req.method;
  const headersObj = {};
  
  req.headers.forEach(h => {
    if (!h.name.startsWith(':')) headersObj[h.name] = h.value;
  });

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

// --- Copy to clipboard ---
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  });
}