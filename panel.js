const requestList = document.getElementById('request-list');
const filterInput = document.getElementById('filter');
let isFirstRequest = true;

// 1. Listen to typing in the filter box
filterInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.request-item');
  
  items.forEach(item => {
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
    const code = generateFetchCode(request.request);
    copyToClipboard(code);
  });

  requestList.prepend(div);
});

// 3. Generate the intelligently parsed fetch code
function generateFetchCode(req) {
  const url = req.url;
  const method = req.method;
  
  // Format Headers
  const headersObj = {};
  req.headers.forEach(h => {
    if (!h.name.startsWith(':')) {
      headersObj[h.name] = h.value;
    }
  });

  // Intelligent Body Parsing
  const isBodyAllowed = !['GET', 'HEAD'].includes(method);
  let parsedDataObject = null;
  let bodyAssignment = "null";
  let dataType = "none"; 

  if (isBodyAllowed && req.postData && req.postData.text) {
    const rawText = req.postData.text;
    dataType = "string"; // fallback

    // Attempt 1: Is it JSON?
    try {
      const maybeJson = JSON.parse(rawText);
      // Make sure it's actually an object/array, not just a primitive like `123`
      if (typeof maybeJson === 'object' && maybeJson !== null) {
        parsedDataObject = maybeJson;
        dataType = "json";
      }
    } catch (e) {
      // Attempt 2: Is it Form-Data?
      const mimeType = req.postData.mimeType || '';
      if (mimeType.includes('application/x-www-form-urlencoded')) {
        const searchParams = new URLSearchParams(rawText);
        // Convert URLSearchParams to a standard JS object
        parsedDataObject = Object.fromEntries(searchParams.entries());
        dataType = "form";
      }
    }

    // Determine how the body should be assigned based on what we found
    if (dataType === "json") {
      bodyAssignment = "JSON.stringify(data)";
    } else if (dataType === "form") {
      // new URLSearchParams() natively accepts a JS object in Node/modern browsers!
      bodyAssignment = "new URLSearchParams(data)";
    } else {
      bodyAssignment = `\`${rawText}\``;
    }
  }

  // Build the script string cleanly piece by piece
  let script = `const url = "${url}";\n`;
  script += `const method = "${method}";\n`;
  script += `const headers = ${JSON.stringify(headersObj, null, 2)};\n`;

  // Inject the intermediate `data` object if we successfully parsed one
  if (parsedDataObject) {
    script += `\nconst data = ${JSON.stringify(parsedDataObject, null, 2)};\n`;
  }

  script += `\nconst body = ${bodyAssignment};\n\n`;

  script += `fetch(url, {
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

  return script;
}

// 4. Copy to clipboard logic
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  });
}