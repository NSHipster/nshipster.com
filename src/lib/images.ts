import type { ImageMetadata } from "astro";
import croathLiu from "../../assets/images/croath-liu.jpg";
import delisaMason from "../../assets/images/delisa-mason.jpg";
import emLazerWalker from "../../assets/images/em-lazer-walker.jpg";
import jackFlintermann from "../../assets/images/jack-flintermann.jpg";
import jemmons from "../../assets/images/jemmons.jpg";
import jordanMorgan from "../../assets/images/jordan-morgan.jpg";
import mattMassicotte from "../../assets/images/matt-massicotte.jpg";
import mattt from "../../assets/images/mattt.jpg";
import natashaMurashev from "../../assets/images/natasha-murashev.jpg";
import nateCook from "../../assets/images/nate-cook.jpg";
import redaLemeden from "../../assets/images/reda-lemeden.jpg";
import zoeSmith from "../../assets/images/zoe-smith.jpg";

/**
 * Author portraits, keyed by the `image` in each author's front matter.
 * Astro processes and publishes only the images imported here,
 * so an author with a new portrait needs an entry.
 */
export const portraits: Readonly<Record<string, ImageMetadata>> = {
  "croath-liu.jpg": croathLiu,
  "delisa-mason.jpg": delisaMason,
  "em-lazer-walker.jpg": emLazerWalker,
  "jack-flintermann.jpg": jackFlintermann,
  "jemmons.jpg": jemmons,
  "jordan-morgan.jpg": jordanMorgan,
  "matt-massicotte.jpg": mattMassicotte,
  "mattt.jpg": mattt,
  "natasha-murashev.jpg": natashaMurashev,
  "nate-cook.jpg": nateCook,
  "reda-lemeden.jpg": redaLemeden,
  "zoe-smith.jpg": zoeSmith,
};

/** Returns an author portrait for use with Astro's image components. */
export function portrait(name: string): ImageMetadata {
  const image = portraits[name];
  if (!image) throw new Error(`Missing author portrait "${name}"; import it in src/lib/images.ts`);
  return image;
}
