// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

function status(msg) {
	$$('[name=status]').innerText = msg;
}

function popup_msg(ele, msg) {
	var popup = $$('[name=popup_msg]');
	var pos = ele.getBoundingClientRect();
	popup.innerText = msg;
	// Might want to add some generalized "center in element" logic.
	popup.style.top = 5 + pos.top + 'px';
	popup.style.left = pos.left + 'px';
	popup.style.display = '';
	setTimeout(() => { popup.style.display = 'none'; }, 3000);
}

// Create a packet following the spec:
// https://en.wikipedia.org/wiki/Wake-on-LAN#Magic_packet
function magicpacket(mac, pass) {
	var data = new ArrayBuffer(6 + 16 * 6 + 6 + 6);
	var bytes = new Uint8Array(data);
	var i, j, base = 0;

	// First 6 bytes should be all 0xFF.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = 0xff;
	base += 6;

	// Then the MAC address is repeated 16 times.
	for (i = 0; i < 6; ++i)
		for (j = 0; j < 16 * 6; j += 6)
			bytes[base + j + i] = mac[i];
	base += 16 * 6;

	// Then 6 bytes before the pass should be 0xFF.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = 0xff;
	base += 6;

	// Finally the 6 bytes of the password.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = pass[i];

	return data;
}

function split_data(v) {
	var data = Array(6);
	var i, idata;

	window['sync_' + v]();

	for (i = 0; i < 6; ++i) {
		idata = $$('input[name=' + v + i + ']');
		if (!/^[0-9a-fA-F]?[0-9a-fA-F]$/.test(idata.value.replace(' ', ''))) {
			status(v + ' byte ' + i + ' is invalid; must be 2 hex characters');
			idata.focus();
			idata.setSelectionRange(0, idata.value.length);
			return false;
		}
		data[i] = parseInt(idata.value, 16);
	}

	return data;
}

function send() {
	status('initializing');

	var form = $$('form[name=settings]');
	var shost = '0.0.0.0';
	var dhost = form.host.value;
	var port = parseInt(form.port.value);

	// Get the MAC address & password to convert to packet data.
	var mac = split_data('mac');
	var pass = split_data('pass');
	var data = magicpacket(mac, pass);
	console.log('packet', new Uint8Array(data));

	var checkresult = function(s, step, result) {
		if (result < 0) {
			status('error in ' + step + ': ' + net_error_list[result]);
			chrome.sockets.udp.close(s);
			return false;
		}
		return true;
	};

	// Create the socket ...
	chrome.sockets.udp.create({}, function(createInfo) {
		var s = createInfo.socketId;

		console.log('[create] socketInfo', createInfo);
		status('binding ' + shost);

		// Bind it locally ...
		chrome.sockets.udp.bind(s, shost, 0, function(result) {
			console.log('[bind] result', result);

			if (!checkresult(s, 'bind', result))
				return false;

			status('enabling broadcast');

			// Turn on broadcast support ...
			chrome.sockets.udp.setBroadcast(s, true, function(result) {
				console.log('[setBroadcast] result', result);

				if (!checkresult(s, 'broadcast', result))
					return false;

				status('sending to ' + dhost + ':' + port);

				// Send the backet ...
				chrome.sockets.udp.send(s, data, dhost, port, function(sendInfo) {
					console.log('[send] sendInfo', sendInfo);

					if (!checkresult(s, 'send', sendInfo.resultCode))
						return false;

					status('closing');

					// Shut it down ...
					chrome.sockets.udp.close(s, function() {
						status('sent to ' + dhost + ':' + port);
						store_settings();
					});
				});
			});
		});
	});

	// Keep the form from submitting.
	return false;
}

function sync_it(v) {
	var smany = $$('span[name=' + v + '-many]');
	var sone = $$('span[name=' + v + '-one]');

	// Sync the two sets of fields.
	var i;
	if (smany.hidden) {
		var idata = $$('input[name=' + v + ']');
		var data = idata.value.split(':');

		if (data.length != 6) {
			data = idata.value.replace(/[ :]/g, '');
			if (data.length != 6 * 2) {
				status('invalid ' + v + '; please fix');
				return false;
			}
			data = data.match(/../g);
		} else {
			for (i = 0; i < 6; ++i)
				if (data[i].length > 2) {
					status('invalid ' + v + ' please fix');
					return false;
				}
		}

		for (i = 0; i < 6; ++i)
			$$('input[name=' + v + i + ']').value = data[i];
	} else {
		var data = '';

		for (i = 0; i < 6; ++i) {
			data += $$('input[name=' + v + i + ']').value;
			if (i < 5)
				data += ':';
		}

		$$('input[name=' + v + ']').value = data;
	}
}
function sync_mac()  { return sync_it('mac');  }
function sync_pass() { return sync_it('pass'); }


function paste_mac() {
	sync_mac();

	var smany = $$('span[name=mac-many]');
	var sone = $$('span[name=mac-one]');
	smany.hidden = !smany.hidden;
	sone.hidden = !sone.hidden;

	return false;
}

function paste_pass() {
	sync_pass();

	var smany = $$('span[name=pass-many]');
	var sone = $$('span[name=pass-one]');
	smany.hidden = !smany.hidden;
	sone.hidden = !sone.hidden;

	return false;
}

/*
 * Storage logic.
 */

var computers = [];

var settings_keys = [
	'computers',
	'last_selected',
	'theme',
];
var old_settings_keys = [
	'host',
	'mac',
	'pass',
	'port',
];

var default_name = 'Default';
var default_host = '192.168.0.255';
var default_port = '40000';
var default_mac  = '20:00:00:00:00:00';
var default_pass = '00:00:00:00:00:00';

