// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

function status(msg) {
	$$('[name=status]').innerText = msg;
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
			chrome.sockets.udp.close(s, nullcb);
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
var settings_keys = [
	'host',
	'mac',
	'pass',
	'port',
	'theme',
];

function load_settings() {
	var storage = chrome.storage.local;

	chrome.storage.local.get(settings_keys, function(settings) {
		set_theme(settings['theme'] || 'dark');
		var form = $$('form[name=settings]');
		form.host.value = settings['host'] || '192.168.0.255';
		form.port.value = settings['port'] || '40000';
		// We assume we only get called during init.
		paste_mac();
		form.mac.value = settings['mac'] || '20:00:00:00:00:00';
		paste_mac();
		paste_pass();
		form.pass.value = settings['pass'] || '00:00:00:00:00:00';
		paste_pass();
	});
}

function store_settings() {
	var form = $$('form[name=settings]');
	sync_mac();
	sync_pass();
	var settings = {
		'host': form.host.value,
		'mac': form.mac.value,
		'pass': form.pass.value,
		'port': form.port.value,
		'theme': curr_theme,
	};
	chrome.storage.local.set(settings);
}

/*
 * Startup.
 */
window.onload = function() {
	$$('form[name=settings]').onsubmit = send;
	$$('a[name=mac-paste]').onclick = paste_mac;
	$$('a[name=pass-paste]').onclick = paste_pass;
	$$('input[name=theme]').onclick = toggle_theme;

	load_settings();
};
