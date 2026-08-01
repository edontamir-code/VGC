import fs from "fs";
const read = p => fs.readFileSync(p,"utf8");
// strip ESM import lines and 'export ' keywords so files can be concatenated
const strip = s => s.replace(/^\s*import .*$/gm,"").replace(/^export\s+/gm,"").replace(/\bexport\s+/g,"");
const parts = [
  "src/typechart.js","src/engine.js","src/data/moves.js","src/data/team.js","src/speed.js","src/data/threats.js"
].map(p=>`// ===== ${p} =====\n`+strip(read(p))).join("\n\n");
const ui = read("build/ui.js");
const css = read("build/style.css");
const html = read("build/template.html")
  .replace("/*STYLE*/", css)
  .replace("//ENGINE", parts)
  .replace("//UI", ui);
fs.writeFileSync("demo.html", html);
console.log("wrote demo.html", html.length, "bytes");
