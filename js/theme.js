// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

/*
 * This code is all very simple/dumb.  If we want to ever support more
 * complicated theme logic, then it should be thrown away entirely.
 */

var curr_theme;

function _set_theme(txt, fg, bg, a) {
	var b = $$('body');
	b.style.color = fg;
	b.style.backgroundColor = bg;

	// This gets a bit tricky as we want to update the style sheet
	// to quickly apply to all <a> tags.
	var s, sheet, sheets, r, rule, rules;
	sheets = document.styleSheets;
	for (s = 0; s < sheets.length; ++s) {
		sheet = sheets[s];
		rules = sheet.cssRules;
		for (r = 0; r < rules.length; ++r) {
			rule = rules[r];
			if (rule.selectorText == 'a') {
				rule.style.color = a;
				break;
			}
		}
	}

	// We can't set UTF8 text, or set HTML entities directly.  Ugh.
	var span = document.createElement('span');
	span.innerHTML = txt;
	$$('input[name=theme]').value = span.innerText;
}

function set_theme(name) {
	var themes = {
		'light': ['&#9728;', 'black', 'white', 'black'],
		'dark': ['&#9788;', 'white', 'black', 'grey']
	};
	curr_theme = name;
	_set_theme.apply(this, themes[name]);
	chrome.storage.local.set({'theme': curr_theme});
}

function toggle_theme() {
	if (curr_theme == 'light')
		set_theme('dark');
	else
		set_theme('light');
}
