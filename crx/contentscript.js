function sendMessage(url) {
  chrome.extension.sendRequest({}, function(response) {
    console.log(response);
  });
}

sendMessage();
