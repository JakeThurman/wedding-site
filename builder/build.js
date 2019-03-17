const crypto = require("crypto");
const showdown = require('showdown');
const handlebars = require('handlebars');
const fs = require('fs');

// Helper that loads the content of a file as a string
const contentOf = filename => fs.readFileSync(filename, 'utf8');

// Allow us to get out HTML from a given markdown file
const mdConverter = new showdown.Converter();
const htmlOfMD = mdFile => mdConverter.makeHtml(contentOf(mdFile));

// Compile the handlebar template for index.html
const templateSource = contentOf("../dev/index.html");
const template = handlebars.compile(templateSource);

// Generate the full html content
const fullHTML = template({ 
    body: htmlOfMD("../dev/body.md"),
    id: crypto.randomBytes(16).toString("hex"),  
});

// Write the output file
fs.writeFile("../public/index.html", fullHTML, function(err) {
    if(err) throw err;
    console.log("The file was saved!");
}); 

