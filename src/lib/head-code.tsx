import React from "react";

/**
 * Admin → Settings → Code & tracking: snippets pasted from Google Search
 * Console, Analytics / Tag Manager, Facebook Pixel and the like, placed in the
 * <head> (or at the top of <body>) of every page.
 *
 * React can't print a raw HTML string into <head>, so the snippet is split into
 * its top-level tags and each one is rendered as a real element: <meta>,
 * <link>, <base>, <script>, <noscript>, <style>. The tags stay in the
 * server-rendered HTML, which is what Search Console's verifier reads. Anything
 * else (stray text, <title>, <div>…) is dropped from <head>; in the body it is
 * kept as plain HTML.
 *
 * Only admins can edit these settings — the code runs on every page by design.
 */

type Parsed = { tag: string; attrs: Record<string, string | true>; inner: string } | { raw: string };

const VOID = new Set(["meta", "link", "base"]);
const PAIRED = new Set(["script", "noscript", "style"]);

// HTML attribute names → the React prop names that print them.
const PROP: Record<string, string> = {
  class: "className", charset: "charSet", crossorigin: "crossOrigin", "http-equiv": "httpEquiv",
  referrerpolicy: "referrerPolicy", nomodule: "noModule", fetchpriority: "fetchPriority",
  hreflang: "hrefLang", imagesizes: "imageSizes", imagesrcset: "imageSrcSet", itemprop: "itemProp",
  tabindex: "tabIndex", for: "htmlFor",
};
const BOOLEAN = new Set(["async", "defer", "nomodule", "disabled"]);

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(src: string): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4];
    out[name] = value === undefined ? true : decode(value);
  }
  return out;
}

export function parseSnippet(html: string): Parsed[] {
  const out: Parsed[] = [];
  let i = 0;
  let text = "";
  const flushText = () => { if (text.trim()) out.push({ raw: text }); text = ""; };
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const open = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(html.slice(i, i + 20000));
    if (!open) { text += html[i]; i++; continue; }
    const tag = open[1].toLowerCase();
    const attrSrc = open[2].replace(/\/\s*$/, "");
    const after = i + open[0].length;
    if (VOID.has(tag)) {
      flushText();
      out.push({ tag, attrs: parseAttrs(attrSrc), inner: "" });
      i = after;
      continue;
    }
    const close = new RegExp(`</${tag}\\s*>`, "i");
    const rest = html.slice(after);
    const cm = close.exec(rest);
    const inner = cm ? rest.slice(0, cm.index) : rest;
    const end = cm ? after + cm.index + cm[0].length : html.length;
    flushText();
    if (PAIRED.has(tag)) out.push({ tag, attrs: parseAttrs(attrSrc), inner });
    else out.push({ raw: html.slice(i, end) });
    i = end;
  }
  flushText();
  return out;
}

function toProps(attrs: Record<string, string | true>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (/^on/.test(name)) continue; // inline event handlers can't be expressed as React props
    const key = PROP[name] || name;
    props[key] = value === true ? (BOOLEAN.has(name) ? true : "") : value;
  }
  return props;
}

function render(nodes: Parsed[], where: "head" | "body", prefix: string): React.ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${prefix}${i}`;
    if ("raw" in n) {
      // Plain markup (e.g. a tracking <img>/<iframe>): fine in the body, invalid in <head>.
      return where === "body" ? <div key={key} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: n.raw }} /> : null;
    }
    const props = toProps(n.attrs);
    if (VOID.has(n.tag)) return React.createElement(n.tag, { key, ...props });
    return React.createElement(n.tag, { key, ...props, dangerouslySetInnerHTML: { __html: n.inner } });
  });
}

export function HeadCode({ html }: { html?: string }) {
  if (!html || !html.trim()) return null;
  return <>{render(parseSnippet(html), "head", "hc")}</>;
}

export function BodyCode({ html }: { html?: string }) {
  if (!html || !html.trim()) return null;
  return <>{render(parseSnippet(html), "body", "bc")}</>;
}
