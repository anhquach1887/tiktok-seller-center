import {NextResponse} from 'next/server';
import {authorizedCron,runTick} from '../../../lib/cron.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request){
 if(!authorizedCron(request.headers.get('authorization')))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')return NextResponse.json({error:'Scheduler chỉ chạy trên Production.'},{status:409});
 try{const result=await runTick();return NextResponse.json(result,{status:result.ok?200:500,headers:{'Cache-Control':'no-store'}})}
 catch{return NextResponse.json({error:'Scheduler thất bại. Kiểm tra database và Function Logs.'},{status:500})}
}
