import {randomBytes} from 'node:crypto';
import {TikTokApi} from './tiktok.mjs';
import {qualifies,vietnamDate} from './rules.mjs';
import {acquire,renew,release,byId,decrypt,update,log} from './store.mjs';

export async function locked(id,action){
 const lease=await acquire(id);
 try{
  let session=await byId(id);
  if(session.pending_write){
   await update(id,{automatic:0,next_run:0});
   await log(id,'error',`Lượt trước bị gián đoạn ở camp ${session.pending_write}. Đã dừng tự động; Đồng bộ và kiểm tra trước khi bật lại.`);
   session=await byId(id);
  }
  return await action(session,()=>renew(id,lease));
 }finally{await release(id,lease)}
}
export async function scan(session,deadline=Date.now()+220000){
 if(!session.connection)throw new Error('Kết nối tài khoản TikTok trước.');
 const snapshot={...await new TikTokApi(decrypt(session.connection),fetch,{deadline}).list(),planId:randomBytes(16).toString('hex')};
 await update(session.id,{snapshot,pending_write:null});
 return snapshot;
}
export async function pauseSelected(session,ids,planId,renewLease,automatic=false,deadline=Date.now()+220000){
 const snapshot=session.snapshot;
 if(!snapshot||snapshot.planId!==planId||snapshot.date!==vietnamDate()||Date.now()-Date.parse(snapshot.fetchedAt)>120000)throw new Error('Bản xem trước đã hết hạn (2 phút). Đồng bộ và xem trước lại.');
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw new Error('Danh sách chiến dịch không hợp lệ (tối đa 100/lượt).');
 const candidates=new Set(snapshot.rows.filter(row=>qualifies(row,session.rule)).map(row=>row.id));
 if(ids.some(id=>!candidates.has(id)))throw new Error('Có chiến dịch nằm ngoài bản xem trước hoặc quy tắc hiện tại.');
 const api=new TikTokApi(decrypt(session.connection),fetch,{deadline}),results=[];
 await update(session.id,{snapshot:{...snapshot,planId:null}});
 let remaining=0;
 try{
  for(let index=0;index<ids.length;index++){
   if(Date.now()>deadline-90000){remaining=ids.length-index;await log(session.id,'info',`Đã hết ngân sách thời gian của lượt chạy. Còn ${remaining} camp; lượt sau đọc lại dữ liệu mới.`);if(automatic)await update(session.id,{next_run:Date.now()+60000});break;}
   await renewLease();
   const current=await byId(session.id);
   if(automatic&&!current.automatic){await log(session.id,'info','Đã dừng tự động trước camp tiếp theo.');break;}
   if(JSON.stringify(current.rule)!==JSON.stringify(session.rule)||current.connection!==session.connection)throw new Error('Cấu hình đã thay đổi; dừng lượt xử lý.');
   const id=ids[index];
   // Persist intent before contacting TikTok. A killed function will never silently retry.
   await update(session.id,{pending_write:id});
   const result=await api.pause(id,session.rule,snapshot.date);
   await update(session.id,{pending_write:null});
   results.push(result);
   await log(session.id,result.paused?'paused':'skipped',result.paused?`Đã xác minh tắt ${result.name} (${id}) · ROI ${result.roi} · chi phí ${result.spend}đ.`:`Bỏ qua ${result.name}: ${result.reason}`);
  }
 }catch(error){await update(session.id,{automatic:0,next_run:0,snapshot:null});await log(session.id,'error',error.message);return{results,error:error.message};}
 try{await scan(await byId(session.id),deadline)}catch(error){await update(session.id,{snapshot:null,automatic:0,next_run:0});await log(session.id,'error',error.message);return{results,error:error.message};}
 return{results,remaining};
}
export async function automaticCycle(id,deadline=Date.now()+220000){
 return locked(id,async(session,renewLease)=>{
  if(!session.automatic||!session.connection||session.next_run>Date.now())return;
  await update(id,{next_run:Date.now()+session.rule.intervalMinutes*60000});
  try{
   const snapshot=await scan(session,deadline),candidates=snapshot.rows.filter(row=>qualifies(row,session.rule));
   await log(id,'check',`Kiểm tra tự động: ${candidates.length}/${snapshot.rows.length} camp thỏa điều kiện, ngày ${snapshot.date}.`);
   if(candidates.length)await pauseSelected(await byId(id),candidates.slice(0,100).map(row=>row.id),snapshot.planId,renewLease,true,deadline);
  }catch(error){await update(id,{automatic:0,next_run:0,snapshot:null});await log(id,'error',error.message)}
 });
}
