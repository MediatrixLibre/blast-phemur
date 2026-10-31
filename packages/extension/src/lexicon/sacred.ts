/**
 * The sacred names: never spelled out in the app, and never switched off by
 * a word list. Its own module so the scanner and the caption censor can both
 * use it without importing each other.
 */

export const SACRED_NAME =
  /^(?:j[eé3*]+s[uú*]+s|chr[iy*]+st\w*|ch[*]+st|mary|maria|joseph|jos[eé]|lord|gods?|saints?|holy|virgin|virgen|dios|madre|moses)$/i;

/** Is this word (or any word of a phrase) a sacred name? */
export function isSacredName(word: string): boolean {
  return (word.match(/[A-Za-z*éÉ]+/g) ?? []).some((w) => SACRED_NAME.test(w));
}
