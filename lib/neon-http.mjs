// Neon's documented SQL-over-HTTP protocol; no persistent TCP connection.
// https://github.com/neondatabase/neon/blob/main/proxy/README.md#sql-over-http
export function createNeonQuery(connectionString, fetcher=fetch) {
  let parsed;
  try { parsed=new URL(connectionString); } catch { throw new Error('DATABASE_URL không hợp lệ.'); }
  if (!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.password || !/^[a-z0-9.-]+\.neon\.tech$/i.test(parsed.hostname)) throw new Error('DATABASE_URL cần là connection string của Neon Postgres.');
  const host=parsed.hostname.replace('-pooler.','.');
  return async function query(sql,params=[]) {
    let response;
    try {
      response=await fetcher(`https://${host}/sql`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Neon-Connection-String':connectionString,'Neon-Raw-Text-Output':'true','Neon-Array-Mode':'false'},body:JSON.stringify({query:sql,params:params.map(value=>value===null?null:String(value))}),signal:AbortSignal.timeout(15000),cache:'no-store'});
    } catch { throw new Error('Không kết nối được Neon database.'); }
    if(!response.ok) throw new Error(`Neon database từ chối truy vấn (HTTP ${response.status}). Kiểm tra DATABASE_URL và chạy schema.sql trước.`);
    let result;try{result=await response.json()}catch{throw new Error('Phản hồi Neon database không hợp lệ.')}
    if(result.error || !Array.isArray(result.rows))throw new Error('Neon database báo lỗi. Kiểm tra schema.sql và quyền database.');
    return result;
  };
}
