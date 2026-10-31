const readline = require('node:readline');
const fs = require('node:fs');
const pending=new Map();
const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line);if(request.id===undefined)return;
 if(!request.method){const call=pending.get(request.id);if(!call)return;pending.delete(request.id);fs.appendFileSync(process.argv[2],JSON.stringify({...call.params,elicitation:request.result})+"\n");send(call.id,{content:[{type:"text",text:"Owned elicitation result"}]});return;}
 let result;
 if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'owned-phaseo-mcp',version:'1'}};
 else if(request.method==='tools/list')result={tools:[{name:'owned_lookup',description:'Read owned audit notes',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}}]};
 else if(request.method==='tools/call'&&process.argv[3]==='elicit'){const id='owned-elicitation';pending.set(id,request);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,method:'elicitation/create',params:{mode:'form',message:'Choose owned notes',requestedSchema:{type:'object',properties:{topic:{type:'string',enum:['work','personal']},count:{type:'integer',minimum:1,maximum:5}},required:['topic','count']}}})+'\n');return;}
 else if(request.method==='tools/call'){fs.appendFileSync(process.argv[2],JSON.stringify(request.params)+'\n');result={content:[{type:'text',text:'Owned MCP result'}]};}
 else result={};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
});
