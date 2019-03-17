const crypto = require("crypto");
const showdown = require('showdown');
const handlebars = require('handlebars');
const fs = require('fs');

const buildid = crypto.randomBytes(16).toString("hex")
const mdConverter = new showdown.Converter();

// File Helpers
const contentOf = filename => fs.readFileSync(filename, 'utf8');
const writeFile = (filename, content) => fs.writeFile("../public/" + filename, content, err => {
	if(err) throw err;
    console.log(`${filename} - COMPLETE`);
}); 

// Markdown paring helper
const htmlOfMD = mdFile => mdConverter.makeHtml(contentOf(mdFile));

// Handlebar use helpers
const templateOf = filename => handlebars.compile(contentOf(filename))
const htmlWriter = (template) => (name, settings) => writeFile(name, template(settings)); 

// Grab a writer for the main template
const mainTemplate = htmlWriter(templateOf("../dev/index.html"));

 // Generate the full html content on main pages
mainTemplate("index.html", {
    body: htmlOfMD("../dev/body.md"),
    isHome: true,
    id: buildid,  
});
mainTemplate("rsvp.html", {
    body: mdConverter.makeHtml(`
# Melissa & Jake

Sorry, RSVPs are not yet being accepted.
Thanks for trying to get back to us so quickly!
    `),
    isHome: false,
    id: buildid,  
});

