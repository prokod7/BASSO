import fs from "node:fs";
import path from "node:path";

const directory = path.resolve("supabase/migrations");
const files = fs.readdirSync(directory).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const errors = [];
files.forEach((name, index) => {
  const expected = String(index + 1).padStart(3, "0");
  if (!name.startsWith(`${expected}_`)) errors.push(`Esperado ${expected}, encontrado ${name}`);
  const content = fs.readFileSync(path.join(directory, name), "utf8");
  if (content.trim().length < 80) errors.push(`${name} parece vazio ou incompleto.`);
});
if (!files.some((name) => name.startsWith("014_"))) errors.push("Migration 014 ausente.");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${files.length} migrations em sequência, de ${files[0]} até ${files.at(-1)}.`);
