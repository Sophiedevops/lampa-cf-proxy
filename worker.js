**
 * Cherry Proxy Lite v5.2 — Медиа-шлюз + API Proxy для Lampa
 */

function isPrivateHostname(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (['localhost', '::1', '0:0:0:0:0:0:0:1'].includes(h) || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const parts = h.split('.');
  if (parts.length === 4) {
    const [a, b] = parts.map(Number);
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return true;
  }
  return false;
}

function rewriteM3u8(text, baseUrl, proxyOrigin, key, referer) {
  const base = new URL(baseUrl);
  function proxify(rawUrl) {
    let abs;
    try { abs = new URL(rawUrl, base).toString(); } catch { return rawUrl; }
    if (abs.startsWith(proxyOrigin)) return rawUrl;
    let p = proxyOrigin + '/proxy?url=' + encodeURIComponent(abs) + '&key=' + encodeURIComponent(key);
    if (referer) p += '&referer=' + encodeURIComponent(referer);
    return p;
  }
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => 'URI="' + proxify(u) + '"');
    return proxify(trimmed);
  }).join('\n');
}

export default {
  async fetch(request, env) {
    // 1. Обработка CORS Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const isPost = request.method === 'POST';
    if (request.method !== 'GET' && request.method !== 'HEAD' && !isPost) {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const referer = url.searchParams.get('referer') || '';

    if (!targetUrl) {
      return new Response('Cherry Proxy Lite v5.2 is active!', { 
        status: 200, headers: { 'Content-Type': 'text/plain' } 
      });
    }

    const secret = env.PROXY_KEY || ''; 
    const userKey = url.searchParams.get('key') || '';
    if (secret && userKey !== secret) {
      return new Response('Forbidden: Invalid Key', { status: 403 });
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedTarget.protocol)) throw new Error();
    } catch { 
      return new Response('Invalid target URL', { status: 400 }); 
    }

    if (isPrivateHostname(parsedTarget.hostname)) {
      return new Response('Target not allowed', { status: 403 });
    }

    const proxyHeaders = new Headers();
    
    // ИСПРАВЛЕНИЕ: Расширенный список разрешенных заголовков для работы API Лампы (CUB, TMDB)
    const allowedClientHeaders = [
      'accept', 'accept-language', 'user-agent', 'range', 'if-range', 
      'content-type', 'token', 'profile', 'authorization', 'x-requested-with'
    ];
    
    for (const [key, value] of request.headers.entries()) {
      if (allowedClientHeaders.includes(key.toLowerCase())) {
        proxyHeaders.set(key, value);
      }
    }
    
    if (!proxyHeaders.has('user-agent')) {
      proxyHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    }
    if (referer) proxyHeaders.set('Referer', referer);

    let upstream;
    try {
      const isSegment = parsedTarget.pathname.match(/\.(ts|m4s)$/i);
      
      upstream = await fetch(parsedTarget.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: isPost ? await request.text() : null,
        redirect: 'follow',
        cf: isSegment ? { cacheEverything: true, cacheTtl: 3600 } : {}
      });
    } catch (err) {
      return new Response('Upstream error: ' + err.message, { status: 502 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    const exposeHeaders = [];
    const headersToPass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'transfer-encoding'];
    
    for (const [key, value] of upstream.headers.entries()) {
      if (headersToPass.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
        exposeHeaders.push(key);
      }
    }
    if (exposeHeaders.length > 0) {
      responseHeaders.set('Access-Control-Expose-Headers', exposeHeaders.join(', '));
    }

    const contentType = upstream.headers.get('Content-Type') || '';
    const isM3u8 = contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || parsedTarget.pathname.toLowerCase().endsWith('.m3u8');

    if (isM3u8 && request.method === 'GET') {
      const text = await upstream.text();
      const proxyOrigin = new URL(request.url).origin;
      const rewritten = rewriteM3u8(text, parsedTarget.toString(), proxyOrigin, env.PROXY_KEY, referer);
      responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      responseHeaders.delete('Content-Length');
      return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
    }

    return new Response(upstream.body, { 
      status: upstream.status, 
      statusText: upstream.statusText,
      headers: responseHeaders 
    });
  },
};