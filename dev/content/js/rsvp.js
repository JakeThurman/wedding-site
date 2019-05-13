(function () {
	"use strict";

	// --Get Dom nodes--
	var form = document.getElementById("rsvp-form") || {};
	var statusNode = document.getElementById('responses-status') || {};
	var namesNode = document.getElementById('responses-names') || {};
	var validationContainer = document.getElementById("back-validation-msg") || {};

	function getFields() {
		var f_name = document.getElementById("name") || {};
		var f_note = document.getElementById("note") || {};
		var f_can_attend = document.querySelector('input[name="can_attend"]:checked') || {};

		return [
			{
				id: "name",
				el: f_note,
				validationMessage: f_name.value ? null : "Please include your name.",
				value: f_name.value || "",
				reset: function () { f_name.value = "" }
			},
			{
				id: "note",
				el: f_note,
				value: f_note.value || "",
				reset: function () { f_note.value = "" }
			},
			{
				id: "can_attend",
				el: f_can_attend,
				validationMessage: f_can_attend.value ? null : "Please make an attendence selection.",
				value: f_can_attend.value == "true",
				reset: function () { /*f_can_attend.checked = false*/ } // Don't clear radio bttns
			},
		];
	};

	function normalizeName(name) {
		return name.toLowerCase().split(" ").sort().join(' ');
	}

	function namesIsSame(a, b) {
		return strDist(normalizeName(a), normalizeName(b)) <= 1;
	}

	function findNameInGuestList(testname, callback) {
		var ref = firebase.database().ref("guestlist");
		ref.once('value').then(function(snapshot) {
			var guestlist = snapshot.val() || [];
			var matches = guestlist.filter(function (name) { 
				return namesIsSame(name, testname);
			});

			if (matches.length === 1)
				callback(true, matches[0]);
			else 
				callback(false);
		});
	}

	function renderWithUser(user) {
		var ref = firebase.database().ref("users/" + user.uid + "/rsvps");

		// Go straight to the second stage if the user has already given us their name
		firebase.database().ref("users/" + user.uid + "/name").once('value').then(function(snapshot) {
			if (snapshot.exists() && snapshot.val()) {
				form.classList.toggle("on-second-stage");
				document.getElementById("name").value = snapshot.val();
			}
		});

		// 
		ref.on('value', function(snapshot) {
			var rawData = snapshot.val() || {};
			
			statusNode.innerText = Object.keys(rawData).length > 0 
				? "Thanks for your response!" 
				: "No response sent from this device.";
			
			// Clear last set of names
			while (namesNode.firstChild) {
				namesNode.removeChild(namesNode.firstChild);
			}

			// Insert new set
			Object.keys(rawData).map(function (id) {
				return rawData[id];
			}).sort(function (a, b) {
				return new Date(a.timestamp) - new Date(b.timestamp)
			}).forEach(function (response) {
				var el = document.createElement("li");
				el.innerText = (response.name || "?") + (response.can_attend ? " - Accepts" : " - Declines");
				namesNode.appendChild(el);
			});
		});

		var onSubmit = function (e) {
			e.preventDefault();

			if (form.classList.contains("on-second-stage")) {
				var fields = getFields();

				var errorMessage = fields.reduce(function (result, field) {
					return result || field.validationMessage;
				}, null);

				// Show error/replace with empty string if none.
				validationContainer.innerText = errorMessage || "";
				validationContainer.classList.toggle("form-group", !!errorMessage);

				// Submit the form
				if (!errorMessage) {
					var data = {
						timestamp: (new Date()).toISOString()
					};

					fields.forEach(function (f) {
						// Record and clear the value of each field
						data[f.id] = f.value;
						f.reset();
					});

					ref.push(data);
				}
			}
			else {
				var nameEl = document.getElementById("inv-name");
				findNameInGuestList(nameEl.value, function (found, name) {
					if (found) {
						form.classList.toggle("on-second-stage");
						firebase.database().ref("users/" + user.uid + "/name").set(name);
						document.getElementById('name').value = nameEl.value;
					} else {
						alert("We couldn't find your name, make sure it's exactly as the invitation. If you continue to see this issue, please contact the couple.")
					}
				})
			}
		};

		// Register the listener
		form.addEventListener("submit", onSubmit);

		// return a cleanup function
		return function () { 
			ref.off();
			form.removeEventListener("submit", onSubmit);
		};
	}

	function renderWithoutUser() {
		var onSubmit = function (e) {
			e.preventDefault();
			alert("Something went wrong. Please refresh the page and try again.")
		};

		form.addEventListener("submit", onSubmit);
		return function () { 
			form.removeEventListener("submit", onSubmit);
		};
	}


	// --Register to rerender when auth changes---
	var cleanupLast = (function () {});
	firebase.auth().onAuthStateChanged(function(user) {
		cleanupLast();
		cleanupLast = user ? renderWithUser(user) : renderWithoutUser();

		// Oh: We didn't log in yet!
		if (!user) {
			firebase.auth().signInAnonymously();
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
						matrix[i-1][j-1] + 1, // substitution
						Math.min(
							matrix[i][j-1] + 1, // insertion
							matrix[i-1][j] + 1)); // deletion
				}
			}
		}

		return matrix[b.length][a.length];
	}
})();
