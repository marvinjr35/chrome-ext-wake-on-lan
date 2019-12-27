// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

chrome.app.runtime.onLaunched.addListener(function() {
	chrome.storage.local.get(['theme'], (items) => {
		let theme = items['theme'];
		if (theme) {
			// Sanity check the values.
			if (theme != 'light' && theme != 'dark') {
				theme = undefined;
				chrome.storage.local.remove('theme');
			}
		}

		if (!theme) {
			theme = window.matchMedia('(prefers-color-scheme: light)') ?
				'light' : 'dark';
		}

		const frame = theme == 'light' ? '#eee' : '#111';
		chrome.app.window.create(`main.html?theme=${theme}`, {
			frame: {
				color: frame,
			},
		});
	});
});
