// Parse copied command text as data. Never invoke a shell or execute cURL.
function tokenize(source) {
  const text = source.replace(/(?:\\|\^|`)\r?\n/g, ' ');
  const tokens = [];
  let word = '', quote = null, started = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) {
        if (quote === "'" && text[i + 1] === "'") { word += "'"; i++; }
        else quote = null;
      } else if (quote === '"' && ['\\','^','`'].includes(char) && ['"','\\','^','`','$'].includes(text[i + 1])) {
        word += text[++i];
      } else word += char;
      continue;
    }
    if (/\s/.test(char)) { if (started) { tokens.push(word); word = ''; started = false; } continue; }
    if (char === '"' || char === "'") { quote = char; started = true; continue; }
    if (['\\','^','`'].includes(char) && i + 1 < text.length) { word += text[++i]; started = true; continue; }
    if (';|<>'.includes(char) || char === '&') throw new Error('Chỉ dán một lệnh Copy as cURL, không kèm lệnh khác.');
    word += char; started = true;
  }
  if (quote) throw new Error('Lệnh cURL thiếu dấu đóng nháy. Hãy sao chép lại đầy đủ.');
  if (started) tokens.push(word);
  return tokens;
}

export function parseCurl(source) {
  if (typeof source !== 'string' || source.length > 200000) throw new Error('Nội dung cURL quá dài hoặc không hợp lệ.');
  const args = tokenize(source.trim());
  if (!/^curl(?:\.exe)?$/i.test(args.shift() || '')) throw new Error('Dán lệnh bắt đầu bằng curl hoặc curl.exe từ Chrome Network.');
  const urls = [], cookies = [], headers = new Map();
  function value(index, inline) {
    const result = inline ?? args[index + 1];
    if (result === undefined) throw new Error('Lệnh cURL thiếu giá trị tùy chọn.');
    return result;
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--next') throw new Error('Chỉ nhập một request cURL mỗi lần.');
    if (arg === '-H' || arg === '--header' || arg.startsWith('--header=') || arg.startsWith('-H') && arg.length > 2) {
      const inline = arg.startsWith('--header=') ? arg.slice(9) : arg.startsWith('-H') && arg.length > 2 ? arg.slice(2) : undefined;
      const header = value(i, inline); if (inline === undefined) i++;
      const separator = header.indexOf(':');
      if (separator > 0) headers.set(header.slice(0, separator).trim().toLowerCase(), header.slice(separator + 1).trim());
    } else if (arg === '-b' || arg === '--cookie' || arg.startsWith('--cookie=') || arg.startsWith('-b') && arg.length > 2) {
      const inline = arg.startsWith('--cookie=') ? arg.slice(9) : arg.startsWith('-b') && arg.length > 2 ? arg.slice(2) : undefined;
      cookies.push(value(i, inline)); if (inline === undefined) i++;
    } else if (arg === '--url' || arg.startsWith('--url=')) {
      const inline = arg.startsWith('--url=') ? arg.slice(6) : undefined;
      urls.push(value(i, inline)); if (inline === undefined) i++;
    } else if (/^https?:\/\//i.test(arg)) urls.push(arg);
    else if (['-X','--request','-d','--data','--data-raw','--data-binary','--data-urlencode','--json','-A','--user-agent','-e','--referer','-o','--output','-c','--cookie-jar','--compressed-ssh'].includes(arg)) i++;
  }
  if (urls.length !== 1) throw new Error('Không tìm thấy đúng một Request URL. Hãy Copy as cURL của request danh sách.');
  let url;
  try { url = new URL(urls[0]); } catch { throw new Error('URL trong cURL không hợp lệ.'); }
  if (url.origin !== 'https://seller-vn.tiktok.com' || url.pathname !== '/oec_ads/shopping/v1/oec/stat/post_campaign_list_v2' || url.username || url.password) throw new Error('Cần cURL của request post_campaign_list_v2 trên seller-vn.tiktok.com.');
  const advertiserId = url.searchParams.get('aadvid'), sellerId = url.searchParams.get('oec_seller_id');
  if (!/^\d{10,25}$/.test(advertiserId || '') || !/^\d{10,25}$/.test(sellerId || '')) throw new Error('Request URL thiếu aadvid hoặc oec_seller_id hợp lệ.');
  if (headers.has('cookie')) cookies.push(headers.get('cookie'));
  let cookie = cookies.join('; ').trim();
  if (!cookie || cookies.some(x=>x.startsWith('@') || !x.includes('='))) throw new Error('cURL thiếu cookie phiên. Không hỗ trợ cookie từ file.');
  if (!cookie.split(';').some(part=>part.trim().startsWith('csrftoken='))) {
    const csrf = headers.get('x-csrftoken');
    if (!csrf || /[;\r\n]/.test(csrf)) throw new Error('cURL thiếu csrftoken và header X-CSRFToken.');
    cookie += `; csrftoken=${csrf}`;
  }
  if (cookie.length > 50000 || /[\r\n]/.test(cookie)) throw new Error('Cookie trong cURL không hợp lệ.');
  return { requestUrl: url.href, connection: { cookie, advertiserId, sellerId } };
}
