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
	var form = document.getElementById("rsvp-form");
	var countNode = document.getElementById('responses-count');
	var fields = ["name", "note", "can_attend"];

	function renderWithUser(user) {
		var ref = firebase.database().ref("users/" + user.uid + "/rsvps");

		ref.on('value', function(snapshot) {
			countNode.innerText = Object.keys(snapshot.val() || {}).length || "No";
		});

		var onSubmit = function (e) { 
			e.preventDefault();

			var data = {};

			fields.forEach(function (id) {
				// Record and clear the value of each field
				data[id] = (document.getElementById(id) || {}).value;
				(document.getElementById(id) || {}).value = "";
			});

			// Write the response to firebase
			ref.push(data);
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
	});

	// --Setup--
	firebase.auth().signInAnonymously();

})();
