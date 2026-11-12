export async function closeMcpClient(client: {close:()=>Promise<void>}, terminate?:()=>Promise<void>, onFailure?:()=>void) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  if (terminate) await Promise.race([terminate(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error("MCP cleanup timed out.")),2000);})]);
 } catch { onFailure?.(); }
 finally { if(timer!==undefined)clearTimeout(timer);await client.close(); }
}
