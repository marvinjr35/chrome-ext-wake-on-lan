// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

chrome.app.runtime.onLaunched.addListener(function() {
	chrome.app.window.create('main.html')
});
