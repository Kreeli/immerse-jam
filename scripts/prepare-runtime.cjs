const path=require('node:path');
const {ensureRuntime}=require('../desktop/runtime.cjs');
ensureRuntime(path.resolve(__dirname,'../.runtime'),process.argv.includes('--cpu')?'cpu':'cuda',e=>console.log(e.message)).catch(e=>{console.error(e);process.exitCode=1;});
