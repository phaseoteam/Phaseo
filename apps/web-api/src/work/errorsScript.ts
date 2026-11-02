// The browser capture script served at GET /api/_web/work/errors.js. Dependency-free ES2017 (no
// optional chaining or nullish coalescing), kept small: it is written compactly by hand and its
// size is checked in errorsScript.test.ts.
//
// Usage:
//   <script src="https://phaseo.app/api/_web/work/errors.js" data-key="pwe_..." data-release="1.2.3"
//     data-environment="production"></script>
//   window.PhaseoErrors.capture(error, { any: "extra" })
//   window.PhaseoErrors.init({ key, release, environment, endpoint }) // when loaded without data-key
//
// It hooks window "error" and "unhandledrejection", parses Chrome, Firefox and Safari stacks into
// frames, drops repeats of the same error within 10 s, batches up to 10 events every 2 s, sends them
// with navigator.sendBeacon (or fetch with keepalive), and stops after 50 events per page. Bodies go
// as text/plain so browsers send them without a CORS preflight; the ingest parses them as JSON. The
// page URL is sent without its query string or hash.

export const ERRORS_SCRIPT_CACHE_SECONDS = 3600;

export const ERRORS_SCRIPT = `(function(w){"use strict";
if(!w||w.PhaseoErrors)return;
var d=w.document,s=d&&d.currentScript,ds=(s&&s.dataset)||{},src=(s&&s.src)||"";
var c={key:ds.key,release:ds.release,environment:ds.environment,
endpoint:ds.endpoint||(src?src.replace(/\\/errors\\.js(?:[?#].*)?$/,"/errors/"):"https://phaseo.app/api/_web/work/errors/")};
var q=[],sent=0,seen={},timer=0,MAX=50,BATCH=10;
var V8=/^\\s*at (?:(.+?) \\()?(.+?):(\\d+):(\\d+)\\)?\\s*$/,AT=/^\\s*(.*?)@(.+?):(\\d+)(?::(\\d+))?\\s*$/;
function cut(v,n){v=v==null?"":String(v);return v.length>n?v.slice(0,n):v}
function frames(st){var out=[],l=cut(st,10000).split("\\n");
for(var i=0;i<l.length&&out.length<30;i++){var m=V8.exec(l[i])||AT.exec(l[i]);
if(m)out.push({"function":m[1]||undefined,file:m[2],line:+m[3],column:m[4]?+m[4]:undefined})}return out}
function page(){try{return location.origin+location.pathname}catch(e){return undefined}}
function build(err,extra){var e=err;
if(!(e instanceof Error)&&!(e&&typeof e==="object"&&"message" in e)){e={name:"Error",message:typeof e==="string"?e:safe(e)}}
var st=typeof e.stack==="string"?e.stack:"";
var ev={type:cut(e.name||(e.constructor&&e.constructor.name)||"Error",200),message:cut(e.message,2000),
stack:st?cut(st,10000):undefined,frames:frames(st),release:c.release,environment:c.environment,url:page(),
userAgent:cut(navigator.userAgent,500),timestamp:new Date().toISOString()};
if(extra&&typeof extra==="object")ev.extra=extra;return ev}
function safe(v){try{return cut(JSON.stringify(v),2000)}catch(x){return cut(v,2000)}}
function send(){timer=0;if(!q.length||!c.key)return;var b=JSON.stringify({events:q.splice(0,BATCH)}),u=c.endpoint+encodeURIComponent(c.key);
try{if(navigator.sendBeacon&&navigator.sendBeacon(u,new Blob([b],{type:"text/plain"})))return}catch(x){}
try{fetch(u,{method:"POST",body:b,keepalive:true,mode:"cors",credentials:"omit",headers:{"content-type":"text/plain"}}).catch(function(){})}catch(x){}}
function later(){if(q.length>=BATCH)send();else if(!timer)timer=setTimeout(send,2000)}
function capture(err,extra){try{if(sent>=MAX)return;var ev=build(err,extra),f=ev.frames[0],
k=ev.type+"|"+ev.message+"|"+(f?f.file+":"+f.line:""),now=Date.now();
if(seen[k]&&now-seen[k]<10000)return;seen[k]=now;sent++;q.push(ev);later()}catch(x){}}
w.addEventListener("error",function(e){if(!e)return;var err=e.error;
if(!err){if(!e.message||e.message==="Script error."||e.message==="Script error")return;
err={name:"Error",message:e.message,stack:e.filename?"@"+e.filename+":"+(e.lineno||0)+":"+(e.colno||0):""}}
capture(err)});
w.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;
capture(r instanceof Error?r:{name:"UnhandledRejection",message:typeof r==="string"?r:safe(r)})});
function flush(){if(q.length)send()}
w.addEventListener("pagehide",flush);
if(d)d.addEventListener("visibilitychange",function(){if(d.visibilityState==="hidden")flush()});
w.PhaseoErrors={capture:capture,flush:flush,init:function(o){o=o||{};for(var k in o)if(o[k]!=null)c[k]=o[k];later()}};
})(typeof window!=="undefined"?window:undefined);
`;

/** A rough minified size: comments are already absent, so drop newlines and surrounding spaces. */
export function roughMinifiedSize(source: string): number {
	return new TextEncoder().encode(source.replace(/\n\s*/g, "")).length;
}
