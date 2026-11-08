import { randomBytes } from "crypto";

/** Gera um id legível e único a partir do nome (ex.: "frango-catupiry-3f9a"). */
export function menuIdFromName(name: string) {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
  return `${slug}-${randomBytes(2).toString("hex")}`;
}
