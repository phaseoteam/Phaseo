import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Read-only dependency audit. Resolve route-local imports and literal
// translation calls; computed runtime keys still require review.
const root = path.resolve('src');
const cache = new Map();
function fileInfo(file) {
    if (cache.has(file))
        return cache.get(file);
    const text = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const first = tree.statements[0];
    const serverAction = first && ts.isExpressionStatement(first)
        && ts.isStringLiteral(first.expression) && first.expression.text === 'use server';
    const info = { imports: [], keys: [], scopes: [], serverAction };
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
        if (ts.isCallExpression(node) && ['createScopedMessagesLayout', 'createScopedMessagesTemplate'].includes(node.expression.getText(tree)))
            for (const e of node.arguments[0]?.elements ?? [])
                if (ts.isStringLiteral(e))
                    info.scopes.push(e.text);
        if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'namespaces' && node.initializer && ts.isJsxExpression(node.initializer) && ts.isArrayLiteralExpression(node.initializer.expression))
            for (const e of node.initializer.expression.elements)
                if (ts.isStringLiteral(e))
                    info.scopes.push(e.text);
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useTranslations') {
            const arg = node.initializer.arguments[0];
            const namespace = arg && ts.isStringLiteral(arg) ? arg.text : '';
            const name = node.name.getText(tree);
            let scope = node.parent;
            while (scope.parent && !ts.isFunctionLike(scope) && scope !== tree)
                scope = scope.parent;
            function calls(n) {
                if (ts.isCallExpression(n) && (n.expression.getText(tree) === name || n.expression.getText(tree) === name + '.rich' || n.expression.getText(tree) === name + '.has' || n.expression.getText(tree) === name + '.raw')) {
                    let key = n.arguments[0];
                    if (key && ts.isAsExpression(key))
                        key = key.expression;
                    if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)))
                        info.keys.push([namespace, key.text].filter(Boolean).join('.'));
                    else if (key && ts.isTemplateExpression(key))
                        info.keys.push([namespace, key.head.text.replace(/\.$/, '')].filter(Boolean).join('.') + '.*');
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
function graph(entries) {
    const visited = new Set();
    function walk(file) {
        if (visited.has(file)) return;
        visited.add(file);
        const info = fileInfo(file);
        // Server actions do not pull their dependencies into the client tree.
        if (!info.serverAction) for (const dependency of info.imports) walk(dependency);
    }
    entries.forEach(walk);
    return [...visited];
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
    const missing = [];
    for (const f of graph(entries))
        for (const key of fileInfo(f).keys)
            if (!scopes.some(s => key === s || key.startsWith(s + '.')))
                missing.push({ file: path.relative(root, f), key });
    if (missing.length)
        problems.push({ route: path.relative(root, page), missing: [...new Map(missing.map(e => [e.key, e])).values()] });
}
if (problems.length) {
    console.error(JSON.stringify(problems, null, 2));
    process.exitCode = 1;
}
else {
    console.log(`Message scopes cover static translation calls across ${routes.length} localized pages.`);
}
