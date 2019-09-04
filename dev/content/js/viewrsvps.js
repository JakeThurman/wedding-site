(function () {
	"use strict";

	var isFirstLoad = true;

	function notifyMe(txt) {
		function show() {
			if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
				navigator.serviceWorker.getRegistrations().then(function (rs) {
					if (rs.length)
					rs[0].showNotification(txt);
					else
						new Notification(txt);
				});
			}
			else
				new Notification(txt);
		}

		if (!window.Notification || Notification.permission === "denied") {
			alert(txt);
		}
		else if (Notification.permission === "granted") {
			show();
		}
		else {
			Notification.requestPermission(function (status) {
				if (status === "granted")
					show();
				else
					alert(txt);
			});
		}
	}

	var csvUtil = {
		toCSV: function(items) {
			var header = Object.keys(items[0]);
			var csv = items.map(function (row) {
				return header.map(function (fieldName) { 
					return JSON.stringify(row[fieldName])
				}).join(',')
			});
			csv.unshift(header.join(','));
			return csv.join("\r\n");
		},
		downloadAsCSV: function(items, dataName) {
			// Convert the name to a file name
			var filename = dataName.replace(/[^a-z0-9]/gi, '_').substring(0, 100) + ".csv"

			// Create a uri for the data
			var csvContent = csvUtil.toCSV(items)
			var fullText = "data:text/csv;charset=utf-8," + csvContent
			var encodedUri = encodeURI(fullText)

			// Attach this to an element
			var link = document.createElement("a")
			link.setAttribute("href", encodedUri)
			link.setAttribute("download", filename)
			document.body.appendChild(link) // Required for FF

			link.click()

			// Cleanup
			document.body.removeChild(link)
		}
	}

	var sendEmailButton = document.getElementById('send-update-email');
	sendEmailButton.addEventListener("click", function () { 
		firebase.database().ref("force_email").transaction(c => c + 1).then(function () {
			alert("Email triggered.");
		})
	})

	var handleDownloadRef = { current: null };
	var downloadButton = document.getElementById('download-csv');
	downloadButton.addEventListener("click", function () { 
		if (handleDownloadRef.current)
			handleDownloadRef.current()
		else 
			alert("Data is still loading...")
	})

	var src = document.getElementById("output-template").innerHTML;
	var template = Handlebars.compile(src);
	var container = document.getElementById("output");
	
	function countOfRsvpsWhere(people, predicate) {
		return people.reduce(function (soFar, next) {
			return soFar + next.rsvps.filter(predicate).length;
		}, 0);
	}

	function countOfPeopleWhere(people, predicate) {
		return people.filter(predicate).length;
	}

	var ref = firebase.database().ref("users");

	ref.on('value', function(snapshot) {
		if (!isFirstLoad)
			notifyMe("New wedding responses have arived!");

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
						meal: r.meal || "Unknown",
						cannot_attend: !r.can_attend, // Fliped for easy defaulting
					};
				})
				.sort(function (a, b) {
					return a.timestamp - b.timestamp
				});

			// We also include a 0 timestamp in 
			//  so that if there aren't actaully 
			//  any responses yet, sorting doesn't
			//  break. All people with no response
			//  are stuck at the end.
			var timestamps = rsvps.map(function (rsvp) { return rsvp.timestamp }).concat([0]);
			var newestResponse = new Date(Math.max.apply(null, timestamps));
			
			// This is the Label shown on gray seperator lines
			var guestInfo = person.guestInfo || {};
			var nameIsCorrect = guestInfo.enteredName === guestInfo.name;
			var label = nameIsCorrect ? guestInfo.name : (guestInfo.name + " (typed: '" + guestInfo.enteredName + "')");

			return {
				uid: uid,
				rsvps: rsvps,
				newestResponse: newestResponse,
				label: label,
				nameIsCorrect: nameIsCorrect,
				timestamp: {
					long: rsvps.length ? moment(newestResponse).format('llll') : "[No Response]",
					rel: rsvps.length ? moment(newestResponse).fromNow() : "",
				},
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

		var uniqueResponses = people
			.map(function (p) {
				return p.label 
			})
			.filter(function (value, index, self) { 
				return self.indexOf(value) === index;
			});

		var duplicateCount = people.length - uniqueResponses.length
		
		var wrongNamesCount = countOfPeopleWhere(people, function (person) {
			return !person.nameIsCorrect;
		});

		function mealCount(mealName) { 
			return countOfRsvpsWhere(people, function (person) {
				return !person.cannot_attend && person.meal.toLowerCase() === mealName;
			});
		}

		var chickenEaterCount = mealCount("chicken");
		var beefEaterCount = mealCount("beef");
		var porkEaterCount = mealCount("pork");
		var vegetarianEaterCount = mealCount("vegetarian");

		// Check for invalid meals (except for people that just can't come!)
		var invalidEaterCout = countOfRsvpsWhere(people, function (person) {
			var meal = person.meal.toLowerCase();
			return !person.cannot_attend
				&& meal !== "chicken" 
				&& meal !== "beef"
				&& meal !== "vegetarian"
		});
		
		container.innerHTML = template({
			count: {
				total: canCount + cannotCount,
				can: canCount,
				cannot: cannotCount,
				duplicates: duplicateCount,
				wrongNames: wrongNamesCount,
				meal: {
					chicken: chickenEaterCount,
					beef: beefEaterCount,
					pork: porkEaterCount,
					vegetarian: vegetarianEaterCount,
					invalid: invalidEaterCout,
				},
			},
			people: people,
		});

		handleDownloadRef.current = function () {
			var allRsvps = people.reduce(function (curr, next) { 
				return curr.concat(next.rsvps) 
			}, [])

			var data = allRsvps.map(function (r) {
				return {
					"Name": r.name,
					"Meal": r.meal,
					"Can Attend": r.cannot_attend ? "N" : "Y",
					"Note": r.note.replace("\n", ''),
				}
			})

			csvUtil.downloadAsCSV(data, "responses")
		}

		isFirstLoad = false;
	});

})();