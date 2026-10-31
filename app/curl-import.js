'use client';
import {useState} from 'react';
import {parseCurl} from '../lib/curl.mjs';
import './curl-import.css';

export default function CurlImport({onImport,disabled}) {
  const [source,setSource]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(false);
  function importCommand(){
    setError('');setSuccess(false);
    try {
      const result=parseCurl(source);
      onImport(result);
      setSource(''); // Do not retain another copy of the session cookie.
      setSuccess(true);
    }catch(error){setError(error.message)}
  }
  return <section className="curl-import">
    <label htmlFor="curl-source">Nhập nhanh bằng cURL
      <small>F12 → Network → post_campaign_list_v2 → chuột phải → Copy → Copy as cURL (bash hoặc cmd).</small>
    </label>
    <textarea id="curl-source" rows={5} value={source} disabled={disabled} onChange={e=>{setSource(e.target.value);setError('');setSuccess(false)}} autoComplete="off" spellCheck={false} placeholder={'curl \'https://seller-vn.tiktok.com/oec_ads/…\' \\\n  -b \'csrftoken=…; sessionid=…\''}/>
    <div className="curl-import-actions"><small>Tự điền cookie và hai ID. Không thực thi lệnh cURL.</small><button type="button" className="secondary" disabled={disabled||!source.trim()} onClick={importCommand}>Lấy thông tin từ cURL</button></div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {success&&<div className="alert success" role="status">Đã điền cookie và thông tin tài khoản bên dưới. Bấm “Kiểm tra & kết nối” để tiếp tục.</div>}
  </section>;
}
