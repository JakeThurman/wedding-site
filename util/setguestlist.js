var x = `` // Paste spreadsheet here
var y = x.split("\n").map(z => z.split("\t").map(q => q.trim()))
var o = y.map(z => ({ name: z[0] + " " + z[1], maxGuests: parseInt(z[2]) }))
firebase.database().ref("guestlist").set(o)
