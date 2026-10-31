import {NextResponse} from 'next/server';
import {timingSafeEqual,createHash} from 'node:crypto';
import {createSession,getSession,byId,publicState,update,encrypt,hash,log,deleteSession,loginAttempts} from '../../../lib/store.mjs';
import {TikTokApi,validateConnection} from '../../../lib/tiktok.mjs';
import {validateRule,qualifies,vietnamDate} from '../../../lib/rules.mjs';
import {locked,scan,pauseSelected} from '../../../lib/engine.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const reply=(value,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function sessionFor(request){return getSession(request.cookies.get('roi_session')?.value)}
function checkOrigin(request){const expected=process.env.APP_ORIGIN||new URL(request.url).origin;if(request.headers.get('x-roi-request')!=='1'||request.headers.get('origin')!==expected)throw new Error('Yêu cầu không cùng nguồn. Kiểm tra APP_ORIGIN trên server.')}
export async function GET(request,{params}){
 try{const{path}=await params;if(path.join('/')!=='state')return reply({error:'Not found'},404);const session=await sessionFor(request);if(!session)return reply({error:'Cần đăng nhập dashboard.',loginRequired:true},401);return reply(await publicState(session))}
 catch{return reply({error:'Không đọc được dữ liệu. Kiểm tra DATABASE_URL, schema.sql và khóa mã hóa trên server.'},500)}
}
export async function POST(request,{params}){
 try{
  checkOrigin(request);
  const{path}=await params,action=path.join('/');
  if(Number(request.headers.get('content-length')||0)>60000)return reply({error:'Nội dung quá lớn.'},413);
  const raw=await request.text();if(raw.length>60000)return reply({error:'Nội dung quá lớn.'},413);
  const body=JSON.parse(raw||'{}');
  if(action==='login'){
   const password=process.env.DASHBOARD_PASSWORD;
   if(process.env.NODE_ENV==='production'&&!password)return reply({error:'Server chưa cấu hình DASHBOARD_PASSWORD.'},503);
   if(password){
    if(await loginAttempts(hash('dashboard-login'))>20)return reply({error:'Thử đăng nhập quá nhiều. Chờ 1 phút.'},429);
    const digest=value=>createHash('sha256').update(value).digest();
    if(typeof body.password!=='string'||!timingSafeEqual(digest(body.password),digest(password)))return reply({error:'Mật khẩu dashboard không đúng.'},401);
   }
   const existing=await sessionFor(request);if(existing)return reply(await publicState(existing));
   const token=await createSession(),response=reply(await publicState(await getSession(token)));
   response.cookies.set('roi_session',token,{httpOnly:true,secure:(process.env.APP_ORIGIN||'').startsWith('https://'),sameSite:'strict',path:'/',maxAge:60*60*24*90});return response;
  }
  const session=await sessionFor(request);if(!session)return reply({error:'Phiên dashboard hết hạn.',loginRequired:true},401);
  if(action==='automatic'&&body.enabled===false){await update(session.id,{automatic:0,next_run:0});await log(session.id,'info','Đã tắt chế độ tự động.');return reply(await publicState(await byId(session.id)))}
  if(action==='logout'){await locked(session.id,async()=>{await deleteSession(session.id)});const response=reply({ok:true});response.cookies.delete('roi_session');return response}
  let result;
  await locked(session.id,async(current,renew)=>{
   if(action==='connect'){
    const connection=validateConnection(body),snapshot=await new TikTokApi(connection).list();
    await update(current.id,{connection:encrypt(connection),automatic:0,next_run:0,snapshot:null,pending_write:null});
    await log(current.id,'connected',`Đã kiểm tra API trực tiếp · advertiser ${connection.advertiserId} · ${snapshot.rows.length} chiến dịch.`);
    await scan(await byId(current.id));
   }else if(action==='disconnect'){
    await update(current.id,{connection:null,snapshot:null,automatic:0,next_run:0,pending_write:null});await log(current.id,'info','Đã xóa phiên TikTok được lưu.');
   }else if(action==='scan'){await scan(current)}
   else if(action==='rules'){
    const rule=validateRule(body);if(process.env.DATABASE_URL&&rule.intervalMinutes<5)throw new Error('Cấu hình free kiểm tra tối thiểu mỗi 5 phút.');
    await update(current.id,{rule,snapshot:null,automatic:0,next_run:0});await log(current.id,'info','Đã lưu quy tắc. Chế độ tự động được tắt để xem lại điều kiện mới.');
   }else if(action==='pause'){
    if(body.confirm!==true)throw new Error('Cần xác nhận danh sách chiến dịch trước khi tắt.');result=await pauseSelected(current,body.ids,body.planId,renew);
   }else if(action==='automatic'){
    if(body.enabled!==true||body.confirm!==true)throw new Error('Cần xác nhận để bật tự động.');
    const status=await publicState(current);
    if(!status.schedulerConfigured)throw new Error('Chưa cấu hình lịch chạy. Thiết lập CRON_SECRET và GitHub Actions theo DEPLOY_VERCEL.md.');
    if(!current.snapshot||current.snapshot.date!==vietnamDate()||current.snapshot.planId!==body.planId||Date.now()-Date.parse(current.snapshot.fetchedAt)>120000)throw new Error('Đồng bộ và xem lại quy tắc trong vòng 2 phút trước khi bật tự động.');
    await update(current.id,{automatic:1,next_run:Date.now()+current.rule.intervalMinutes*60000});
    await log(current.id,'automatic',`Đã bật tự động mỗi ${current.rule.intervalMinutes} phút · ROI < ${current.rule.threshold} · ${current.snapshot.rows.filter(row=>qualifies(row,current.rule)).length} camp hiện thỏa điều kiện.`);
   }else throw new Error('Thao tác không được hỗ trợ.');
  });
  return reply({...await publicState(await byId(session.id)),result});
 }catch(error){return reply({error:error instanceof SyntaxError?'JSON không hợp lệ.':error.message||'Yêu cầu thất bại.'},400)}
}
