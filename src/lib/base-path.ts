/**
 * The site can live under a sub-URL of a domain it shares with another site
 * (example.com/cars, with the main site at the root). Next adds the
 * base path to <Link>, router.push, redirect() and its own files — but not to
 * plain fetch("/api/..."), window.location or <a href="/...">, which would
 * otherwise reach the main site.
 *
 *   withBasePath("/ads/x")   → "/cars/ads/x"  (unchanged without a base path)
 *   BASE_PATH_SHIM           → inline script (root layout) that does the same for
 *                              every same-site fetch / XHR / sendBeacon, before
 *                              any app code runs.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBasePath(u: string): string {
  if (!BASE_PATH || !u || !u.startsWith("/") || u.startsWith("//")) return u;
  if (u === BASE_PATH || u.startsWith(`${BASE_PATH}/`) || u.startsWith(`${BASE_PATH}?`)) return u;
  return `${BASE_PATH}${u}`;
}

export const BASE_PATH_SHIM = BASE_PATH
  ? `(function(){var B=${JSON.stringify(BASE_PATH)};
function fix(u){if(typeof u!=="string"||u.charAt(0)!=="/"||u.charAt(1)==="/")return u;if(u===B||u.indexOf(B+"/")===0||u.indexOf(B+"?")===0)return u;return B+u;}
function fixUrl(x){try{var u=new URL(x,location.href);if(u.origin!==location.origin)return null;var p=fix(u.pathname);return p===u.pathname?null:p+u.search+u.hash;}catch(e){return null;}}
var f=window.fetch;if(f){window.fetch=function(i,o){try{if(typeof i==="string")i=fix(i);else if(i instanceof URL){var a=fixUrl(i.href);if(a)i=a;}else if(typeof Request!=="undefined"&&i instanceof Request){var b=fixUrl(i.url);if(b)i=new Request(b,i);}}catch(e){}return f.call(this,i,o);};}
var X=window.XMLHttpRequest&&XMLHttpRequest.prototype.open;if(X){XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string")arguments[1]=fix(u);return X.apply(this,arguments);};}
if(navigator.sendBeacon){var S=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return S(typeof u==="string"?fix(u):u,d);};}
})();`
  : "";
