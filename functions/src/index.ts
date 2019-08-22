import groupBy from 'lodash.groupby';
import * as functions from 'firebase-functions'
import * as nodemailer from 'nodemailer'
import * as admin from 'firebase-admin'
const { htmlEncode } = require('htmlencode')
const postmarkTransport = require('nodemailer-postmark-transport')

// Base types
type Dict<T> = { [id: string]: T }

type FailedAttempt = {
    fingerprint: number
    incorrectGuess: string,
    name: string,
    timestamp: string
}

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

    const newResponses = allUsers.filter(user => user.emailsSent !== user.rsvps.length);
    const guestsStillWaitingOn = await getRemainingGuests(allUsers);
    const failedRsvps = await getNewFailedAttempts();

    const emailHtml = getEmailHtml(newResponses, guestsStillWaitingOn, failedRsvps);
    await sendEmail(emailHtml, newResponses.length);

    // Mark the responses we've already sent emails for.
    const updates = toDict(newResponses.map(user => [`${user.uid}/emailsSent`, user.rsvps.length]));
    await admin.database().ref("users").update(updates);
}

async function getNewFailedAttempts(): Promise<FailedAttempt[]> {
    const results: FailedAttempt[] = await admin.database()
                                                .ref("failed_names")
                                                .once("value")
                                                .then(snap => Object.values(snap.val() || {}));

    // TODO: filter seen
    return results;
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

    return guests.filter(g => !responseNames.has(g.name.toLowerCase()))
                 .sort(guestSorter);
}

function guestSorter(a: ExpectedGuest, b: ExpectedGuest) {
    const aNames = a.name.toLowerCase().split(" ")
    const bNames = b.name.toLowerCase().split(" ")

    // Sort by last name
    if(aNames[aNames.length - 1] < bNames[bNames.length - 1]) return -1;
    if(aNames[aNames.length - 1] > bNames[bNames.length - 1]) return 1;

    // Then by first name
    if(aNames[0] < bNames[0]) return -1;
    if(aNames[0] > bNames[0]) return 1;

    return 0;
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
                can_attend: r.can_attend ? "Y" : "N",
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

function getEmailHtml(newUsers: CleanedUser[], guestsStillWaitingOn: ExpectedGuest[], failedRsvps: FailedAttempt[]) {

    const stillWaitingContent = guestsStillWaitingOn.map(g => `${g.name} (${g.maxGuests})`)
                                                    .map(txt => `<li>${htmlEncode(txt)}</li>`)

    const getRsvpItem = (r: CleanedResponse) => `
        <li>
            <div><b>Name</b>: ${htmlEncode(r.name)}</div>
            <div><b>Can Attend:</b>: ${htmlEncode(r.can_attend)}</div>
            <div><b>Eating</b>: ${htmlEncode(r.meal)}</div>
            <div><b>Note</b>: <span style='white-space:pre-wrap'>${htmlEncode(r.note)}</span></div>
            <br/>
        </li>`

    const newResponseItems = newUsers.map(u => `
        <li>
            <h3>${htmlEncode(u.label)}</h3>
            <ul>${u.rsvps.map(getRsvpItem).join("")}</ul>
        </li>`)

    const getFailedRsvpItem = (f: FailedAttempt) => 
        `<li>${htmlEncode(f.name)}</li>`

    const fingerPrintGroups = Object.values(groupBy(failedRsvps, r => r.fingerprint));
    const failedRsvpItems = fingerPrintGroups.map((r, i) => `
        <li>
            <b>Person #${i+1}</b>
            <ul>${r.sort().map(getFailedRsvpItem).join("")}</ul>
        </li>`)

    return `
    <html>
        <body>
            <h1>New Responses (${newResponseItems.length})</h1>
            <ul>${newResponseItems.join("") || "<li><i>No New Responses</i></li>"}</ul>
            <br/>
            <br/>
            <h1>Failed Responses (${failedRsvpItems.length})</h1>
            <ul>${failedRsvpItems.join("") || "<li><i>No Failed Responses</i></li>"}</ul>
            <br/>
            <br/>
            <h1>Guests Who Haven't Responded (${stillWaitingContent.length}):</h1>
            <ul>${stillWaitingContent.join("")}</ul>
        </body>
    </html>`
}

async function sendEmail(html: string, numNewUsers: number) {
    const emailToUse: { to: string, from: string, fromName: string } = 
        await admin.database()
                   .ref("addressForNewResponseEmail")
                   .once("value")
                   .then(snap => snap.val());
    
    const mailOptions = {
        from: `"${emailToUse.fromName}" <${emailToUse.from}`,
        to: emailToUse.to,
        subject: `${numNewUsers} New Response${numNewUsers === 1 ? "" : "s"}`,
        html,
    }

    mailTransport.sendMail(mailOptions)
                 .catch((error) => console.error('There was an error while sending the email:', error))
}
