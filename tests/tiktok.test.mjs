import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokApi,LIST_PATH,STATUS_PATH} from '../lib/tiktok.mjs';
import {DEFAULT_RULE,vietnamDate} from '../lib/rules.mjs';
const connection={cookie:'csrftoken=test-only; sessionid=test-only',advertiserId:'7639390141899063304',sellerId:'7494773876655295231'};
const cells=(id='1880294716548322',roi='4.80',status='0')=>Object.entries({campaign_id:id,campaign_name:'Test campaign',campaign_opt_status:status,stats_total_cost:'53658',onsite_roi2_total_cost_shopping:roi}).map(([name,data])=>({name,data}));
const listData=(table=[cells()],pagination={page:1,page_count:1,total_count:1})=>({code:0,data:{pagination,table_v2:table}});
const response=data=>({ok:true,status:200,json:async()=>data});
test('direct list call uses expected endpoint, CSRF, account scope, and VN date',async()=>{
 const api=new TikTokApi(connection,async(url,options)=>{assert.equal(url.origin,'https://seller-vn.tiktok.com');assert.equal(url.pathname,LIST_PATH);assert.equal(url.searchParams.get('aadvid'),connection.advertiserId);assert.equal(options.headers['X-CSRFToken'],'test-only');assert.equal(options.headers.Cookie,connection.cookie);const body=JSON.parse(options.body);assert.equal(body.start_time,'2026-10-31');assert.equal(body.end_time,body.start_time);return response(listData())});
 const result=await api.list('2026-10-31');assert.equal(result.rows[0].roi,4.8);
});
test('pagination reads all pages and rejects duplicates or missing rows',async()=>{
 let call=0;const api=new TikTokApi(connection,async()=>response(listData([cells(String(++call))],{page:call,page_count:2,total_count:2})));
 assert.equal((await api.list()).rows.length,2);
 const duplicate=new TikTokApi(connection,async()=>response(listData([cells()],{page:1,page_count:2,total_count:2})));await assert.rejects(()=>duplicate.list(),/trùng/);
 const missing=new TikTokApi(connection,async()=>response(listData([],{page:1,page_count:1,total_count:1})));await assert.rejects(()=>missing.list(),/đủ/);
});
test('pause revalidates ROI, sends operation 2 once, and verifies disabled status',async()=>{
 let writes=0,reads=0;
 const api=new TikTokApi(connection,async(url,options)=>{if(url.pathname===STATUS_PATH){writes++;assert.deepEqual(JSON.parse(options.body),{campaign_list:['1880294716548322'],operation:2});return response({code:0,data:{}})}reads++;return response(listData([cells(undefined,'4.80',writes?'1':'0')]))});
 const result=await api.pause('1880294716548322',DEFAULT_RULE,vietnamDate());assert.equal(result.paused,true);assert.equal(writes,1);assert.equal(reads,2);
});
test('pause skips when ROI reaches threshold before write',async()=>{
 let writes=0;const api=new TikTokApi(connection,async(url)=>{if(url.pathname===STATUS_PATH)writes++;return response(listData([cells(undefined,'5.00')]))});
 assert.equal((await api.pause('1880294716548322',DEFAULT_RULE,vietnamDate())).skipped,true);assert.equal(writes,0);
});
test('expired preview date cannot send a request',async()=>{
 let calls=0;const api=new TikTokApi(connection,async()=>{calls++;return response(listData())});await assert.rejects(()=>api.pause('1',DEFAULT_RULE,'2000-01-01'),/Ngày/);assert.equal(calls,0);
});
test('network failure during a write is not retried',async()=>{
 let writes=0;const api=new TikTokApi(connection,async(url)=>{if(url.pathname===STATUS_PATH){writes++;throw new Error('network')}return response(listData())});
 await assert.rejects(()=>api.pause('1880294716548322',DEFAULT_RULE,vietnamDate()),/không tự gửi lại/);assert.equal(writes,1);
});
test('auth errors are rejected without returning credentials',async()=>{
 const api=new TikTokApi(connection,async()=>response({code:401,msg:connection.cookie}));await assert.rejects(()=>api.list(),error=>error.message.includes('401')&&!error.message.includes('sessionid'));
});
