import { baseCopy } from './localization-ui.mjs';
import { addMessageCopy } from './localization-messages.mjs';

// Keep one public dictionary and insertion order for longest-fragment substitution.
export const copy = { ...baseCopy };
addMessageCopy(copy);
export function languageFromUrl(url) {
  return new URL(url).searchParams.get('lang') === 'ru' ? 'ru' : 'en';
}
export function languageUrl(url, language) {
  const u = new URL(url);
  if (language === 'ru') u.searchParams.set('lang', 'ru');
  else u.searchParams.delete('lang');
  return u.pathname + u.search + u.hash;
}
export const staticEnglish = text => copy[text] ?? text;
export function translate(text, language) {
  return language === 'ru' ? text : staticEnglish(text);
}
const fragments = Object.keys(copy).sort((a, b) => b.length - a.length);
export function localizeMessage(message, language) {
  if (language === 'ru' || !message) return message;
  let result = String(message);
  for (const source of fragments) result = result.split(source).join(copy[source]);
  return result;
}
export function localizeDocument(doc, language) {
  doc.documentElement.lang = language;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    // HTML line wrapping is invisible to readers but changes the text-node value.
    const key = trimmed.replace(/\s+/g, ' ');
    if (copy[key] && language === 'en') node.nodeValue = raw.replace(trimmed, copy[key]);
  }
  for (const el of doc.querySelectorAll('[title],[aria-label],meta[name="description"]'))
    for (const attr of ['title', 'aria-label', 'content']) {
      const value = el.getAttribute(attr);
      if (value && copy[value] && language === 'en') el.setAttribute(attr, copy[value]);
    }
}
