import './env.mjs';
import {runTick} from '../lib/cron.mjs';
let stopped=false;
process.on('SIGTERM',()=>{stopped=true});process.on('SIGINT',()=>{stopped=true});
console.log('Local scheduler started. Vercel uses /api/cron instead.');
while(!stopped){try{await runTick()}catch(error){console.error('Scheduler:',error.message)}if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000))}
