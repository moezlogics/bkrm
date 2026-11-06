"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { X, Download, Share2, Copy, Check, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  priceLabel: string;
  previousPriceLabel?: string | null;
  imageUrl: string;
  url: string;
  condition?: string | null;
  /** Headline specs for the chip row: "2021", "45,000 km"… */
  highlights?: string[];
  city?: string | null;
  siteName: string;
  isShop?: boolean;
  sellerName?: string | null;
}

export function StoryCardModal({
  open,
  onClose,
  title,
  priceLabel,
  previousPriceLabel,
  imageUrl,
  url,
  condition,
  highlights = [],
  city,
  siteName,
  isShop,
  sellerName,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const drawCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setGenerating(true);

    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    // 1. Background: Deep rich slate gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#0b0f19");
    bgGrad.addColorStop(0.5, "#111827");
    bgGrad.addColorStop(1, "#090d16");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Decorative radial glow behind phone
    const glow = ctx.createRadialGradient(W / 2, 780, 50, W / 2, 780, 600);
    glow.addColorStop(0, "rgba(59, 130, 246, 0.22)");
    glow.addColorStop(0.6, "rgba(99, 102, 241, 0.08)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 200, W, 1200);

    // Subtle outer border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // 2. Top Header Brand Pill
    const brandText = siteName.toUpperCase();
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const brandWidth = ctx.measureText(brandText).width;
    const pillW = Math.max(340, brandWidth + 90);
    const pillX = (W - pillW) / 2;
    const pillY = 90;

    // Pill background
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, 72, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pulse dot
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(pillX + 38, pillY + 36, 9, 0, Math.PI * 2);
    ctx.fill();

    // Brand name text
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(brandText, pillX + 62, pillY + 37);

    // 3. Product Image Card in center
    const imgBoxX = 100;
    const imgBoxY = 220;
    const imgBoxW = 880;
    const imgBoxH = 820;

    // Image box backdrop
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.beginPath();
    ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 32);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Load and draw image
    try {
      const img = new (window.Image as any)();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = imageUrl;
      });

      // Fit inside box preserving aspect ratio
      const padding = 50;
      const maxW = imgBoxW - padding * 2;
      const maxH = imgBoxH - padding * 2;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const drawX = imgBoxX + (imgBoxW - drawW) / 2;
      const drawY = imgBoxY + (imgBoxH - drawH) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imgBoxX + 16, imgBoxY + 16, imgBoxW - 32, imgBoxH - 32, 24);
      ctx.clip();
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    } catch {
      // Fallback text if image fails to load via CORS
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, W / 2, imgBoxY + imgBoxH / 2);
    }

    // 4. Product Title & Price Section
    const contentY = 1100;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Title (wrapped if too long)
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const words = title.split(" ");
    let line = "";
    let curY = contentY;
    for (const w of words) {
      const test = line + w + " ";
      if (ctx.measureText(test).width > 880 && line !== "") {
        ctx.fillText(line.trim(), 100, curY);
        line = w + " ";
        curY += 68;
        if (curY > contentY + 70) break; // cap to 2 lines
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line.trim(), 100, curY);

    // Price section
    const priceY = curY + 95;
    ctx.font = "900 84px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#38bdf8"; // vivid sky blue
    ctx.fillText(priceLabel, 100, priceY);

    // Previous price strikethrough if dropped
    if (previousPriceLabel) {
      const mainPriceW = ctx.measureText(priceLabel).width;
      const prevX = 100 + mainPriceW + 36;
      ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(previousPriceLabel, prevX, priceY - 6);
      const prevW = ctx.measureText(previousPriceLabel).width;

      // Strikethrough line
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(prevX - 4, priceY - 20);
      ctx.lineTo(prevX + prevW + 4, priceY - 20);
      ctx.stroke();
    }

    // 5. Spec chips (condition, headline specs, city)
    const chipsY = priceY + 50;
    const chips: string[] = [];
    if (condition) chips.push(condition.toUpperCase());
    for (const h of highlights.slice(0, 2)) chips.push(h.toUpperCase());
    if (city) chips.push(city.toUpperCase());

    let chipX = 100;
    ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, sans-serif";
    for (const c of chips.slice(0, 3)) {
      const tw = ctx.measureText(c).width;
      const cw = tw + 44;
      const ch = 56;

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.roundRect(chipX, chipsY, cw, ch, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(c, chipX + 22, chipsY + 40);
      chipX += cw + 18;
    }

    // 6. Bottom Box: Seller info + QR Code
    const bottomBoxY = 1530;
    const bottomBoxH = 270;
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(100, bottomBoxY, 880, bottomBoxH, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Seller identity
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("LISTED BY", 150, bottomBoxY + 70);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, sans-serif";
    const seller = (sellerName || "Verified Seller").slice(0, 18);
    ctx.fillText(seller, 150, bottomBoxY + 125);

    // Seller type badge
    const badgeText = isShop ? "🏬 VERIFIED MOBILE SHOP" : "🛡️ VERIFIED DIRECT OWNER";
    ctx.fillStyle = isShop ? "#f59e0b" : "#38bdf8";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(badgeText, 150, bottomBoxY + 175);

    ctx.fillStyle = "#64748b";
    ctx.font = "normal 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Scan QR to view & contact seller", 150, bottomBoxY + 220);

    // Generate and draw QR Code
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 1,
        color: { dark: "#000000ff", light: "#ffffffff" },
      });
      const qrImg = new (window.Image as any)();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject();
        qrImg.src = qrDataUrl;
      });

      const qrX = 730;
      const qrY = bottomBoxY + 35;
      const qrSize = 200;

      // QR white frame
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 16);
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch {
      // QR fallback
    }

    setGenerating(false);
  }, [imageUrl, title, priceLabel, previousPriceLabel, condition, highlights.join("|"), city, siteName, isShop, sellerName, url]);

  useEffect(() => {
    if (open) {
      setTimeout(() => { drawCard(); }, 150);
    }
  }, [open, drawCard]);

  const downloadCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 35);
    const link = document.createElement("a");
    link.download = `${safeTitle}-story.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Story card downloaded!");
  };

  const copyListingLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Listing link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const shareToWhatsApp = () => {
    const text = `Salam! Check out this ${title} for ${priceLabel} on ${siteName}: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-primary/20 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-white">Status / Story Flyer</span>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Card Preview scroll container */}
        <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-950/60">
          <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-xl overflow-hidden shadow-2xl border border-slate-800">
            {generating && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-2 z-10">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
                <span className="text-xs text-slate-400">Generating Card...</span>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex flex-col gap-2.5">
          <button
            onClick={downloadCard}
            disabled={generating}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>Download High-Res Card (PNG)</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={shareToWhatsApp}
              className="h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>WhatsApp Status</span>
            </button>
            <button
              onClick={copyListingLink}
              className="h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied!" : "Copy Link"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