/*
 * Set form data based on selected computer settings.
 * Uses defaults if not available.
 */
function load_computer(idx) {
	var computer = computers[idx] || {};
	chrome.storage.local.set({'last_selected': idx});

	var form = $$('form[name=settings]');

	form.computer.value = computer['name'] || default_name;
	form.host.value = computer['host'] || default_host;
	form.port.value = computer['port'] || default_port;
	// We assume we only get called during init.
	paste_mac();
	form.mac.value = computer['mac'] || default_mac;
	paste_mac();
	paste_pass();
	form.pass.value = computer['pass'] || default_pass;
	paste_pass();
}

function load_settings() {
	chrome.storage.local.get(settings_keys, function(settings) {
		if ('computers' in settings) {
			computers = settings['computers'] || [];
			populate_computers();
			load_computer(settings['last_selected'] || 0);
		} else {
			// Migrate old settings.
			chrome.storage.local.get(old_settings_keys, function(settings) {
				computers[0] = settings;
				populate_computers();
				load_computer(0);
				store_settings();
				chrome.storage.local.remove(old_settings_keys);
			});
		}
	});
}

/*
 * Update the currently selected computer then write out the whole thing.
 */
function store_settings() {
	sync_mac();
	sync_pass();

	var form = $$('form[name=settings]');
	var select = $$('select[name=computer]');
	var idx = select.selectedIndex;
	computers[idx] = {
		'name': form.computer.value,
		'host': form.host.value,
		'mac': form.mac.value,
		'pass': form.pass.value,
		'port': form.port.value,
	};

	chrome.storage.local.set({
		'computers': computers,
	});
}

/*
 * Dynamic toggling of the theme via CSS.
 */
function toggle_theme() {
	const theme = get_css_var('theme') == 'light' ? 'dark' : 'light';
	const css = $$('link#theme-override');
	css.href = `css/${theme}.css`;
	chrome.storage.local.set({theme});
}

/*
 * If they try deleting all entries, make sure we re-add the default.
 */
function check_empty_computers(select) {
	if (select.length == 0) {
		var option = document.createElement('option');
		option.text = 'Default';
		select.add(option, 0);
		load_computer(0);
	}
}

/*
 * Fill out the computer drop down with existing config options.
 */
function populate_computers() {
	var select = $$('select[name=computer]');
	select.length = 0;

	for (var i = 0; i < computers.length; i++) {
		var option = document.createElement('option');
		var computer = computers[i] || {};
		option.text = computer['name'] || default_name;
		select.add(option, i);
	}

	check_empty_computers(select);
}

/*
 * When a computer config is selected, load the corresponding settings.
 */
function select_computer() {
	load_computer($$('select[name=computer]').selectedIndex);
}

/*
 * Toggle between the computer drop down & new name input field.
 */
function toggle_add_fields(hide_obj, show_obj) {
	hide_obj.disabled = true;
	hide_obj.style.display = 'none';
	show_obj.disabled = false;
	show_obj.style.display = 'inline';
	show_obj.focus();
}

/*
 * Del curent slected computer
 */
function del_computer() {
	var select = $$('select[name=computer]');

	var idx = select.selectedIndex;
	// Delete the currently selected index.
	computers.splice(idx, 1);
	select.remove(idx);

	// Make sure the list isn't entirely empty now.
	check_empty_computers(select);

	// Load/select the next entry in the list.
	if (idx == select.length && idx > 0)
		--idx;
	load_computer(idx);

	store_settings();
}


/*
 * Shows an input box to enter new computer name.
 */
function add_computer_start() {
	var select = $$('select[name=computer]');
	var text = $$('input[name=computer_name]');

	// If the box isn't visible, show it.  Otherwise, they want to
	// actually add the current settings so create a new entry.
	if (select.style.display == 'none')
		add_computer();
	else
		toggle_add_fields(select, text);
}

/*
 * Wait for the enter key in the add text field.
 */
function add_computer_check(e) {
	if (e.key == 'Enter') {
		add_computer();
		e.preventDefault();
	}
}

/*
 * Try to actually create a new computer entry.
 */
function add_computer() {
	var select = $$('select[name=computer]');
	var form = $$('form[name=settings]');
	var text = $$('input[name=computer_name]');

	var name = text.value.trim();
	// Make sure they've added a valid name first.
	// Options fields don't allow leading/trailing whitespace.
	if (name == '') {
		text.value = '';
		toggle_add_fields(text, select);
		return;
	}

	// Make sure they don't try to add a duplicate name.
	for (var i = 0; i < select.length; ++i) {
		if (select.options[i].value == name) {
			popup_msg(text, 'ERROR: computer name already exists!');
			return;
		}
	}
	text.value = '';

	var option = document.createElement('option');
	option.text = name;
	select.add(option, -1);

	// Let the load_computer logic fill out the default values for us.
	var idx = select.length - 1;
	computers[idx] = {
		'name': name,
	};
	load_computer(select.length - 1);

	toggle_add_fields(text, select);

	store_settings();
}

/*
 * Startup.
 */
window.onload = function() {
	$$('input[name=send]').onclick = send;
	$$('select[name=computer]').onchange = select_computer;
	$$('a[name=mac-paste]').onclick = paste_mac;
	$$('a[name=pass-paste]').onclick = paste_pass;
	$$('input[name=del_computer]').onclick = del_computer;
	$$('input[name=add_computer]').onclick = add_computer_start;
	$$('input[name=computer_name]').onkeypress = add_computer_check;
	$$('button[name=theme]').onclick = toggle_theme;

	load_settings();
};
