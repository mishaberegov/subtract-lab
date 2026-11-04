// Compare source structure without depending on Prettier's punctuation spacing.
// Quoted literals are kept intact so checks can still distinguish UI strings.
export function compactSource(source) {
  return source
    .split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g)
    .map((part, index) =>
      index % 2 ? part : part.replace(/\s*([{}()[\],.;:?=+*<>!&|/-])\s*/g, '$1')
    )
    .join('');
}

// Render helpers may live in app.mjs or in the separately extracted renderer.
export function uiSource(app, renderer = '') {
  return compactSource(app + '\n' + renderer);
}

// Layout assertions compare CSS tokens, not a formatter's whitespace choices.
export function compactCss(source) {
  return source
    .replace(/\s*([{}():;,])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
