import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { build } from "vite";

// Render the source components in an owned window, without app state, accounts or native page tools.
const scratch = mkdtempSync(path.join(tmpdir(), "phaseo-action-icons-"));
app.setPath("userData", path.join(scratch, "profile"));
const root = path.resolve(import.meta.dirname, "..");
const names = ["pin", "unpin", "archive", "restore", "edit", "pencil", "link", "unlink", "camera", "up", "down", "publish", "folder", "addFolder", "mail", "signIn", "schedule", "inbox", "thread", "usage", "issue", "complete", "notPlanned", "draftPullRequest", "closePullRequest", "comment", "open", "approve", "requestChanges", "retry", "sidebarLeft", "sidebarRight", "back", "forward", "play", "filter", "account", "activity", "bot", "browser", "bug", "clone", "code", "compare", "editor", "files", "fileSearch", "history", "keyboard", "limits", "moon", "newChat", "pause", "sun", "system", "textSearch", "undo"];
const fixedParts = { archive: [1], restore: [1], camera: [0], publish: [1], folder: [0], addFolder: [2], mail: [1], signIn: [2], schedule: [1, 2, 3, 4, 5], inbox: [1], thread: [0], usage: [0], issue: [0], complete: [0], notPlanned: [0], draftPullRequest: [0, 1, 4], closePullRequest: [0, 1, 4, 5], requestChanges: [0, 2], sidebarLeft: [0, 1, 2], sidebarRight: [0, 1, 2], account: [1], bot: [1, 2, 3], browser: [0, 2], bug: [0, 1, 3, 4, 5, 6, 7, 8, 10], clone: [0, 1, 2], compare: [0], editor: [2], files: [2], fileSearch: [0, 1, 3], history: [0, 1], keyboard: [8], limits: [1], newChat: [0], sun: [0], system: [1, 2], textSearch: [0, 1, 2, 4] };
const importPath = relative => JSON.stringify(path.join(root, relative).replaceAll("\\", "/"));
writeFileSync(path.join(scratch, "entry.tsx"), `
import React from ${importPath("node_modules/react/index.js")};
import { createRoot } from ${importPath("node_modules/react-dom/client.js")};
import { ActionIcon } from ${importPath("src/renderer/components/ActionIcon.tsx")};
import { IconSwap } from ${importPath("src/renderer/components/IconSwap.tsx")};
function Samples() {
 const [linked, setLinked] = React.useState(false);
 const [wrapped, setWrapped] = React.useState(false);
 return <><div className="samples">{${JSON.stringify(names)}.map(name => <button id={name} key={name}><ActionIcon name={name}/>{name}</button>)}</div>
 <button id="wrap" aria-pressed={wrapped} onClick={()=>setWrapped(value=>!value)}><ActionIcon name="wrap" data-wrapped={wrapped}/>Word wrap</button>
 <button id="swap" onClick={()=>setLinked(value=>!value)}><IconSwap show={linked?'link':'unlink'}>{{link:<ActionIcon name="link"/>,unlink:<ActionIcon name="unlink"/>}}</IconSwap>Aspect lock</button></>;
}
createRoot(document.getElementById('root')).render(<Samples/>);
`);
try {
	console.log("Action icon fixture: building source components");
	await build({ configFile: false, root, logLevel: "warn", define: { "process.env.NODE_ENV": '"production"' }, resolve: { alias: { react: path.join(root, "node_modules/react") } }, build: { outDir: path.join(scratch, "bundle"), emptyOutDir: true, lib: { entry: path.join(scratch, "entry.tsx"), formats: ["iife"], name: "IconFixture", fileName: () => "icons.js" } } });
} catch (error) { console.error(error); app.exit(1); }
const source = readFileSync(path.join(root, "src/renderer/index.css"), "utf8");
const start = source.indexOf("/* State changes crossfade");
const end = source.indexOf("/* Settings", start);
assert(start > 0 && end > start, "Product gesture CSS is missing");
writeFileSync(path.join(scratch, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>
${source.slice(start, end)}
body{font:14px system-ui;background:#161616;color:#eee;margin:24px}.samples{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}button{display:flex;align-items:center;gap:8px;padding:12px;background:transparent;color:inherit;border:1px solid #555;border-radius:6px}svg{width:18px;height:18px}
</style></head><body><div id="root"></div><script src="bundle/icons.js"></script></body></html>`);
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9);
const deadline = setTimeout(() => { console.error("Action icon fixture deadline"); app.exit(1); }, 150_000);
deadline.unref();
app.whenReady().then(async () => { try {
	const window = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { backgroundThrottling: false } });
	window.webContents.on("console-message", details => { if (details.level === "error") console.error("Fixture renderer:", details.message); });
	await window.loadFile(path.join(scratch, "index.html"));
	console.log("Action icon fixture: page loaded");
	const run = code => window.webContents.executeJavaScript(code);
	await run(`new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.querySelector('#mail svg')){observer.disconnect();resolve();}});observer.observe(document,{subtree:true,childList:true});if(document.querySelector('#mail svg')){observer.disconnect();resolve();}})`);
	window.webContents.debugger.attach("1.3");
	const cdp = (method, params = {}) => window.webContents.debugger.sendCommand(method, params);
	await cdp("DOM.enable"); await cdp("CSS.enable");
	const force = async (name, pseudo) => {
		if (["back", "forward", "play", "filter"].includes(name)) {
			if (pseudo === "hover") {
				const point = await run(`(()=>{const box=document.getElementById('${name}').getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`);
				await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
			} else if (pseudo === "focus-visible") {
				await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
				await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
				await run(`document.getElementById('${name}').focus({preventScroll:true});true`);
			} else {
				await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
				await run(`document.getElementById('${name}').blur();true`);
			}
			return;
		}
		const { root: document } = await cdp("DOM.getDocument"); const { nodeId } = await cdp("DOM.querySelector", { nodeId: document.nodeId, selector: `#${name}` }); await cdp("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo ? [pseudo] : [] });
	};
	const media = reduce => cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
	const samples = {}, gestures = {};
	for (const name of names) {
		const navigation = name === "back" || name === "forward";
		const hoverOnly = name === "play" || name === "filter";
		const held = navigation || hoverOnly;
		if (hoverOnly) console.log("Action icon fixture: held hover", name);
		const offsets = name === "filter" ? [0, 1, -1] : name === "play" ? [1] : name === "back" ? [-1.5, -1.5] : [1.5, 1.5];
		const state = () => run(`(()=>{const button=document.getElementById('${name}'),svg=button.querySelector('svg');return {box:button.getBoundingClientRect().toJSON(),svgTransform:getComputedStyle(svg).transform,animations:svg.getAnimations({subtree:true}).map(a=>({name:a.animationName??a.transitionProperty,iterations:a.effect.getTiming().iterations})),parts:Array.from(svg.children).map(p=>{const style=getComputedStyle(p);return {transform:style.transform,translate:style.translate,x:new DOMMatrixReadOnly(style.transform).m41+(parseFloat(style.translate)||0),scale:style.scale,dash:style.strokeDashoffset,opacity:style.opacity};}),lengths:Array.from(svg.children).map(p=>p.getAttribute('pathLength'))};})()`);
		await media(false);
		const idle = await state();
		assert.equal(idle.animations.length, 0, `${name} moves at rest`);
		assert(idle.lengths.every(value => value === "1"), `${name} has an unnormalised stroke`);
		for (const trigger of hoverOnly ? ["hover"] : ["hover", "focus-visible", "highlight", "selected"]) {
			await force(name, trigger.includes("-") || trigger === "hover" ? trigger : null);
			if (trigger === "highlight") await run(`document.getElementById('${name}').setAttribute('data-highlighted','')`);
			if (trigger === "selected") await run(`document.getElementById('${name}').setAttribute('data-selected','true')`);
			const active = await state();
			if (!held) assert(active.animations.length > 0, `${name} has no ${trigger} gesture`);
			assert(active.animations.every(value => value.iterations === 1));
			if (held) await run(`Promise.all(document.getElementById('${name}').querySelector('svg').getAnimations({subtree:true}).map(animation=>animation.finished)).then(()=>true)`);
			else await run(`document.getElementById('${name}').querySelector('svg').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Number(a.effect.getTiming().duration)/2+Number(a.effect.getTiming().delay);});true`);
			const middle = await state();
			assert.deepEqual(middle.box, idle.box, `${name} moves its control`);
			assert.equal(middle.svgTransform, "none", `${name} moves its whole glyph`);
			assert.notDeepEqual(middle.parts, idle.parts, `${name} has no visible gesture`);
			if (held) {
				assert((await state()).parts.every((part, index) => Math.abs(part.x - offsets[index]) < 0.001), `${name} does not hold its ${trigger} position`);
			}
			for (const index of fixedParts[name] ?? []) assert.deepEqual(middle.parts[index], idle.parts[index], `${name} moves its frame`);
			gestures[name] = active.animations.map(value => value.name);
			await force(name, null);
			await run(`document.getElementById('${name}').removeAttribute('data-highlighted');document.getElementById('${name}').removeAttribute('data-selected');true`);
			if (held) {
				await run(`Promise.all(document.getElementById('${name}').querySelector('svg').getAnimations({subtree:true}).map(animation=>animation.finished)).then(()=>true)`);
				const rested = await state();
				assert(rested.parts.every(part => Math.abs(part.x) < 0.001), `${name} does not return to rest after ${trigger}: ${JSON.stringify(rested.parts)}`);
			}
		}
		await force(name, "hover");
		for (const attribute of ["disabled", "aria-disabled"]) {
			await run(`document.getElementById('${name}').setAttribute('${attribute}','true')`);
			assert.equal((await state()).animations.length, 0, `${name} animates while ${attribute}`);
			await run(`document.getElementById('${name}').removeAttribute('${attribute}')`);
		}
		for (const reduced of [false, true]) {
			await media(reduced);
			await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
			const quiet = await state();
			assert.equal(quiet.animations.length, 0, `${name} ignores motion preference`);
			assert.deepEqual(quiet.parts, idle.parts, `${name} retains its animated pose`);
		}
		await media(false); await run("document.documentElement.dataset.animations='on'"); await force(name, null);
		samples[name] = await run(`document.getElementById('${name}').querySelector('svg').outerHTML`);
	}
	console.log("Action icon fixture: word-wrap states");
	const wrapPose = () => run(`(async()=>{const svg=document.querySelector('#wrap svg');await Promise.all(svg.getAnimations({subtree:true}).map(animation=>animation.finished));return {wrapped:svg.dataset.wrapped,parts:Array.from(svg.children).map(part=>{const style=getComputedStyle(part);return {scale:style.scale,opacity:style.opacity,translate:style.translate};})};})()`);
	const straight = await wrapPose();
	assert.equal(straight.wrapped, "false"); assert.equal(straight.parts[3].opacity, "0");
	for (const preference of ["normal", "reduced", "off"]) {
		await media(preference === "reduced");
		await run(`document.documentElement.dataset.animations='${preference === "off" ? "off" : "on"}';document.getElementById('wrap').click();true`);
		const wrapped = await wrapPose();
		assert.equal(wrapped.wrapped, "true"); assert.equal(wrapped.parts[3].opacity, "1");
		assert(Math.abs(parseFloat(wrapped.parts[1].scale) - 0.5) < 0.001);
		assert(Math.abs(parseFloat(wrapped.parts[2].scale) - 1 / 3) < 0.001);
		await run("document.getElementById('wrap').click();true");
		assert.deepEqual(await wrapPose(), straight, `Word wrap does not reverse with ${preference} motion`);
	}
	await media(false); await run("document.documentElement.dataset.animations='on'");
	samples.wrap = await run("document.querySelector('#wrap svg').outerHTML");
	const sidebarCentres = [];
	for (const name of ["sidebarLeft", "sidebarRight"]) {
		for (const open of [true, false]) {
			const centres = await run(`(()=>{const svg=document.querySelector('#${name} svg');svg.dataset.open='${open}';svg.getAnimations({subtree:true}).forEach(animation=>animation.finish());const frame=svg.children[0].getBoundingClientRect(),divider=svg.children[2].getBoundingClientRect(),arrow=svg.querySelector('[data-panel-chevron]').getBoundingClientRect();return {arrowX:arrow.x+arrow.width/2,areaX:('${name}'==='sidebarLeft'?divider.x+frame.right:frame.x+divider.x)/2,arrowY:arrow.y+arrow.height/2,areaY:frame.y+frame.height/2};})()`);
			assert(Math.abs(centres.arrowX - centres.areaX) < 0.01, `${name} (${open ? "open" : "closed"}) chevron is off centre: ${JSON.stringify(centres)}`);
			assert(Math.abs(centres.arrowY - centres.areaY) < 0.01, `${name} chevron is not vertically centred`);
			sidebarCentres.push({ name, open, ...centres });
		}
		await run(`(()=>{const svg=document.querySelector('#${name} svg');svg.dataset.open='false';svg.getAnimations({subtree:true}).forEach(animation=>animation.finish());})()`);
		assert.equal(await run(`getComputedStyle(document.querySelector('#${name} [data-panel-chevron]')).scale`), "-1 1");
		await force(name, "hover");
		const offset = await run(`(()=>{const svg=document.querySelector('#${name} svg');svg.getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=162;});return parseFloat(getComputedStyle(svg.querySelector('[data-panel-chevron]')).translate);})()`);
		assert(name === "sidebarLeft" ? offset > 0 : offset < 0, `${name} points away from the panel it opens`);
		for (const reduced of [false, true]) {
			await media(reduced);
			await run(`document.documentElement.dataset.animations='${reduced ? "on" : "off"}'`);
			assert.equal(await run(`document.querySelector('#${name} svg').getAnimations({subtree:true}).length`), 0);
			assert.equal(await run(`getComputedStyle(document.querySelector('#${name} [data-panel-chevron]')).transitionDuration`), "0s");
		}
		await media(false); await run("document.documentElement.dataset.animations='on'"); await force(name, null);
	}
	await run("document.getElementById('swap').click();true");
	assert.equal(await run("document.querySelector('#swap [data-on]').dataset.iconGesture"), "link");
	await run("document.getElementById('swap').click();true");
	assert.equal(await run("document.querySelector('#swap [data-on]').dataset.iconGesture"), "unlink");
	if (output) writeFileSync(output, JSON.stringify({ samples, gestures }, null, 2));
	console.log("ACTION_ICONS_SMOKE", JSON.stringify({ variants: names.length, triggers: 4, finite: true, stationaryFrames: true, stationaryControls: true, disabled: true, motionPreferences: true, stateSwap: true, sidebarCentres }));
	window.webContents.debugger.detach(); window.destroy(); clearTimeout(deadline); app.exit(0);
} catch (error) { console.error(error); app.exit(1); } });
