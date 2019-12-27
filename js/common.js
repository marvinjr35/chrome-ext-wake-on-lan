// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

function $(s) { return document.querySelectorAll(s); }
function $$(s) { return document.querySelector(s); }
function get_css_var(key) { return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`); }
