/**
 * Browser / OS / device from a User-Agent, for subscriber breakdowns and
 * campaign targeting. Deliberately small: only what push-capable browsers
 * send; anything else is "Other".
 */
export function parseUA(ua: string) {
  const s = ua || "";
  const browser =
    /EdgA?\//.test(s) ? "Edge"
    : /SamsungBrowser\//.test(s) ? "Samsung Internet"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /UCBrowser\//.test(s) ? "UC Browser"
    : /Firefox\/|FxiOS\//.test(s) ? "Firefox"
    : /CriOS\/|Chrome\//.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari"
    : "Other";
  const os =
    /Android/.test(s) ? "Android"
    : /iPhone|iPad|iPod/.test(s) ? "iOS"
    : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "macOS"
    : /CrOS/.test(s) ? "ChromeOS"
    : /Linux/.test(s) ? "Linux"
    : "Other";
  const device: "mobile" | "tablet" | "desktop" =
    /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? "tablet"
    : /Mobi|iPhone|Android/.test(s) ? "mobile"
    : "desktop";
  return { browser, os, device };
}
