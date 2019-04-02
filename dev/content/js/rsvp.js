(function () {
	"use strict";

	// --Get Dom nodes--
	var form = document.getElementById("rsvp-form") || {};
	var statusNode = document.getElementById('responses-status') || {};
	var namesNode = document.getElementById('responses-names') || {};
	var validationContainer = document.getElementById("validation-msg") || {};

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

	function renderWithUser(user) {
		var ref = firebase.database().ref("users/" + user.uid + "/rsvps");

		ref.on('value', function(snapshot) {
			var rawData = snapshot.val() || {};
			
			statusNode.innerText = Object.keys(rawData).length > 0 
				? "Thanks for your response!" 
				: "No response sent.";
			
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
})();
