import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let ts;
try { ts = require("typescript"); } catch {
  try { ts = require("/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript"); } catch { ts = require("/usr/local/lib/node_modules/typescript"); }
}

const root = path.resolve(process.argv[2] || "src");
const findings = [];
const stats = { buttons: 0, links: 0, forms: 0, files: 0 };

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|jsx)$/.test(entry.name)) inspect(full);
  }
}

function attr(attributes, name) {
  return attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === name);
}

function literalValue(attribute) {
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  return undefined;
}

function locate(source, file, node) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${path.relative(process.cwd(), file)}:${position.line + 1}:${position.character + 1}`;
}

function inspect(file) {
  stats.files += 1;
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(source);
      if (tag === "button") {
        stats.buttons += 1;
        const type = literalValue(attr(opening.attributes, "type"));
        const actionable = Boolean(attr(opening.attributes, "onClick") || attr(opening.attributes, "formAction") || type === "submit" || type === "reset");
        if (!actionable) findings.push(`${locate(source, file, opening)} botão sem onClick, formAction ou type=submit/reset`);
      }
      if (tag === "a" || tag === "Link") {
        stats.links += 1;
        if (!attr(opening.attributes, "href") && !attr(opening.attributes, "onClick")) {
          findings.push(`${locate(source, file, opening)} ${tag} sem href ou onClick`);
        }
      }
      if (tag === "form") {
        stats.forms += 1;
        if (!attr(opening.attributes, "onSubmit") && !attr(opening.attributes, "action")) {
          findings.push(`${locate(source, file, opening)} form sem onSubmit ou action`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

walk(root);
console.log(`Arquivos TSX/JSX: ${stats.files}`);
console.log(`Botões verificados: ${stats.buttons}`);
console.log(`Links verificados: ${stats.links}`);
console.log(`Formulários verificados: ${stats.forms}`);
if (findings.length) {
  console.error(`\nControles suspeitos: ${findings.length}`);
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Controles suspeitos: 0");
