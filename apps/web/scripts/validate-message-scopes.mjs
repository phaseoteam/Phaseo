import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

// Read-only dependency audit. Resolve route-local imports and literal
// translation calls; computed runtime keys still require review.
const root = path.resolve('src');
const cache = new Map();
const lazyScopes = JSON.parse(fs.readFileSync(path.join(root, 'i18n/lazy-message-scopes.json'), 'utf8'));
function fileInfo(file, sourceOverride) {
    if (cache.has(file))
        return cache.get(file);
    const text = sourceOverride ?? fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const first = tree.statements[0];
    const serverAction = first && ts.isExpressionStatement(first)
        && ts.isStringLiteral(first.expression) && first.expression.text === 'use server';
    const client = first && ts.isExpressionStatement(first)
        && ts.isStringLiteral(first.expression) && first.expression.text === 'use client';
    const info = { imports: [], keys: [], namespaces: [], scopes: [], scopeGroups: [], lazyScopes: [], serverAction, client };
    cache.set(file, info);
    function resolve(spec) {
        let bases = [];
        if (spec.startsWith('@/')) {
            const relative = spec.slice(2).replace(/^app\/\((auth|dashboard|legal)\)\//, 'app/[locale]/($1)/');
            bases = [path.join(root, relative), path.join(root, spec.slice(2))];
        }
        else if (spec.startsWith('.'))
            bases = [path.resolve(path.dirname(file), spec)];
        for (const base of bases)
            for (const suffix of ['.tsx', '.ts', '/index.tsx', '/index.ts'])
                if (fs.existsSync(base + suffix))
                    return base + suffix;
    }
    function visit(node) {
        if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'feature'
            && node.initializer && ts.isStringLiteral(node.initializer)
            && node.parent.parent.tagName?.getText(tree) === 'LazyMessages') {
            const scope = lazyScopes[node.initializer.text];
            assert(scope, `Unknown lazy message feature: ${node.initializer.text}`);
            info.lazyScopes.push(...scope);
        }
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useTranslations'
            && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
            info.namespaces.push(node.arguments[0].text);
            if (!(ts.isVariableDeclaration(node.parent) && node.parent.initializer === node))
                info.keys.push(node.arguments[0].text + '.*');
        }
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)) {
            const p = resolve(node.moduleSpecifier.text);
            if (p)
                info.imports.push(p);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
            const p = resolve(node.arguments[0].text);
            if (p)
                info.imports.push(p);
        }
        function addScopeGroup(elements) {
            const group = [...elements].filter(ts.isStringLiteral).map(e => e.text);
            info.scopes.push(...group);
            info.scopeGroups.push(group);
        }
        if (ts.isCallExpression(node) && ['createScopedMessagesLayout', 'createScopedMessagesTemplate'].includes(node.expression.getText(tree)))
            addScopeGroup(node.arguments[0]?.elements ?? []);
        if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'namespaces' && node.initializer && ts.isJsxExpression(node.initializer) && ts.isArrayLiteralExpression(node.initializer.expression))
            addScopeGroup(node.initializer.expression.elements);
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useTranslations') {
            const arg = node.initializer.arguments[0];
            const namespace = arg && ts.isStringLiteral(arg) ? arg.text : '';
            const name = node.name.getText(tree);
            let scope = node.parent;
            while (scope.parent && !ts.isFunctionLike(scope) && scope !== tree)
                scope = scope.parent;
            function calls(n) {
                if (ts.isCallExpression(n) && (n.expression.getText(tree) === name || ['rich', 'has', 'raw', 'markup'].some(method => n.expression.getText(tree) === name + '.' + method))) {
                    function addKey(key) {
                        if (!key) { info.keys.push(namespace ? namespace + '.*' : '*'); return; }
                        if (ts.isAsExpression(key) || ts.isParenthesizedExpression(key)) addKey(key.expression);
                        else if (ts.isConditionalExpression(key)) {
                            addKey(key.whenTrue);
                            addKey(key.whenFalse);
                        } else if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) {
                            info.keys.push([namespace, key.text].filter(Boolean).join('.'));
                        } else if (ts.isTemplateExpression(key)) {
                            info.keys.push(key.head.text.endsWith('.')
                                ? [namespace, key.head.text.slice(0, -1)].filter(Boolean).join('.') + '.*'
                                : namespace ? namespace + '.*' : '*');
                        } else if (ts.isBinaryExpression(key) && key.operatorToken.kind === ts.SyntaxKind.PlusToken
                            && ts.isStringLiteral(key.left) && key.left.text.endsWith('.')) {
                            info.keys.push([namespace, key.left.text.replace(/\.$/, '')].filter(Boolean).join('.') + '.*');
                        } else info.keys.push(namespace ? namespace + '.*' : '*');
                    }
                    addKey(n.arguments[0]);
                }
                // Passing a translator to a helper/prop requires its namespace;
                // static calls alone cannot describe what the helper will use.
                if (ts.isIdentifier(n) && n.text === name
                    && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
                    && !(ts.isCallExpression(n.parent) && n.parent.expression === n)
                    && !(ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n)) {
                    info.keys.push(namespace ? namespace + '.*' : '*');
                }
                ts.forEachChild(n, calls);
            }
            calls(scope);
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return info;
}

