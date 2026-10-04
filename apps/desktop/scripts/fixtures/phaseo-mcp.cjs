const readline = require('node:readline');
const fs = require('node:fs');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);if(request.id===undefined)return;
 let result;
 if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-phaseo-mcp',version:'1'}};
 else if(request.method==='tools/list')result={tools:[{name:'owned_lookup',description:'Read owned audit notes',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}}]};
 else if(request.method==='tools/call'){fs.appendFileSync(process.argv[2],JSON.stringify(request.params)+'\n');result={content:[{type:'text',text:'Owned MCP result'}]};}
 else result={};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});
