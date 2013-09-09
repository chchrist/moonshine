

(function () {


	var ide,
		loaded = {},
		breakpoints = {},
		stopAtBreakpoints,
		debug,
		executionMarker,
		highlightedLine,
		errorLog = [],

		elements = {
			debugger: document.querySelector('.shine-debug'),
			pauseResume: document.querySelector('.pause-resume'),
			autoStep: document.querySelector('.auto-step'),
			stepOver: document.querySelector('.step-over'),
			stepIn: document.querySelector('.step-in'),
			stepOut: document.querySelector('.step-out'),
			breakpoints: document.querySelector('.breakpoints'),
			files: document.querySelector('#files'),
			globals: {
				header: document.querySelector('.inspector.globals h6'),
				counter: document.querySelector('.inspector.globals h6 span'),
				list: document.getElementById('globals')
			},
			locals: {
				header: document.querySelector('.inspector.locals h6'),
				counter: document.querySelector('.inspector.locals h6 span'),
				list: document.getElementById('locals')
			},
			upvalues: {
				header: document.querySelector('.inspector.upvalues h6'),
				counter: document.querySelector('.inspector.upvalues h6 span'),
				list: document.getElementById('upvalues')
			},
			callStack: {
				header: document.querySelector('.inspector.call-stack h6'),
				list: document.getElementById('call-stack')
			},
			errorLog: {
				header: document.querySelector('.inspector.error-log h6'),
				counter: document.querySelector('.inspector.error-log h6 span'),
				list: document.getElementById('error-log')
			}
		};



	elements.files.addEventListener('change', function () {
		loadScript(this.value);
	});




	function addExpandListeners (section, defaultOpen) {
		var open;

		elements[section].header.addEventListener('click', function () {
			var el = this.parentNode,
				match = el.className.match(/^(.*?)( open)?$/),
				open = !match[2];

			el.className = match[1] + (open? ' open' : '');
			if (localStorage) localStorage.setItem(section + '-open', open);
		});

		if (localStorage) {
			open = localStorage.getItem(section + '-open');
			
			if ((!open && defaultOpen) || (open == 'true')) {
				elements[section].header.parentNode.className += ' open';
			}
		}
	}

	addExpandListeners('globals');
	addExpandListeners('upvalues');
	addExpandListeners('locals', true);
	addExpandListeners('callStack', true);
	addExpandListeners('errorLog', true);




	window.registerDebugEngine = function (obj) {
		debug = obj;

		reset(debug);
		setupListeners(debug);
		setupHooks(debug);
	}




	function reset (debug) {
		var i;

		debug.getCurrentState(function (state) {
			clearErrors();

			loaded = state.loaded;
			breakpoints = state.breakpoints;
			stopAtBreakpoints = state.stopAtBreakpoints;
			errorLog = state.errorLog;
			updateBreakpointButton();
			updateFileDropdown();

			updateErrorLog();
			loadScript();
		});

		elements.pauseResume.textContent = 'Pause/Resume';
		elements.pauseResume.className = 'pause-resume';

		clearInspectors();
		loadScript();
	}




	function clearInspectors () {
		elements.globals.list.textContent = elements.locals.list.textContent = elements.upvalues.list.textContent = elements.callStack.list.textContent = '';
		elements.globals.counter.textContent = elements.locals.counter.textContent = elements.upvalues.counter.textContent = '0';
	}




	function setupListeners (debug) {
		elements.pauseResume.addEventListener('click', function () {
			if (debug._status == 'running') {
				debug.pause();
			} else {
				debug.resume();
			}
		});

		elements.autoStep.addEventListener('click', function () {
			debug.autoStep();
		});

		elements.stepOver.addEventListener('click', function () {
			debug.stepOver();
		});

		elements.stepIn.addEventListener('click', function () {
			debug.stepIn();
		});

		elements.stepOut.addEventListener('click', function () {
			debug.stepOut();
		});

		elements.breakpoints.addEventListener('click', function () {
			debug.toggleStopAtBreakpoints();
		});
	}




	function setupHooks (debug) {

		debug.bind('state-updated', function (state, data) {
			switch (state) {
				case 'running':
					clearHighlight();
					elements.pauseResume.textContent = 'Pause';
					elements.pauseResume.className = 'pause-resume';
					break;

				case 'suspending':
					elements.pauseResume.textContent = 'Resume';
					elements.pauseResume.className = 'pause-resume suspended';
					break;

				case 'suspended':
					elements.pauseResume.textContent = 'Resume';
					elements.pauseResume.className = 'pause-resume suspended';
					highlightLine(data.url, data.line);
					showVariables(data);
					break;

				case 'resuming':
					elements.pauseResume.textContent = 'Pause';
					elements.pauseResume.className = 'pause-resume';
					clearInspectors();
					highlightedLine = undefined;
					break;
			}
		});

		debug.bind('reset', function (debug) {
			reset(debug);
		});

		debug.bind('error', function (e) {
			showError(e);
			updateErrorLog();
		});

		debug.bind('lua-loaded', function (jsonUrl, luaUrl, data) {
			loaded[jsonUrl] = {
				filename: luaUrl,
				source: data
			};

			updateFileDropdown();
		});

		debug.bind('lua-load-failed', function (jsonUrl) {
			loaded[jsonUrl] = false;
		});

		debug.bind('breakpoints-updated', function (data) {
			breakpoints = data;
		});

		debug.bind('breakpoint-updated', function (jsonUrl, lineNumber, breakOn) {
			if (breakpoints[jsonUrl] === undefined) breakpoints[jsonUrl] = [];
			breakpoints[jsonUrl][lineNumber] = breakOn;

			if (jsonUrl == elements.files.value) updateBreakpoints();
		});

		debug.bind('stop-at-breakpoints-updated', function (stop) {
			stopAtBreakpoints = stop;
			updateBreakpointButton();
		});
	}




	function showVariables (data) {
		var i, l, li, anchor, match;

		function appendPair (term, def, section) {
			var el = document.createElement('dt');
			el.textContent = term;
			section.list.appendChild(el);
			
			el = document.createElement('dd');
			el.textContent = def;
			section.list.appendChild(el);
		}

		function showVars (obj, section) {
			var count = 0;

			for (var i in obj) {
				if (obj.hasOwnProperty(i)) {
					appendPair(i, formatValue(obj[i]), section);
					count++;
				}
			}			

			section.counter.textContent = count;
		}

		clearInspectors();
		showVars(data.globals, elements.globals);
		showVars(data.upvalues, elements.upvalues);
		showVars(data.locals, elements.locals);

		for (i = 0, l = data.callStack.length; i < l; i++) {
			match = data.callStack[i].match(/^(.*)\[((.*?):(\d+))\]$/);

			li = document.createElement('li');
			li.textContent = match[1];

			anchor = document.createElement('a');
			anchor.textContent = match[2];
			anchor.href = '#'; // yuck

			anchor.dataset.jsonUrl = getJsonUrl(match[3]);
			anchor.dataset.lineNumber = match[4];

			anchor.addEventListener('click', function (e) {
				goToLine(this.dataset.jsonUrl, parseInt(this.dataset.lineNumber, 10));
				e.preventDefault();
			});

			li.appendChild(anchor);
			elements.callStack.list.appendChild(li);
		}
	}




	function getJsonUrl (luaUrl) {
		for (var i in loaded) {
			if (loaded[i].filename == luaUrl) return i
		}
	}




	function updateErrorLog () {
		var i, l, error;

		elements.errorLog.list.textContent = '';

		for (i = 0, l = errorLog.length; i < l; i++) {
			error = errorLog[i];

			li = document.createElement('li');
			li.textContent = error.message;

			anchor = document.createElement('a');
			anchor.textContent = loaded[error.jsonUrl].filename + ':' + error.lineNumber;
			anchor.href = '#'; // yuck

			anchor.dataset.jsonUrl = error.jsonUrl;
			anchor.dataset.lineNumber = error.lineNumber;

			anchor.addEventListener('click', function (e) {
				e.preventDefault();
				goToLine(this.dataset.jsonUrl, parseInt(this.dataset.lineNumber, 10));
			});

			li.appendChild(anchor);
			elements.errorLog.list.appendChild(li);
		}

		elements.errorLog.counter.textContent = l;
		elements.errorLog.header.className = l? 'has-errors' : '';
	}




	function formatValue (val) {
		switch(true) {
			case val === undefined: return 'nil';
			case val === Infinity: return 'inf';
			case val === -Infinity: return '-inf';
			case typeof val == 'number' && window.isNaN(val): return 'nan';
			case typeof val == 'function': return 'function: [native]';
			default: return val.toString();
		}
	}
	



	function updateBreakpointButton () {
		elements.debugger.className = 'shine-debug' + (stopAtBreakpoints? ' stop-at-breakpoints' : '');
	}




	function updateFileDropdown () {
		var files = elements.files,
			value = files.value,
			i,
			option;

		files.options.length = 0;

		for (i in loaded) {
			if (loaded.hasOwnProperty(i)) {
				option = document.createElement('option');
				option.textContent = loaded[i].filename;
				option.value = i;
				files.appendChild(option);
			}
		}

		if (value) files.value = value;
		loadScript();
	}




	function loadScript (jsonUrl) {
		var session = ide.getSession(),
			i, err;

		jsonUrl = jsonUrl || elements.files.value;

		clearHighlight();
		clearErrors();

		ide.setValue((loaded[jsonUrl] || {}).source || '');
		ide.scrollToLine(1, true);
		ide.clearSelection();

		if (!jsonUrl) {
			ide.getSession().clearBreakpoints();

		} else {
			updateBreakpoints();

			if (highlightedLine && highlightedLine.url == jsonUrl) {
				executionMarker = session.addMarker(new ide.Range(highlightedLine.line - 1, 0, highlightedLine.line - 1, Infinity), 'exec');
			}

			for (i in errorLog) {
				err = errorLog[i];

				if (err.jsonUrl == jsonUrl && !err.marker) {
					err.marker = session.addMarker(new ide.Range(err.lineNumber - 1, 0, err.lineNumber - 1, Infinity), 'error');

					window.setTimeout(function () {
						session.setAnnotations([{
							row: err.lineNumber - 1,
							column: 0,
							text: err.message,
							type: 'error'
						}]);

					}, 1000);
				}
			}

		}
	}




	function updateBreakpoints () {
		var jsonUrl,
			fileBreakpoints,
			session,
			i, l;

		jsonUrl = elements.files.value;
		fileBreakpoints = breakpoints[jsonUrl] || [];
		session = ide.getSession();

		session.clearBreakpoints();

		for (i = 0, l = fileBreakpoints.length; i < l; i++) {
			if (fileBreakpoints[i]) session.setBreakpoint(i);
		}
	}




	function highlightLine (jsonUrl, lineNumber) {
		clearHighlight();

		highlightedLine = {
			url: jsonUrl, 
			line: lineNumber
		};

		elements.files.value = jsonUrl;
		loadScript();

		ide.scrollToLine(lineNumber - 1, true);
	}




	function clearHighlight () {
		ide.getSession().removeMarker(executionMarker);
		executionMarker = undefined;
	}




	function showError (error) {
		errorLog.push(error);

		elements.files.value = error.jsonUrl;
		loadScript();

		ide.scrollToLine(error.lineNumber - 1, true);
	}




	function clearErrors () {
		var session = ide.getSession(),
			i, l, marker;

		session.clearAnnotations();
		for (i = 0, l = errorLog.length; i < l; i++) {
			if (marker = errorLog[i].marker) {
				session.removeMarker(marker);
				delete errorLog[i].marker;
			}
		}
	}




	function goToLine (jsonUrl, lineNumber) {
		loadScript(jsonUrl);

		var session = ide.getSession(),
			marker = session.addMarker(new ide.Range(lineNumber - 1, 0, lineNumber - 1, Infinity), 'goto');

		window.setTimeout(function () {
			session.removeMarker(marker);
		}, 1000);
	}



	
	function initIDE() {
		var theme = 'ace/theme/github',
			shine, init;

		ide = ace.edit('code');
		ide.Range = ace.require('ace/range').Range;
		ide.Selection = ace.require('ace/selection').Selection;

	    ide.setTheme(theme);
	    ide.setFontSize(10);
	    ide.setReadOnly(true);
	    ide.getSession().setMode('ace/mode/lua');

		window.setTimeout(function () {
			ide.ready = true;
			ide.setTheme(theme);		// Ace bugfix. theme isn't always applied unless in timeout
		}, 500);



		ide.on("guttermousedown", function (e) { 
			var row = e.getDocumentPosition().row;
			debug.toggleBreakpoint(elements.files.value, row);
		});

		loadScript();		
	}




	initIDE();

})();

