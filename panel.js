const requestList = document.getElementById('request-list');
let isFirstRequest = true;

// Listen to all network requests
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isFirstRequest) {
    requestList.innerHTML = ''; // Clear "waiting" text
    isFirstRequest = false;
  }

  // Create UI element for the request
  const div = document.createElement('div');
  div.className = 'request-item';
  div.innerHTML = `<span class="method">${request.request.method}</span> ${request.request.url.substring(0, 100)}...`;
  
  // When clicked, format and copy
  div.addEventListener('click', () => {
    const code = generateFetchCode(request.request);
    copyToClipboard(code);
  });

  requestList.prepend(div); // Add newest to the top
});

function generateFetchCode(req) {
  const url = req.url;
  const method = req.method;
  
  // 1. Format Headers
  const headersObj = {};
  req.headers.forEach(h => {
    // Ignore Chrome's pseudo-headers (they start with ':')
    if (!h.name.startsWith(':')) {
      headersObj[h.name] = h.value;
    }
  });

  // 2. Format Body (Dynamically detect JSON, Form-Data, or String)
  let bodyStr = 'null';
  if (req.postData && req.postData.text) {
    const mimeType = req.postData.mimeType || '';
    const rawText = req.postData.text;

    if (mimeType.includes('application/json')) {
      try {
        // Parse and stringify to get a clean JS object representation
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

  // 3. Construct the final string exactly as requested
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

function copyToClipboard(text) {
  // Use the Clipboard API
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  });
}