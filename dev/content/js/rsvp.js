(function () {
	"use strict";

	firebase.initializeApp({
		"apiKey": "AIzaSyAPczq1-Zu7-bH1ikdrhUdoDsByBH8tpcE",
		"databaseURL": "https://melissa-and-jake-wedding.firebaseio.com",
		"storageBucket": "melissa-and-jake-wedding.appspot.com",
		"authDomain": "melissa-and-jake-wedding.firebaseapp.com",
		"messagingSenderId": "19750996536",
		"projectId": "melissa-and-jake-wedding"
	});

	// --Get Dom nodes--
	var form = document.getElementById("rsvp-form") || {};
	var countNode = document.getElementById('responses-count') || {};
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
				reset: function () { f_can_attend.checked = false }
			},
		];
	};

	function renderWithUser(user) {
		var ref = firebase.database().ref("users/" + user.uid + "/rsvps");

		ref.on('value', function(snapshot) {
			countNode.innerText = Object.keys(snapshot.val() || {}).length || "No";
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
				var data = {};

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
