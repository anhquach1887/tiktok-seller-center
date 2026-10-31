// Neon's documented SQL-over-HTTP protocol; no persistent TCP connection.
// https://github.com/neondatabase/neon/blob/main/proxy/README.md#sql-over-http
export function createNeonQuery(connectionString, fetcher=fetch) {
  let parsed;
  try { parsed=new URL(connectionString); } catch { throw new Error('DATABASE_URL không hợp lệ.'); }
  if (!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.password || !/^[a-z0-9.-]+\.neon\.tech$/i.test(parsed.hostname)) throw new Error('DATABASE_URL cần là connection string của Neon Postgres.');
  // Match neonConfig.fetchEndpoint in the official serverless driver. Compute
  // hosts accept Postgres traffic; HTTP SQL goes to the regional api host.
  const host=parsed.hostname.replace(/^[^.]+\./,'api.');
  return async function query(sql,params=[]) {
    let response;
    try {
      response=await fetcher(`https://${host}/sql`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Neon-Connection-String':connectionString,'Neon-Raw-Text-Output':'true','Neon-Array-Mode':'false'},body:JSON.stringify({query:sql,params:params.map(value=>value===null?null:String(value))}),signal:AbortSignal.timeout(15000),cache:'no-store'});
    } catch(error) {
      const code=error?.cause?.code||error?.code;
      const safeCode=['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)?` (${code})`:error?.name==='TimeoutError'?' (timeout)':'';
      throw new Error(`Không kết nối được Neon database${safeCode}. Kiểm tra mạng và trạng thái project Neon.`);
    }
    if(!response.ok) {
      const detail=await response.json().catch(()=>null);
      const messages={'42P01':'Thiếu bảng database. Chạy schema.sql trong Neon SQL Editor.', '28P01':'Mật khẩu database không đúng hoặc đã được thay đổi.', '3D000':'Database được chỉ định không tồn tại.', '53300':'Database đã đạt giới hạn kết nối.'};
      throw new Error(messages[detail?.code]||`Neon database từ chối truy vấn (HTTP ${response.status}). Kiểm tra DATABASE_URL và schema.sql.`);
    }
    let result;try{result=await response.json()}catch{throw new Error('Phản hồi Neon database không hợp lệ.')}
    if(result.error || !Array.isArray(result.rows))throw new Error('Neon database báo lỗi. Kiểm tra schema.sql và quyền database.');
    return result;
  };
}
