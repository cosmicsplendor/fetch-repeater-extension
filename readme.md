# Fetch Repeater Chrome Extension

A lightweight, native DevTools extension that acts as a localized alternative to Burp Repeater. It listens to network traffic and instantly generates beautiful, editable `fetch` scripts that you can immediately paste into Node.js or your browser console.

## Features
* **Auto-generated Node-ready Code:** Converts requests into clean JavaScript code.
* **Intelligent Parsing:** Automatically detects and extracts `JSON` or `x-www-form-urlencoded` payloads into an isolated, readable `data` object.
* **Split-pane UI:** A scrollable, filterable list of requests on the left, and a details pane on the right (Adjustable width).
* **Syntax Highlighting:** VS Code-style colorization built-in natively.
* **Response Viewer:** Inspect the status, formatted headers, and formatted JSON response bodies of your requests.
* **Auto-Copy:** Clicking any request immediately writes the executable code to your clipboard.

## Installation Instructions

Because this is a developer tool, it is designed to be loaded directly via Chrome's "Developer Mode".

1. **Clone or Download** this repository to your local machine. 
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. In the top right corner, toggle **Developer mode** to ON.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder containing these extension files.
6. The extension is now installed!

## How to Use

1. Open Chrome DevTools (`F12` or `Cmd+Option+I` on Mac).
2. Look at the top tabs in DevTools (Elements, Console, Network, etc.) and find the new tab named **Repeater**. *(Note: If your DevTools window is narrow, it might be hidden behind the `>>` icon).*
3. Keep the DevTools pane open and navigate or use the website normally.
4. Requests will populate in the left sidebar. Use the search bar to filter by URL or method (e.g., `POST api`).
5. Click any request. The code will automatically copy to your clipboard, and you can preview the request/response details on the right.
6. Paste the code into your IDE or Console to execute/modify the request!