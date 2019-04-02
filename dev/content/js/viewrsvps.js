(function () {
	"use strict";

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
			var people = Object.keys(data).map(function (uid) {
				var person = data[uid];

				var rsvps = Object.keys(person.rsvps || {})
					.map(function (rid) {
						var r = person.rsvps[rid];

						return {
							rid: rid,
							timestamp: new Date(r.timestamp),
							name: r.name || "!No Name Given!",
							note: r.note || "",
							cannot_attend: !r.can_attend, // Fliped for easy defaulting
						};
					})
					.sort(function (a, b) {
						return a.timestamp - b.timestamp
					});

				var timestamps = rsvps.map(function (rsvp) { return rsvp.timestamp });
				var newestResponse = new Date(Math.max.apply(null, timestamps));

				return {
					uid: uid,
					rsvps: rsvps,
					newestResponse: newestResponse,
				}
			}).sort(function (a, b) {
				return b.newestResponse - a.newestResponse
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

		// Oh: We didn't log in yet!
		if (!user) {
			firebase.auth().signInAnonymously();
		}
	});

})();