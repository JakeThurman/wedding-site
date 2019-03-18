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

	var src = document.getElementById("output-template").innerHTML;
	var template = Handlebars.compile(src);
	var container = document.getElementById("output");
	
	function countOfRsvpsWhere(people, predicate) {
		return people.reduce(function (soFar, next) {
				return soFar + next.rsvps.filter(predicate).length;
		}, 0);	
	} 

	function renderWithUser(user) {
		var ref = firebase.database().ref("users");


		ref.on('value', function(snapshot) {
			var data = snapshot.val() || {};
			var keys = Object.keys(data);

			var people = keys.map(function (uid) {
				var rsvps = data[uid].rsvps || {};

				return {
					uid: uid,
					rsvps: Object.keys(rsvps).map(function (rid) {
						var r = rsvps[rid];

						return {
							rid: rid,
							name: r.name || "!No Name Given!",
							note: r.note || "",
							cannot_attend: !r.can_attend, // Fliped for easy defaulting
						};
					}),
				};
			});

			var canCount = countOfRsvpsWhere(people, function (rsvp) {
				return !rsvp.cannot_attend
			});
			var cannotCount = countOfRsvpsWhere(people, function (rsvp) {
				return rsvp.cannot_attend
			});

			container.innerHTML = template({
				count: {
					total: canCount + cannotCount,
					can: canCount,
					cannot: cannotCount,
				},
				people: people,
			});
		});

		// return a cleanup function
		return function () { 
			ref.off();
		};
	}

	function renderWithoutUser() {
		container.innerText = "An Error Occured: Authorization not completed.";
		
		// No cleanup
		return function () {};
	}

	// --Register to rerender when auth changes---
	var cleanupLast = (function () {});
	firebase.auth().onAuthStateChanged(function(user) {
		cleanupLast();
		cleanupLast = user ? renderWithUser(user) : renderWithoutUser();
	});

	// --Setup--
	if (!firebase.auth().currentUser) {
		firebase.auth().signInAnonymously();
	}

})();