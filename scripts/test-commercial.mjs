import {readdir}from"node:fs/promises";
import{join}from"node:path";
import{spawn}from"node:child_process";
const files=(await readdir("commercial",{recursive:true})).filter(file=>file.endsWith(".test.ts")).sort().map(file=>join("commercial",file));
if(!files.length)throw new Error("No commercial tests were discovered.");
const child=spawn(process.execPath,["--import","tsx","--test","--test-concurrency=2",...files],{stdio:"inherit",windowsHide:true});
child.once("error",()=>{process.exitCode=1;});child.once("exit",code=>{process.exitCode=code??1;});
