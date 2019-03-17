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
const generateFromTemplate = htmlWriter(templateOf("../dev/template.html"));


// Render params
const rsvpIsReady = false;

// Pages to render
const pages = {
	"index.html": {
	    body: htmlOfMD("../dev/index.md"),
	    canRSVP: rsvpIsReady,
	    id: buildid,  
	},
	"engagementphotos.html": {
	    body: htmlOfMD("../dev/engagementphotos.md"),
	    canRSVP: rsvpIsReady,
	    id: buildid,  
	},
	"rsvp.html": {
   		body: mdConverter.makeHtml(`
# [Melissa & Jake](index.html)

Sorry, RSVPs are not yet being accepted.
Thanks for trying to get back to us so quickly!
    	`),
    	canRSVP: false,
    	id: buildid,  
	},
};

// Render each of the pages to an appropriate file
Object.keys(pages).forEach(name => 
	generateFromTemplate(name, pages[name]));
