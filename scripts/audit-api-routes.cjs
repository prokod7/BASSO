// Verifies UI fetch/apiJson URLs against Next.js route files without sending requests.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(ts|tsx)$/.test(file)) files.push(file);
  }
}
walk('src');
const routes = files.filter(file => file.endsWith('/route.ts'));
const errors = [];
let checked = 0;
function values(node) {
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...values(node.whenTrue), ...values(node.whenFalse)];
  return [];
}
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['fetch', 'apiJson'].includes(node.expression.text)) {
      const [url, options] = node.arguments;
      let pathname;
      if (url && (ts.isStringLiteral(url) || ts.isNoSubstitutionTemplateLiteral(url))) pathname = url.text;
      else if (url && ts.isTemplateExpression(url)) pathname = url.head.text + url.templateSpans.map(span => `DYNAMIC${span.literal.text}`).join('');
      if (pathname?.startsWith('/api/')) {
        checked++;
        let methods = ['GET'];
        if (options && ts.isObjectLiteralExpression(options)) {
          const method = options.properties.find(property => property.name?.getText(source) === 'method');
          if (method && ts.isPropertyAssignment(method)) methods = values(method.initializer);
        }
        const parts = pathname.split('?')[0].split('/').filter(Boolean);
        const candidates = routes.filter(route => {
          const segments = route.replace(/^src\/app\//, '').replace(/\/route.ts$/, '').split('/');
          return segments.length === parts.length && segments.every((segment, index) => segment.startsWith('[') || segment === parts[index]);
        }).sort((a,b) => (a.match(/\[/g) || []).length - (b.match(/\[/g) || []).length);
        const location = `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        if (!candidates.length) errors.push(`${location}: rota ausente para ${pathname}`);
        else {
          const code = fs.readFileSync(candidates[0], 'utf8');
          for (const method of methods) {
            if (!new RegExp(`export (?:async )?function ${method}\\b|export const ${method}\\b`).test(code)) errors.push(`${location}: ${method} não existe em ${candidates[0]}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log(`${checked} chamadas de API verificadas; ${errors.length} rota(s)/método(s) incompatível(is).`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