if (process.argv.includes('--self-test')) {
    const fixture = fileInfo('scope-audit-fixture.tsx', `
        function CopyButton() {
            const t = useTranslations("Feature.copyButton");
            t(copied ? "copied" : "copy");
            return t.has(("status." + value) as never);
        }
    `);
    assert.deepEqual(fixture.namespaces, ['Feature.copyButton']);
    assert.deepEqual(fixture.keys.sort(), ['Feature.copyButton.copied', 'Feature.copyButton.copy', 'Feature.copyButton.status.*']);
    console.log('Message scope audit self-test passed.');
    process.exit(0);
}
function graph(entries) {
    const visited = new Set();
    const contexts = [];
    function walk(file, inherited = [], inheritedClient = false) {
        const info = fileInfo(file);
        const client = inheritedClient || info.client;
        const scopes = [...new Set([...inherited, ...info.lazyScopes])].sort();
        const identity = file + JSON.stringify(scopes) + client;
        if (visited.has(identity)) return;
        visited.add(identity);
        contexts.push({ file, scopes, client });
        // Server actions do not pull their dependencies into the client tree.
        if (!info.serverAction) for (const dependency of info.imports) walk(dependency, scopes, client);
    }
    entries.forEach(file => walk(file));
    return contexts;
}

function list(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? list(file) : [file];
    });
}
const shell = [...fs.readFileSync(path.join(root, "i18n/message-scopes.ts"), "utf8").match(/SHELL_MESSAGE_NAMESPACES = \[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
const routes = list(path.join(root, 'app/[locale]')).filter(f => f.endsWith('/page.tsx') || f.endsWith('\\page.tsx'));
const problems = [];
const clientScopes = {};
const dynamicClientFiles = new Set();
function covers(scope, key) { return scope === key || key.startsWith(scope + '.'); }
for (const page of routes) {
    const entries = [page];
    let dir = path.dirname(page);
    while (dir.startsWith(path.join(root, 'app/[locale]'))) {
        for (const n of ['layout.tsx', 'template.tsx'])
            if (fs.existsSync(path.join(dir, n)))
                entries.push(path.join(dir, n));
        dir = path.dirname(dir);
    }
    const scopes = [...shell, ...entries.flatMap(f => fileInfo(f).scopes)];
    const contexts = graph(entries);
    // A boundary serves every child route. Union their client requirements,
    // then intersect them with that boundary's explicitly allowed namespaces.
    // Server-only translations never enter this generated client selection.
    for (const group of entries.flatMap(f => fileInfo(f).scopeGroups)) {
        const signature = JSON.stringify([...group].sort());
        const required = clientScopes[signature] ??= new Set();
        for (const context of contexts.filter(c => c.client)) {
            for (const key of fileInfo(context.file).keys) {
                if (key === '*' && !context.scopes.length) dynamicClientFiles.add(path.relative(root, context.file));
                // An optional subtree owns its dynamic translation allowlist;
                // its unknown helper keys must not inflate the page boundary.
                if (context.scopes.length && (key === '*' || key === '.*')) continue;
                const prefix = key.replace(/\.\*$/, '');
                if (context.scopes.some(scope => covers(scope, prefix))) continue;
                for (const allowed of group) {
                    if (key === '*' || prefix === '.*') required.add(allowed);
                    else if (covers(allowed, prefix)) required.add(prefix);
                    else if (covers(prefix, allowed)) required.add(allowed);
                }
            }
        }
    }
    const missing = [];
    for (const { file: f, scopes: optionalScopes } of contexts) {
        const availableScopes = [...scopes, ...optionalScopes];
        for (const namespace of fileInfo(f).namespaces) {
            if (!availableScopes.some(scope => namespace === scope || namespace.startsWith(scope + '.') || scope.startsWith(namespace + '.'))) {
                missing.push({ file: path.relative(root, f), key: namespace });
            }
        }
        for (const key of fileInfo(f).keys)
            if (key !== '*' && key !== '.*' && !availableScopes.some(s => covers(s, key.replace(/\.\*$/, '')) || covers(key.replace(/\.\*$/, ''), s)))
                missing.push({ file: path.relative(root, f), key });
    }
    if (missing.length)
        problems.push({ route: path.relative(root, page), missing: [...new Map(missing.map(e => [e.key, e])).values()] });
}
if (problems.length) {
    console.error(JSON.stringify(problems, null, 2));
    process.exitCode = 1;
}
else {
    console.log(`Message scopes cover static translation calls across ${routes.length} localized pages.`);
    if (process.argv.includes('--explain-client-scopes')) console.log('Unbounded client translation helpers:', [...dynamicClientFiles]);
    const output = JSON.stringify(Object.fromEntries(Object.entries(clientScopes).sort(([a], [b]) => a.localeCompare(b))
        .map(([signature, paths]) => [signature, [...paths].sort().filter(p => ![...paths].some(parent => parent !== p && covers(parent, p)))])), null, 2) + '\n';
    const destination = path.join(root, 'i18n/generated-client-scopes.json');
    if (process.argv.includes('--write-client-scopes')) {
        fs.writeFileSync(destination, output);
        console.log(`Generated ${Object.keys(clientScopes).length} client message scopes.`);
    }
    if (process.argv.includes('--check-client-scopes')) {
        assert.equal(fs.readFileSync(destination, 'utf8').replaceAll('\r\n', '\n'), output,
            'Client message scopes are stale. Run node scripts/validate-message-scopes.mjs --write-client-scopes');
    }
}
