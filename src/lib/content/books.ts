import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, paths } from "../site.ts";
import { parseFrontMatter } from "./frontmatter.ts";
import { scalarText } from "../scalar.ts";

export interface BookData {
  name: string;
  title: string;
  shortTitle?: string;
  subTitle?: string;
  edition?: string;
  author?: string;
  summary: string;
  image: string;
  availability?: string;
  bookURL?: string;
  price?: string;
  numberOfPages?: string;
  isbn?: string;
  date?: string;
}

/** Reads the book promotions in `collections/en/_books`. */
export function readBooks(root = ROOT): BookData[] {
  const directory = path.join(root, paths.books);
  return readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const document = parseFrontMatter(readFileSync(path.join(directory, file), "utf8"), file);
      const data = document.data;
      const text = (key: string) => {
        const value = document.source([key]) ?? data[key];
        return value === undefined || value === null ? undefined : scalarText(value);
      };
      return {
        name: text("name") ?? path.basename(file, ".md"),
        title: text("title") ?? "",
        shortTitle: text("short_title"),
        subTitle: text("sub_title"),
        edition: text("edition"),
        author: text("author"),
        summary: scalarText(data.summary),
        image: text("image") ?? "",
        availability: text("availability"),
        bookURL: text("book_url"),
        price: text("price"),
        numberOfPages: text("number_of_pages"),
        isbn: text("isbn"),
        date: text("date"),
      };
    });
}
