import { site } from "./site.ts";

/**
 * A point in time with its wall-clock representation in the site time zone.
 * Jekyll interprets front matter and filename dates as local midnight
 * in `America/Los_Angeles`, so all dates are normalized the same way.
 */
export interface ZonedDate {
  /** The absolute instant. */
  date: Date;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Offset from UTC in minutes, e.g. -420 for PDT. */
  offset: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: site.timezone,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function wallClock(instant: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Returns the zoned representation of an absolute instant. */
export function zoned(instant: Date): ZonedDate {
  const wall = wallClock(instant);
  const asUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const offset = Math.round((asUTC - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
  return { date: instant, ...wall, offset };
}

/** Returns local midnight (or the given local time) in the site time zone. */
export function localDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): ZonedDate {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Resolve the offset twice to settle on the correct side of a DST change.
  let instant = new Date(guess - zoned(new Date(guess)).offset * 60000);
  instant = new Date(guess - zoned(instant).offset * 60000);
  return zoned(instant);
}

/**
 * Parses a date the way Ruby's `Time.parse` handles front matter values:
 * `YYYY-MM-DD`, `YYYY-MM-DD HH:MM[:SS] [±HHMM]`, or a `Date` from YAML.
 */
export function parseDate(value: unknown): ZonedDate | undefined {
  if (value instanceof Date) {
    // YAML timestamps without a time are UTC midnight; treat them as local dates.
    return localDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
    );
  }
  if (typeof value !== "string") return undefined;
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) {
    // Natural-language dates like "September 30, 2019" are parsed as local wall-clock times.
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return localDate(
      parsed.getFullYear(),
      parsed.getMonth() + 1,
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds(),
    );
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0", zone] = match;
  if (zone) {
    const sign = zone === "Z" ? 0 : zone.startsWith("-") ? -1 : 1;
    const digits = zone.replace(/[^0-9]/g, "");
    const offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0));
    const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offset * 60000;
    return zoned(new Date(utc));
  }
  return localDate(+y, +mo, +d, +h, +mi, +s);
}

const pad = (n: number, width = 2, char = "0") => String(n).padStart(width, char);

function formatOffset(offset: number, colon: boolean): string {
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ":" : ""}${pad(abs % 60)}`;
}

/** Formats a date like Jekyll's `date_to_xmlschema` filter. */
export function xmlschema(date: ZonedDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)}${formatOffset(date.offset, true)}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}

/**
 * Formats a date with Ruby `strftime` semantics, including the `%o` ordinal
 * extension from the Jekyll site's date filter.
 */
export function strftime(date: ZonedDate, format: string): string {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const dayOfYear =
    Math.floor((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(date.year, 0, 1)) / 86400000) + 1;
  const hour12 = date.hour % 12 === 0 ? 12 : date.hour % 12;

  return format.replace(/%([-_0^#]?)([a-zA-Z%])/g, (whole, flag: string, conversion: string) => {
    const number = (value: number, width: number) => {
      if (flag === "-") return String(value);
      if (flag === "_") return pad(value, width, " ");
      return pad(value, width);
    };
    const text = (value: string) => (flag === "^" ? value.toUpperCase() : value);
    switch (conversion) {
      case "Y":
        return String(date.year);
      case "y":
        return number(date.year % 100, 2);
      case "C":
        return number(Math.floor(date.year / 100), 2);
      case "m":
        return number(date.month, 2);
      case "d":
        return number(date.day, 2);
      case "e":
        return flag === "-" ? String(date.day) : pad(date.day, 2, " ");
      case "j":
        return number(dayOfYear, 3);
      case "H":
        return number(date.hour, 2);
      case "k":
        return pad(date.hour, 2, " ");
      case "I":
        return number(hour12, 2);
      case "l":
        return pad(hour12, 2, " ");
      case "M":
        return number(date.minute, 2);
      case "S":
        return number(date.second, 2);
      case "L":
        return "000";
      case "p":
        return date.hour < 12 ? "AM" : "PM";
      case "P":
        return date.hour < 12 ? "am" : "pm";
      case "B":
        return text(MONTHS[date.month - 1]!);
      case "b":
      case "h":
        return text(MONTHS[date.month - 1]!.slice(0, 3));
      case "A":
        return text(WEEKDAYS[weekday]!);
      case "a":
        return text(WEEKDAYS[weekday]!.slice(0, 3));
      case "u":
        return String(weekday === 0 ? 7 : weekday);
      case "w":
        return String(weekday);
      case "z":
        return formatOffset(date.offset, false);
      case "Z":
        return date.offset === -420 ? "PDT" : date.offset === -480 ? "PST" : formatOffset(date.offset, false);
      case "s":
        return String(Math.floor(date.date.getTime() / 1000));
      case "F":
        return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
      case "D":
      case "x":
        return `${pad(date.month)}/${pad(date.day)}/${pad(date.year % 100)}`;
      case "T":
      case "X":
        return `${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)}`;
      case "o":
        return ordinal(date.day);
      case "%":
        return "%";
      default:
        return whole;
    }
  });
}

/** The date format used for bylines and archives. */
export const DATE_FORMAT = "%B %-d<sup>%o</sup>, %Y";
