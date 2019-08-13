import * as functions from 'firebase-functions'
import * as nodemailer  from 'nodemailer'
import * as admin from 'firebase-admin'
const { htmlEncode } = require('htmlencode')
const postmarkTransport = require('nodemailer-postmark-transport')

// Base types
type Dict<T> = { [id: string]: T }

type ExpectedGuest = {
    maxGuests: number
    name: string
}

type Response = {
    can_attend: boolean
    meal: string
    name: string
    note: string
    timestamp: string //ISO-8601
}

type User = { 
    rsvps: Dict<Response>
    guestInfo: {
        maxGuests: number
        name: string
        enteredName: string
    },
    emailsSent: number | undefined
}

type CleanedResponse = {
    rid: string
    timestamp: Date
    name: string
    note: string
    meal: string
    can_attend: string
}

type CleanedUser = {
    rsvps: CleanedResponse[]
    newestResponse: Date
    label: string
};

// Initialize Admin SDK
try {admin.initializeApp(functions.config().firebase)} catch(e) {
    console.log('Failure to initializeApp !!!')
}

// Setup mail sender using environment variable.
// TO SET: firebase functions:config:set postmark.key="API-KEY-HERE"
const postMarkConfig = functions.config().postmark;
const mailTransport = nodemailer.createTransport(postmarkTransport({
    auth: { apiKey: postMarkConfig.key }
}))

// Each day, send an email

export const sendTooManyEmails = functions.database.ref("users").onWrite(async () => {
//export const dailyEmail = functions.pubsub.schedule("every 1 day").onRun(async () => {
    const usersRef = admin.database().ref("users");
    
    // Grab the value of the users
    const snap = await usersRef.once("value");
    
    const allUsers: Dict<User> = snap.val()

    // Find all of the users with new responses
    const newResponses = Object.entries(allUsers)
                               .filter(pair => pair[1].emailsSent !== Object.keys(pair[1].rsvps).length);

    if (!newResponses.length)
        return;

    // Collect the data for an email
    const guestsStillWaitingOn = await getRemainingGuests(Object.values(allUsers));

    sendEmail(newResponses.map(([_, user]) => user), guestsStillWaitingOn);

    // Mark the responses we've already sent emails for.
    const updates = toDict(newResponses.map(([uid, user]) => [`${uid}/emailsSent`, Object.keys(user.rsvps).length]));
    await usersRef.update(updates);
});

async function getRemainingGuests(existingUsers:User[]): Promise<ExpectedGuest[]> {
    const guests: ExpectedGuest[] = await admin.database()
                                               .ref("guestlist")
                                               .once("value")
                                               .then(snap => snap.val());

    const responseNames = new Set(existingUsers.map(u => u.guestInfo.name));

    return guests.filter(g => !responseNames.has(g.name));
}

function toDict<T>(pairs: [string, T][]) {
    const result: Dict<T> = {};
    pairs.forEach(p => result[p[0]] = p[1])
    return result
}

function sanitizeAndSortUsers(users: User[]): CleanedUser[] {
    return users.map((person) => {
        const rsvps = Object.entries(person.rsvps || {})
            .map(([rid, r]) => ({
                rid: rid,
                timestamp: new Date(r.timestamp),
                name: r.name || "!No Name Given!",
                note: r.note || "",
                meal: r.meal || "Unknown",
                can_attend: r.can_attend ? "Y" : "N", // Fliped for easy defaulting
            }))
            .sort(function (a, b) {
                return a.timestamp.valueOf() - b.timestamp.valueOf()
            });

        // We also include a 0 timestamp in 
        //  so that if there aren't actaully 
        //  any responses yet, sorting doesn't
        //  break. All people with no response
        //  are stuck at the end.
        const timestamps = rsvps.map(function (rsvp) { return rsvp.timestamp.valueOf() }).concat([0]);
        const newestResponse = new Date(Math.max.apply(null, timestamps));
        
        // This is the Label shown on gray seperator lines
        const guestInfo = person.guestInfo || {};
        const nameIsCorrect = guestInfo.enteredName === guestInfo.name;
        const label = nameIsCorrect ? guestInfo.name : (guestInfo.name + " (typed: '" + guestInfo.enteredName + "')");

        return {
            rsvps: rsvps,
            newestResponse: newestResponse,
            label: label,
        }
    }).sort(function (a, b) {
        return b.newestResponse.valueOf() - a.newestResponse.valueOf()
    });
}

function sendEmail(newUsers: User[], guestsStillWaitingOn: ExpectedGuest[]) {
    const stillWaitingContent = guestsStillWaitingOn.map(g => `${g.name} (${g.maxGuests})`)
                                                    .map(txt => `<li>${htmlEncode(txt)}</li>`)

    const sanitizedUsers = sanitizeAndSortUsers(newUsers)

    const getRsvpItem = (r: CleanedResponse) => `
        <li>
            <div><b>Name</b>: ${htmlEncode(r.name)}</div>
            <div><b>Eating</b>: ${htmlEncode(r.meal)}</div>
            <div><b>Note</b>: <span style='white-space:pre-wrap'>${htmlEncode(r.note)}</span></div>
        </li>`

    const newResponseItems = sanitizedUsers.map(u => `
        <li>
            <h2>${htmlEncode(u.label)}</h2>
            <ul>${u.rsvps.map(getRsvpItem)}</ul>
        <li>`)
    
    const mailOptions = {
        from: '"melissaandjake.com" <noreply@melissaandjake.com>',
        to: `jacob@thurmans.com`,
        subject: `${sanitizedUsers.length} New Response${sanitizedUsers.length > 1 ? "s" : ""}`,
        html: `
            <html>
                <body>
                    <h1>New Responses</h1>
                    <ul>${newResponseItems}</ul>
                    <br/>
                    <h1>Still waiting on responses from:</h1>
                    <ul>${stillWaitingContent}</ul>
                </body>
            </html>`,
    }

    mailTransport.sendMail(mailOptions)
                 .catch((error) => console.error('There was an error while sending the email:', error))
}
