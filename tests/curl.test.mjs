import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCurl} from '../lib/curl.mjs';
const url='https://seller-vn.tiktok.com/oec_ads/shopping/v1/oec/stat/post_campaign_list_v2?aadvid=7639390141899063304&oec_seller_id=7494773876655295231';
const cookie='sessionid=fake-only; csrftoken=fake-csrf';
test('Chrome bash cURL imports cookie, IDs and ignores body dates',()=>{
 const result=parseCurl(`curl '${url}' \\\n -H 'content-type: application/json' \\\n -b '${cookie}' \\\n --data-raw '{"start_time":"2000-01-01"}'`);
 assert.deepEqual(result.connection,{cookie,advertiserId:'7639390141899063304',sellerId:'7494773876655295231'});
 assert.equal(result.requestUrl,url);assert.equal(result.connection.start_time,undefined);
});
test('Chrome cmd cURL supports caret continuation and escaped ampersands',()=>{
 const result=parseCurl(`curl.exe "${url}" ^\r\n -H "Cookie: ${cookie}" ^\r\n --compressed`);
 assert.equal(result.connection.cookie,cookie);
 const escaped=parseCurl(`curl.exe ${url.replaceAll('&','^&')} -b "${cookie}"`);assert.equal(escaped.connection.sellerId,'7494773876655295231');
});
test('PowerShell continuation and header casing are supported',()=>{
 const result=parseCurl(`curl '${url}' \u0060\n --header 'cOoKiE: ${cookie}'`);assert.equal(result.connection.cookie,cookie);
});
test('inline flags and CSRF header fallback are supported',()=>{
 const result=parseCurl(`curl --url='${url}' --cookie='sessionid=fake-only' --header='X-CSRFToken: csrf-value'`);
 assert.equal(result.connection.cookie,'sessionid=fake-only; csrftoken=csrf-value');
});
test('unrelated URLs, compound commands and malformed quotes are rejected',()=>{
 for(const command of [`curl 'https://example.com/?aadvid=7639390141899063304&oec_seller_id=7494773876655295231' -b '${cookie}'`,`curl '${url}' -b '${cookie}' ; whoami`,`curl '${url}' -b '${cookie}' && whoami`,`curl '${url}' -b 'unterminated`,`curl '${url}' --url '${url}' -b '${cookie}'`]) assert.throws(()=>parseCurl(command));
});
test('missing cookies, file cookies, missing CSRF or missing IDs are rejected',()=>{
 for(const command of [`curl '${url}'`,`curl '${url}' -b @cookies.txt`,`curl '${url}' -b 'sessionid=fake'`,`curl '${url.split('?')[0]}' -b '${cookie}'`]) assert.throws(()=>parseCurl(command));
});
test('shell syntax in quoted data is kept inert and never executed',()=>{
 const result=parseCurl(`curl '${url}' -b '${cookie}; other=$(whoami)'`);assert.ok(result.connection.cookie.includes('$(whoami)'));
});
