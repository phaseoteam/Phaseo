/** Serialize a value for JavaScript source, including an inline HTML script. */
export function javascriptLiteral(value) {
  return (JSON.stringify(value) ?? "undefined").replace(/[<>\u2028\u2029]/g, character => {
    switch (character) {
      case "<": return "\\u003c";
      case ">": return "\\u003e";
      case "\u2028": return "\\u2028";
      default: return "\\u2029";
    }
  });
}
