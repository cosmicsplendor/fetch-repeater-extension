const requestList = document.getElementById('request-list');
const filterInput = document.getElementById('filter');
let isFirstRequest = true;

// 1. Listen to typing in the filter box
filterInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.request-item');
  
  items.forEach(item => {
    // We will store the searchable text in a data attribute
    const text = item.getAttribute('data-search').toLowerCase();
    if (text.includes(searchTerm)) {
      item.classList.remove('hidden');
    } else {
      item.classList.add('hidden');
    }
  });
});

// 2. Listen to network requests
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isFirstRequest) {
    requestList.innerHTML = ''; // Clear "waiting" text
    isFirstRequest = false;
  }

  const url = request.request.url;
  const method = request.request.method;

  // Create UI element for the request
  const div = document.createElement('div');
  div.className = 'request-item';
  
  // Store the raw text in an attribute to make filtering fast and easy
  div.setAttribute('data-search', `${method} ${url}`);
  
  // Display the full URL (no truncation)
  div.innerHTML = `<span class="method">${method}</span> ${url}`;
  
  // If the user is currently typing a filter, apply it immediately to incoming requests
  const currentFilter = filterInput.value.toLowerCase();
  if (currentFilter && !`${method} ${url}`.toLowerCase().includes(currentFilter)) {
    div.classList.add('hidden');
  }

  // When clicked, format and copy
  div.addEventListener('click', () => {
    const code = generateFetchCode(request.request);
    copyToClipboard(code);
  });

  requestList.prepend(div); // Add newest to the top
});

// 3. Generate the fetch code (Unchanged)
function generateFetchCode(req) {
  const url = req.url;
  const method = req.method;
  
  const headersObj = {};
  req.headers.forEach(h => {
    if (!h.name.startsWith(':')) {
      headersObj[h.name] = h.value;
    }
  });

  let bodyStr = 'null';
  if (req.postData && req.postData.text) {
    const mimeType = req.postData.mimeType || '';
    const rawText = req.postData.text;

    if (mimeType.includes('application/json')) {
      try {
        const jsonObj = JSON.parse(rawText);
        bodyStr = `JSON.stringify(\n${JSON.stringify(jsonObj, null, 2)}\n)`;
      } catch (e) {
        bodyStr = `\`${rawText}\``;
      }
    } else if (mimeType.includes('application/x-www-form-urlencoded')) {
      bodyStr = `new URLSearchParams(\`${rawText}\`)`;
    } else {
      bodyStr = `\`${rawText}\``;
    }
  }

  const isBodyAllowed = !['GET', 'HEAD'].includes(method);
  
  return `const url = "${url}";
const method = "${method}";
const headers = ${JSON.stringify(headersObj, null, 2)};
const body = ${isBodyAllowed ? bodyStr : 'null'};

fetch(url, {
  method,
  headers,
  ${isBodyAllowed ? 'body,' : ''}
})
.then(res => res.text())
.then(final => {
  try {
    const json = JSON.parse(final);
    console.log("Parsed JSON:", json);
  } catch(e) {
    console.log("Raw Response:", final);
  }
})
.catch(err => console.error("Fetch Error:", err));`;
}

// 4. Copy to clipboard logic (Unchanged)
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  });
}