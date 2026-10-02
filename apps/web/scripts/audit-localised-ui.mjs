import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = (file) => path.relative(webRoot, file).split(path.sep).join('/');
const exceptionPath = path.join(webRoot, 'scripts/localised-ui-exceptions.json');
const exceptions = JSON.parse(fs.readFileSync(exceptionPath, 'utf8'));
const configPath = path.join(webRoot, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, webRoot, undefined, configPath);
const resolverCache = ts.createModuleResolutionCache(webRoot, (value) => value, parsedConfig.options);
const routeNames = /^(page|layout|template|loading|error|global-error|global-not-found|not-found|default)\.[cm]?[jt]sx?$/;
const sources = new Map();
const seeds = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (routeNames.test(entry.name)) seeds.push(file);
  }
}
walk(path.join(webRoot, 'src/app/[locale]'));
for (const name of ['layout.tsx', 'global-error.tsx', 'global-not-found.tsx', 'error.tsx', 'not-found.tsx']) {
  const file = path.join(webRoot, 'src/app', name);
  if (fs.existsSync(file)) seeds.push(file);
}
function follow(file) {
	file = path.resolve(file);
  if (sources.has(file) || !/\.[cm]?[jt]sx?$/.test(file) || /\.(test|stories)\./.test(file) || !file.startsWith(path.join(webRoot, 'src') + path.sep)) return;
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  sources.set(file, source);
  const resolve = (specifier) => {
    const result = ts.resolveModuleName(specifier, file, parsedConfig.options, ts.sys, resolverCache).resolvedModule;
    if (result && !result.isExternalLibraryImport) follow(result.resolvedFileName);
  };
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) resolve(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) resolve(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
seeds.forEach(follow);
// In-memory fixtures exercise the same collector and review policy as real routes.
const fixturePath = path.join(webRoot, 'src/app/[locale]/__audit_fixture__/page.tsx');
if (process.argv.includes('--self-test')) {
  sources.set(fixturePath, ts.createSourceFile(fixturePath, `
    export default function Fixture() {
      toast.error("An untranslated error");
      return <>
        <h1>A new untranslated heading</h1>
        <input placeholder="Enter your name" />
        <button>{ready ? "Ready to continue" : "Please wait"}</button>
        <SettingsPageHeader title="An unreviewed fallback" titleKey="doesNotExist" />
        <span>OpenAI</span><code>example_function()</code>
        <span>{t("translated.heading")}</span>
        <p>OpenAI is available here</p>
      </>;
    }
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
}
const attributes = new Set(['title', 'label', 'description', 'placeholder', 'alt', 'aria-label', 'aria-description', 'emptyMessage', 'helperText', 'caption']);
const candidates = [];
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
function humanText(value) {
  return /\p{L}{2}/u.test(value.replace(/&(?:nbsp|copy|amp|lt|gt|quot|apos);/g, '').replace(/&#\d+;/g, ''));
}
function staticValue(attribute) {
  const value = attribute?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression) ? value.expression.text : null;
}
function keyedFallback(node, source) {
  if (!ts.isJsxAttribute(node)) return false;
  const opening = node.parent.parent;
  if (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening)) return false;
  const element = opening.tagName.getText(source);
  const name = node.name.getText(source);
  const lookup = (key) => opening.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === key);
  let namespace, catalogFile, key;
  if (element === 'SettingsPageHeader' && ['title', 'description'].includes(name)) {
    namespace = 'SettingsUI'; catalogFile = 'settings-ui.json'; key = staticValue(lookup(name + 'Key'));
  } else if (element === 'SensitiveValue' && name === 'label') {
    const labels = { 'sensitive value': 'sensitiveValues.value', 'email address': 'strings.Email', 'new email address': 'strings.New email', 'card number': 'billingCopy.cardNumber', 'card expiry': 'sensitiveValues.cardExpiry' };
    namespace = 'SettingsUI'; catalogFile = 'settings-ui.json'; key = labels[staticValue(node)];
  } else if (relative(source.fileName) === 'src/components/footer.tsx' && element === 'FooterLinkList' && name === 'title') {
    namespace = 'Common.footer'; catalogFile = 'common.json'; key = staticValue(lookup('titleKey'));
    if (key) key = 'footer.' + key;
  }
  if (!key) return false;
  const readKey = (catalog) => key.split('.').reduce((value, part) => value?.[part], catalog);
  for (const locale of ['en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'ja', 'zh-Hans', 'hi', 'ar-SA']) {
    if (typeof readKey(JSON.parse(fs.readFileSync(path.join(webRoot, 'messages', locale, catalogFile), 'utf8'))) !== 'string') return false;
  }
  return namespace;
}
function add(node, source, kind, value, attribute) {
  const text = normalize(value);
  if (!humanText(text)) return;
  let codeContext = false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (kind !== 'jsx-attribute' && ts.isJsxElement(parent) && ['code', 'pre', 'style'].includes(parent.openingElement.tagName.getText(source))) {
      codeContext = true;
      break;
    }
  }
  let faqFallback = false;
  if (relative(source.fileName) === 'src/components/(data)/model/overview/ModelFaqSection.tsx') {
    const parent = node.parent;
    const translated = ts.isConditionalExpression(parent) && parent.whenFalse === node && parent.condition.getText(source) === 'translate'
      ? parent.whenTrue
      : ts.isBinaryExpression(parent) && parent.right === node && parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ? parent.left : null;
    if (translated && ts.isCallExpression(translated) && translated.expression.getText(source) === 'translate' && ts.isStringLiteral(translated.arguments[0])) {
      const key = translated.arguments[0].text;
      faqFallback = ['en-GB', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'ja', 'zh-Hans', 'hi', 'ar-SA'].every((locale) => {
        const catalog = JSON.parse(fs.readFileSync(path.join(webRoot, 'messages', locale, 'catalogue.json'), 'utf8'));
        return typeof key.split('.').reduce((result, part) => result?.[part], catalog.models.detail.faqContent) === 'string';
      });
    }
  }
  const urlExample = kind === 'jsx-attribute' && attribute === 'placeholder' && text.split(/\s+/).every((part) => /^https?:\/\/\S+$/.test(part));
  candidates.push({ file: relative(source.fileName), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, ...(attribute ? { attribute } : {}), text, keyedFallback: keyedFallback(node, source), codeContext, faqFallback, urlExample });
}
function expressionLiterals(expression, source, kind, attribute) {
  if (!expression) return;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) add(expression, source, kind, expression.text, attribute);
  else if (ts.isConditionalExpression(expression)) {
    expressionLiterals(expression.whenTrue, source, kind, attribute);
    expressionLiterals(expression.whenFalse, source, kind, attribute);
  } else if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expression.operatorToken.kind)) {
    expressionLiterals(expression.right, source, kind, attribute);
  }
}
for (const source of sources.values()) {
  // Toast/error setters are scanned only in UI modules, avoiding server diagnostic errors.
  if (!source.fileName.endsWith('.tsx')) continue;
  function visit(node) {
    if (ts.isJsxText(node)) add(node, source, 'jsx-text', node.text);
    else if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) add(node, source, 'jsx-attribute', node.initializer.text, node.name.getText(source));
      else if (node.initializer && ts.isJsxExpression(node.initializer)) expressionLiterals(node.initializer.expression, source, 'jsx-attribute', node.name.getText(source));
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) expressionLiterals(node.expression, source, 'jsx-expression');
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (/^(?:toast(?:\.(?:success|error|warning|info))?|set\w*Error)$/.test(callee)) expressionLiterals(node.arguments[0], source, 'ui-message');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function reviewedException(candidate) {
  for (const group of exceptions) {
    if (!group.reason?.trim()) throw new Error('Every UI copy exception needs a reviewed reason.');
    if (group.files && !group.files.includes(candidate.file)) continue;
    if (group.kinds && !group.kinds.includes(candidate.kind)) continue;
    if (group.attributes && !group.attributes.includes(candidate.attribute)) continue;
    if (group.texts.includes(candidate.text)) return group.reason;
  }
  return null;
}
const findings = candidates.filter((candidate) => !candidate.keyedFallback && !candidate.codeContext && !candidate.faqFallback && !candidate.urlExample && !reviewedException(candidate));
if (process.argv.includes('--self-test')) {
  const actual = findings.filter((candidate) => candidate.file === relative(fixturePath)).map((candidate) => candidate.text).sort();
  const expected = ['An untranslated error', 'A new untranslated heading', 'Enter your name', 'Ready to continue', 'Please wait', 'An unreviewed fallback', 'OpenAI is available here'].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`UI audit regression fixtures failed: ${JSON.stringify(actual)}`);
  console.log('Localised UI audit regression fixtures passed (7 ordinary strings rejected; brands, code and translated calls preserved).');
  process.exit(0);
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ reachableModules: sources.size, checkedLiterals: candidates.length, reviewedLiterals: candidates.length - findings.length, findings }, null, 2));
else {
  console.log(`Localised UI audit: ${sources.size} reachable modules, ${candidates.length} text literals, ${findings.length} unreviewed candidates.`);
  for (const finding of findings) console.log(`${finding.file}:${finding.line} [${finding.kind}${finding.attribute ? ':' + finding.attribute : ''}] ${JSON.stringify(finding.text)}`);
  if (findings.length) console.error('Translate ordinary copy. Add only narrowly reviewed brand, code or technical-value exceptions with an explanation.');
}
process.exitCode = findings.length ? 1 : 0;
