const fs = require('fs');
const path = require('path');

const searchPattern = /@webmunk\/(\S+)\//g;

function extractNamesFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = [];
    let match;
    while ((match = searchPattern.exec(content)) !== null) {
        matches.push(match[1]);
    }

    return matches;
}


exports.searchModulesInDirectory = function searchModulesInDirectory(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const extractedNames = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules') {
                extractedNames.push(...searchModulesInDirectory(path.join(directory, entry.name)));
            }
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
          console.log("Scanning: "+entry.name)  
          extractedNames.push(...extractNamesFromFile(path.join(directory, entry.name)));
        }
    }

    return extractedNames;
}
// test
function test(){
    let modules = searchModulesInDirectory("./src")
    console.log("Modules:"+modules)
    return modules;
}

