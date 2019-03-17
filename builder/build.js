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
const templateSettings = body => ({ body, id: buildid });

// Grab a writer for the main template
const generateFromTemplate = htmlWriter(templateOf("../dev/template.html"));

// Pages to render
const pagesToSettings = {
	"index.html": templateSettings(htmlOfMD("../dev/index.md")),
	"engagementphotos.html": templateSettings(htmlOfMD("../dev/engagementphotos.md")),
	"rsvp.html": templateSettings(templateOf('../dev/rsvp.html')({id: buildid})),
};

// Render each of the pages to an appropriate file
Object.keys(pagesToSettings).forEach(name => 
	generateFromTemplate(name, pagesToSettings[name]));
