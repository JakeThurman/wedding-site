import * as functions from 'firebase-functions'
import * as nodemailer  from 'nodemailer'
import * as admin from 'firebase-admin'
import { firebaseConfig } from 'firebase-functions';
const { htmlEncode } = require('htmlencode')
const postmarkTransport = require('nodemailer-postmark-transport')

// Base types
type Dict<T> = { [id: string]: T }

type ExpectedGuest = {
    maxGuests: number
    name: string
}

type RawResponse = {
    can_attend: boolean
    meal: string
    name: string
    note: string
    timestamp: string //ISO-8601
}

type RawUser = { 
    rsvps: Dict<RawResponse>
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
    uid: string
    newestResponse: Date
    label: string
    guestListName: string
    emailsSent: number
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

export const manualTriggerEmail = functions.database.ref("force_email").onWrite(sendNewUserEmail);
export const dailyEmail = functions.pubsub.schedule("every 1 day").onRun(sendNewUserEmail);

async function sendNewUserEmail() {
    const allUsers = await getAllUsers();

    // Find all of the users with new responses
    const newResponses = allUsers.filter(user => user.emailsSent !== user.rsvps.length);

    if (!newResponses.length)
        return;

    // Collect the list of guests we haven't heard back from.
    const guestsStillWaitingOn = await getRemainingGuests(allUsers);

    await sendEmail(newResponses, guestsStillWaitingOn);

    // Mark the responses we've already sent emails for.
    const updates = toDict(newResponses.map(user => [`${user.uid}/emailsSent`, user.rsvps.length]));
    await admin.database().ref("users").update(updates);
}

async function getAllUsers(): Promise<CleanedUser[]> {
    const usersRef = admin.database().ref("users");
    const userSnapshot = await usersRef.once("value");

    return sanitizeAndSortUsers(userSnapshot.val());
}

async function getRemainingGuests(existingUsers:CleanedUser[]): Promise<ExpectedGuest[]> {
    const guests: ExpectedGuest[] = await admin.database()
                                               .ref("guestlist")
                                               .once("value")
                                               .then(snap => snap.val());

    // Skip all of the guests and all of their +1s.
    const responseNames = new Set(existingUsers.map(u => u.guestListName.toLowerCase()));
    
    const allRsvps = existingUsers.reduce((curr, next) => next.rsvps.concat(curr), [] as CleanedResponse[]);
    allRsvps.forEach(r => !responseNames.has(r.name.toLowerCase()) && responseNames.add(r.name.toLowerCase()));

    return guests.filter(g => !responseNames.has(g.name.toLowerCase()));
}

function toDict<T>(pairs: [string, T][]) {
    const result: Dict<T> = {};
    pairs.forEach(p => result[p[0]] = p[1])
    return result
}

function sanitizeAndSortUsers(users: Dict<RawUser>): CleanedUser[] {
    return Object.entries(users).map(([uid, person]) => {
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
            uid: uid,
            rsvps: rsvps,
            newestResponse: newestResponse,
            label: label,
            emailsSent: person.emailsSent || 0,
            guestListName: guestInfo.name,
        }
    }).sort(function (a, b) {
        return b.newestResponse.valueOf() - a.newestResponse.valueOf()
    });
}

async function sendEmail(newUsers: CleanedUser[], guestsStillWaitingOn: ExpectedGuest[]) {
    const emailToUse: { to: string, from: string, fromName: string } = await admin.database()
                                          .ref("addressForNewResponseEmail")
                                          .once("value")
                                          .then(snap => snap.val());
    
    const stillWaitingContent = guestsStillWaitingOn.map(g => `${g.name} (${g.maxGuests})`)
                                                    .map(txt => `<li>${htmlEncode(txt)}</li>`)

    const getRsvpItem = (r: CleanedResponse) => `
        <li>
            <div><b>Name</b>: ${htmlEncode(r.name)}</div>
            <div><b>Eating</b>: ${htmlEncode(r.meal)}</div>
            <div><b>Note</b>: <span style='white-space:pre-wrap'>${htmlEncode(r.note)}</span></div>
        </li>`

    const newResponseItems = newUsers.map(u => `
        <li>
            <h3>${htmlEncode(u.label)}</h3>
            <ul>${u.rsvps.map(getRsvpItem).join("")}</ul>
        <li>`)

    const mailOptions = {
        from: `"${emailToUse.fromName}" <${emailToUse.from}`,
        to: emailToUse.to,
        subject: `${newUsers.length} New Response${newUsers.length > 1 ? "s" : ""}`,
        html: `
            <html>
                <body>
                    <h1>New Responses</h1>
                    <ul>${newResponseItems.join("")}</ul>
                    <br/>
                    <h1>Guests Who Haven't Responded (${stillWaitingContent.length}):</h1>
                    <ul>${stillWaitingContent.join("")}</ul>
                </body>
            </html>`,
    }

    mailTransport.sendMail(mailOptions)
                 .catch((error) => console.error('There was an error while sending the email:', error))
}
