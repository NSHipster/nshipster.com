import type { BookData } from "../content/books.ts";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stripTags = (value: string) => value.replace(/<[^>]*>/g, "").trim();

/** Structured data for a book, shared by articles and page components. */
export function bookJSONLD(book: BookData, image: string, summaryHTML = book.summary): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    author: { "@type": "Person", name: book.author ?? "Mattt" },
    bookFormat: "https://schema.org/EBook",
    datePublished: book.date ?? "",
    image,
    inLanguage: "English",
    isbn: book.isbn ?? "",
    name: stripTags(book.title),
    description: stripTags(summaryHTML),
    numberOfPages: book.numberOfPages ?? "",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: book.price ?? "",
      priceCurrency: "USD",
      url: book.bookURL ?? "",
    },
    publisher: { "@type": "Organization", name: "Read Evaluate Press, LLC" },
  };
}

/** Serializes structured data for a `<script type="application/ld+json">` element. */
export function jsonLD(data: unknown): string {
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

/** The `book.html` include used by `flight-school.md`. */
export function bookHTML(book: BookData, image: string): string {
  return [
    `<div id="${escape(book.name)}" class="book">`,
    `<a href="${escape(book.bookURL ?? "")}" title="${escape(book.title)}" rel="noopener noreferrer" target="_blank">`,
    `<img src="${escape(image)}" class="cover" alt="${escape(book.title)}">`,
    `</a>`,
    `<script type="application/ld+json">${jsonLD(bookJSONLD(book, image))}</script>`,
    `</div>`,
  ].join("\n");
}
