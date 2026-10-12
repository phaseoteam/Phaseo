using System;
using System.Diagnostics;
using System.Threading.Tasks;
public static class OwnedClaudeRelay {
 private static void Forward(System.IO.Stream input,System.IO.Stream output){var buffer=new byte[4096];int count;while((count=input.Read(buffer,0,buffer.Length))>0){output.Write(buffer,0,count);output.Flush();}}
 public static int Main(string[] args) {
  var executable=Environment.GetEnvironmentVariable("PHASEO_OWNED_CLAUDE_NODE"); var script=Environment.GetEnvironmentVariable("PHASEO_OWNED_CLAUDE_SCRIPT"); if(String.IsNullOrEmpty(executable)||String.IsNullOrEmpty(script))return 2;
  var info=new ProcessStartInfo(executable,"\""+script+"\"");info.UseShellExecute=false;info.CreateNoWindow=true;info.RedirectStandardInput=true;info.RedirectStandardOutput=true;info.RedirectStandardError=true;info.WorkingDirectory=Environment.CurrentDirectory;info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"]="1";info.EnvironmentVariables["PHASEO_OWNED_CLAUDE_RELAY_PID"]=Process.GetCurrentProcess().Id.ToString();
  using(var child=Process.Start(info)) {
   Task.Run(()=>{try{var input=Console.OpenStandardInput();var buffer=new byte[4096];int count;while((count=input.Read(buffer,0,buffer.Length))>0){child.StandardInput.BaseStream.Write(buffer,0,count);child.StandardInput.BaseStream.Flush();}child.StandardInput.Close();}catch{}});
   var output=Task.Run(()=>Forward(child.StandardOutput.BaseStream,Console.OpenStandardOutput()));var error=Task.Run(()=>Forward(child.StandardError.BaseStream,Console.OpenStandardError()));child.WaitForExit();Task.WaitAll(output,error);return child.ExitCode;
  }
 }
}
