(function () {
	"use strict";

	var MAX_NAME_DIST = 8;
	var state = { maxGuests: 1, currGuests: 0 };

	// --Get Dom nodes--
	var form = document.getElementById("rsvp-form") || {};
	var statusNode = document.getElementById('responses-status') || {};
	var namesNode = document.getElementById('responses-names') || {};
	var validationContainer = document.getElementById("back-validation-msg") || {};
	var signOutBttn = document.getElementById('sign-out') || {};

	function getFields() {
		var f_name = document.getElementById("name") || {};
		var f_note = document.getElementById("note") || {};
		
		var f_can_attend_all = document.querySelectorAll('input[name="can_attend"]') || [];
		var f_can_attend_selected = document.querySelector('input[name="can_attend"]:checked') || {};

		var f_meal_all = document.querySelectorAll('input[name="meal"]') || [];
		var f_meal_selected = document.querySelector('input[name="meal"]:checked') || {};

		var canAttend = f_can_attend_selected.value == "true";

		return [
			{
				id: "name",
				els: [f_name],
				validationMessage: f_name.value ? null : "Please include your name.",
				value: f_name.value || "",
				reset: function () { f_name.value = "" }
			},
			{
				id: "can_attend",
				els: f_can_attend_all,
				validationMessage: f_can_attend_selected.value ? null : "Please make an attendence selection.",
				value: canAttend,
				reset: function () {} // Don't clear these radio bttns!
			},
			{
				id: "meal",
				els: f_meal_all,
				validationMessage: !canAttend || f_meal_selected.value ? null : "Please make a meal selection.",
				value: f_meal_selected.value || "",
				reset: function () { f_meal_all.forEach(function (el) { el.checked = false }) }
			},
			{
				id: "note",
				els: [f_note],
				value: f_note.value || "",
				reset: function () { f_note.value = "" }
			},
		];
	}

	function getField(id) {
		return getFields()
			.filter(function (f) { return f.id === id })[0];
	}

	function focusFirstField() {
		getFields()[0].els[0].focus();
	}

	function setDisabled(els, disable) {
		els.forEach(function (el) {
			if (disable)
				el.setAttribute("disabled", "disabled");
			else 
				el.removeAttribute("disabled");
		});
	}

	function normalizeName(name) {
		return (name || "").toLowerCase().split(" ").sort().join(' ');
	}

	function nameDist(a, b) {
		return strDist(normalizeName(a), normalizeName(b))
	}

	function getBestGuessInGuestList(testname) {
		var ref = firebase.database().ref("guestlist");

		return ref.once('value').then(function(snapshot) {
			var guestlist = snapshot.val() || [];
			
			var sortedList = guestlist.sort(function (a, b) {
				return nameDist(a.name, testname) - nameDist(b.name, testname);
			});

			return sortedList[0];
		});
	}

	function findNameInGuestList(testname, callback) {
		var ref = firebase.database().ref("guestlist");
		ref.once('value').then(function(snapshot) {
			var guestlist = snapshot.val() || [];
			var matches = guestlist.filter(function (guest) { 
				return nameDist(guest.name, testname) <= 1;
			});

			if (matches.length === 1)
				callback(true, matches[0]);
			else 
				callback(false);
		});
	}

	

	function confirmCloseMatch(guessedName, enteredName) {
		return Swal.fire({
			text: "Your name wasn't found as you typed it. Did you mean " + guessedName.name + "?",
			type: 'question',
			confirmButtonText: "Yes, That's Me.",
			cancelButtonText: 'No',
			showCancelButton: true,
		}).then(function(result) {
			if (result.value)
				onNameMatchSuccess(guessedName, enteredName)
			else
				onNameMatchFailure(enteredName, guessedName)
		})
	}

	function getGuestsText(n) {
		if (n === 1) return "";
		if (n === 2) return " and guest";
		return " and guests";
	}

	function onNameMatchSuccess(matchedName, enteredName) {
		state.maxGuests = matchedName.maxGuests;
		
		document.getElementById('name').value = enteredName;
		document.getElementById("guest-list-name").innerText = enteredName + getGuestsText(state.maxGuests);

		firebase.auth().signInAnonymously().then(function () {
			// Store user info in the DB for later
			var user = firebase.auth().currentUser || {};
			firebase.database().ref("users/" + user.uid + "/guestInfo").set({
				name: matchedName.name,
				maxGuests: matchedName.maxGuests,
				enteredName: enteredName,
			});
		});

		Swal.mixin({
			toast: true,
			position: 'top-end',
			showConfirmButton: false,
			timer: 5000
		}).fire({
			type: 'success',
			title: 'Thanks ' + enteredName + ". Now just one more step..."
		});
	}

	function onNameMatchFailure(name, optionalGuessedName) {
		Swal.fire(
			"We couldn't find your name.", 
			"Try checking with altername forms of your name (i.e., Josh vs. Joshua). If you continue to see this issue, please contact Jake/Melissa.",
			"error")

		// Log this failure to the DB
		firebase.database().ref("failed_names").push({
			name: name,
			incorrectGuess: optionalGuessedName,
			timestamp: (new Date()).toISOString(),
			fingerprint: (new ClientJS()).getFingerprint(),
		});
	}

	function onSignOut() {
		firebase.auth().signOut().then(function () {
			getFields().forEach(function (f) { f.reset(); });
		});
	}

	function renderWithUser(user) {
		var ref = firebase.database().ref("users/" + user.uid + "/rsvps");

		// Fill in the current values if the user has already given us their name
		firebase.database().ref("users/" + user.uid + "/guestInfo").once('value').then(function(snapshot) {
			if (snapshot.exists() && snapshot.val()) {
				focusFirstField();

				var data = snapshot.val() || {};

				state.maxGuests = data.maxGuests;

				// Fill in, but don't overwrite the name data
				var nameEl = getField("name").els[0];
				if (!nameEl.value) {
					nameEl.value = data.enteredName;
					document.getElementById("guest-list-name").innerText = data.enteredName + getGuestsText(state.maxGuests);
				}
			}
		});

		// Keep the 'existing rsvps' list up to date.
		ref.on('value', function(snapshot) {
			var rawData = snapshot.val() || {};
			
			statusNode.innerText = Object.keys(rawData).length > 0 
				? "Thanks for your response!" 
				: "";
			
			// Clear last set of names
			while (namesNode.firstChild) {
				namesNode.removeChild(namesNode.firstChild);
			}

			// Insert new set
			var rsvps = Object.keys(rawData).map(function (id) {
				return rawData[id];
			}).sort(function (a, b) {
				return new Date(a.timestamp) - new Date(b.timestamp)
			});
			
			// Think about the number of guests
			state.currGuests = rsvps.length;
			var atMaxGuests = state.maxGuests <= rsvps.length;

			// Disable fields as needed
			getFields().forEach(function (f) {
				setDisabled(f.els, atMaxGuests);
			});

			// Show/hide the max guests explainer message
			document.getElementById('leading-msg').innerText = atMaxGuests 
				? ("Thanks for your response!" + (state.maxGuests > 1 ? " Seems like that's everyone!" : ""))
				: "Please Submit an RSVP for each guest."

			// Display the list of rsvps
			rsvps.forEach(function (response) {
				var el = document.createElement("li");
				el.innerText = (response.name || "?") + (response.can_attend ? " - Accepts" : " - Declines");
				namesNode.appendChild(el);
			});
		});

		function onSubmit(e) {
			e.preventDefault();

			// Fail if there are already the maximum number of rsvps
			if (state.maxGuests == state.currGuests)
				return;

			// Get data from the dom
			var fields = getFields();

			var fieldWithError = fields.reduce(function (result, field) {
				return result || (field.validationMessage && field);
			}, null);

			// Show error/replace with empty string if none.
			validationContainer.innerText = (fieldWithError || {}).validationMessage || "";
			validationContainer.classList.toggle("form-group", !!fieldWithError);

			if (fieldWithError) {
				fieldWithError.els[0].focus();
			} else { // Submit the form
				var data = {
					timestamp: (new Date()).toISOString()
				};

				fields.forEach(function (f) {
					// Record and clear the value of each field
					data[f.id] = f.value;
					f.reset();
				});

				ref.push(data);

				focusFirstField();
			}
		};

		function onAttendanceChange() {
			var canAttend = getField("can_attend").value;
			var mealEls = getField("meal").els;
			
			// If you can't go, you don't get to pick a meal
			setDisabled(mealEls, !canAttend);
		}

		// Register the listeners
		form.addEventListener("submit", onSubmit);
		signOutBttn.addEventListener("click", onSignOut);

		var attendenceEls = getField("can_attend").els;
		attendenceEls.forEach(function (el) { el.addEventListener("change", onAttendanceChange) })

		// return a cleanup function
		return function () { 
			ref.off();
			form.removeEventListener("submit", onSubmit);
			signOutBttn.removeEventListener("click", onSignOut);
			attendenceEls.forEach(function (el) { el.removeEventListener("change", onAttendanceChange) })
		};
	}

	function renderWithoutUser() {
		// Clear last set of names
		while (namesNode.firstChild) {
			namesNode.removeChild(namesNode.firstChild);
		}

		statusNode.innerText = "";

		function onSubmit(e) {
			e.preventDefault();
			
			var enteredName = document.getElementById("inv-name").value;
			findNameInGuestList(enteredName, function (found, matchedName) {
				if (found) {
					onNameMatchSuccess(matchedName, enteredName);
					return;
				}

				getBestGuessInGuestList(enteredName).then(function (guessedName) {
					if (nameDist(guessedName.name, enteredName) >= MAX_NAME_DIST)
						onNameMatchFailure(enteredName)
					else
						confirmCloseMatch(guessedName, enteredName)
				});
			});
		}

		form.addEventListener("submit", onSubmit);
		return function () { 
			form.removeEventListener("submit", onSubmit)
		};
	}

	// --Register to rerender when auth changes---
	var cleanupLast = (function () {});
	firebase.auth().onAuthStateChanged(function(user) {
		cleanupLast();
		cleanupLast = user ? renderWithUser(user) : renderWithoutUser();

		if (user) {
			form.classList.add("on-second-stage");
			focusFirstField();
		} else {
			form.classList.remove("on-second-stage");
			document.getElementById("inv-name").focus();
		}
	});

	// https://gist.github.com/andrei-m/982927
	function strDist(a, b){
		if(a.length == 0) return b.length; 
		if(b.length == 0) return a.length; 

		var matrix = [];

		// increment along the first column of each row
		for(var i = 0; i <= b.length; i++) matrix[i] = [i];

		// increment each column in the first row
		for(var j = 0; j <= a.length; j++) matrix[0][j] = j;

		// Fill in the rest of the matrix
		for(i = 1; i <= b.length; i++){
			for(j = 1; j <= a.length; j++){
				if(b.charAt(i-1) == a.charAt(j-1)){
					matrix[i][j] = matrix[i-1][j-1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i-1][j-1] + 3, // substitution
						Math.min(
							matrix[i][j-1] + 1, // insertion
							matrix[i-1][j] + 1)); // deletion
				}
			}
		}

		return matrix[b.length][a.length];
	}
})();
