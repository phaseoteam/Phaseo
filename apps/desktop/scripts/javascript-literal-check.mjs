import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { javascriptLiteral } from "./javascript-literal.mjs";

export const literalCases = [
  undefined, null, true, false, 0, -1, 1.25,
  "C:\\owned & path\\quote'\".js", "Résumé 😀", "\0\t\r\n",
  "\u2028\u2029", "</script><script>window.injected=true</script>",
  { nested: ["<tag>", "\\u003c", "\u2028", null], quote: "'\"" },
];

export function checkLiterals() {
  for (const value of literalCases) {
    const source = javascriptLiteral(value);
    assert.equal(/[<>\u2028\u2029]/.test(source), false);
    // JSON comparison avoids cross-realm object prototype differences.
    assert.equal(JSON.stringify(runInNewContext(`(${source})`)), JSON.stringify(value));
  }
  assert.throws(() => javascriptLiteral(1n), TypeError);
  const circular = {}; circular.self = circular;
  assert.throws(() => javascriptLiteral(circular), TypeError);
}

checkLiterals();
console.log("JAVASCRIPT_LITERAL_CHECK", JSON.stringify({ cases: literalCases.length, invalidCases: 2 }));
