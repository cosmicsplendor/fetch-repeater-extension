chrome.devtools.panels.create(
  "Repeater",
  null, // You can put a path to an icon here later
  "panel.html",
  function(panel) {
    console.log("Panel created!");
  }
);