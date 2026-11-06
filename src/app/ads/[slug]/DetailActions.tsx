"use client";

import React, { useState, useEffect } from "react";
import { askForPush } from "@/lib/push-client";
import { createPortal } from "react-dom";
import { MessageSquare, Loader2, Phone, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { chat as chatApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";
import { waLink, normalizePkNumber } from "@/lib/whatsapp";
import { loginUrl, useResumeIntent, type Intent } from "@/lib/auth-intent";
import { withBasePath } from "@/lib/base-path";
import { trackContact } from "@/lib/track";

interface Props {
  adId: string;
  sellerId: string;
  price: number | null;
  priceLabel: string;
  title: string;
  slug: string;
  loggedIn: boolean;
  whatsapp?: string | null;
  phone?: string | null;
  inline?: boolean;
  siteName?: string;
  /** A bookable ad (qasai, hissa…): the phone dock's main button books it. */
  booking?: { href: string; cta: string } | null;
}

export const WaIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`fill-current ${className}`} aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a12.06 12.06 0 005.71 1.447h.006c6.585 0 11.946-5.335 11.949-11.896 0-3.176-1.24-6.165-3.487-8.411" />
  </svg>
);

export function DetailActions({ adId, sellerId, price, priceLabel, title, slug, loggedIn, whatsapp, phone, inline = false, siteName, booking = null }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [chatLoading, setChatLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSeller = session?.user?.id === sellerId;
  const callNum = normalizePkNumber(phone) || normalizePkNumber(whatsapp);

  // Remember the action so it resumes automatically after login.
  const gate = (intent: Intent) => { router.push(loginUrl(`/ads/${slug}`, intent)); };

  /**
   * `auto` = resumed straight after login. A window.open() then isn't tied to a
   * user gesture and gets popup-blocked, so navigate in the same tab instead.
   */
  const openWhatsApp = (auto = false) => {
    if (!loggedIn) return gate("whatsapp");
    const url = typeof window !== "undefined" ? `${window.location.origin}${withBasePath(`/ads/${slug}`)}` : "";
    const link = waLink(whatsapp || phone, { title, id: adId, url, price: price != null ? priceLabel : undefined, siteName });
    if (!link) { toast.error("No WhatsApp number available"); return; }
    if (!isSeller) trackContact(adId, "whatsapp");
    if (auto) window.location.href = link;
    else window.open(link, "_blank", "noopener");
  };

  const callSeller = () => {
    if (!loggedIn) return gate("call");
    if (!callNum) return;
    if (!isSeller) trackContact(adId, "call");
    window.location.href = `tel:+${callNum}`;
  };

  const startChat = async () => {
    if (!loggedIn || !session) return gate("chat");
    if (isSeller) { toast.error("You can't chat on your own listing"); return; }
    setChatLoading(true);
    try {
      const res = await chatApi.createThread(adId);
      if (res.success) { trackContact(adId, "chat"); askForPush("chat"); router.push(`/chat?threadId=${res.data._id}`); }
      else toast.error("Couldn't start the chat");
    } catch (e: any) { toast.error(e.message || "Chat failed"); } finally { setChatLoading(false); }
  };

  useResumeIntent(
    {
      whatsapp: () => openWhatsApp(true),
      call: callSeller,
      chat: startChat,
    },
    // Wait for the session to hydrate, otherwise the handler re-gates to /login.
    loggedIn && !!session
  );

  // If inline rendering (e.g. inside Seller Card above specs)
  if (inline) {
    return (
      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <button
          onClick={() => openWhatsApp()}
          className="flex-1 flex items-center justify-center gap-2.5 btn-whatsapp py-2.5 px-4 rounded-md text-sm font-semibold tracking-wide transition-all shadow-sm"
        >
          <WaIcon className="h-4.5 w-4.5" />
          <span>Chat on WhatsApp</span>
        </button>

        <div className="flex gap-2 flex-1">
          {(loggedIn ? callNum : true) && (
            <button
              onClick={callSeller}
              className="flex-1 flex items-center justify-center gap-2 btn-call py-2.5 px-3 rounded-md text-xs sm:text-sm font-semibold tracking-wide transition-all"
            >
              <Phone className="h-4 w-4" />
              <span>Call Seller</span>
            </button>
          )}
          <button
            onClick={startChat}
            disabled={chatLoading}
            className="flex-1 flex items-center justify-center gap-2 btn-chat-primary py-2.5 px-3 rounded-md text-xs sm:text-sm font-semibold tracking-wide transition-all disabled:opacity-50"
          >
            {chatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                <span>Chat</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ─── Desktop Action Panel ────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col gap-2.5">
        {/* WhatsApp Button */}
        <button
          onClick={() => openWhatsApp()}
          className="w-full flex items-center justify-center gap-2.5 btn-whatsapp h-12 px-4 text-[15px]"
        >
          <WaIcon className="h-4.5 w-4.5" />
          <span>Chat on WhatsApp</span>
        </button>

        {/* Call & In-App Chat */}
        <div className="flex gap-2">
          {(loggedIn ? callNum : true) && (
            <button
              onClick={callSeller}
              className="flex-1 flex items-center justify-center gap-2 btn-call h-12 px-3 text-sm"
            >
              <Phone className="h-4 w-4" />
              <span>Call Seller</span>
            </button>
          )}
          <button
            onClick={startChat}
            disabled={chatLoading}
            className="flex-1 flex items-center justify-center gap-2 btn-chat-primary h-12 px-3 text-sm disabled:opacity-50"
          >
            {chatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                <span>Chat</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Mobile Sticky Action Bar (App-Native Dock) ──────────────────── */}
      {mounted && typeof document !== "undefined" && createPortal(
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-card-border px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] flex items-center gap-2"
          aria-label="Contact the seller"
        >
          <button
            type="button"
            onClick={callSeller}
            disabled={loggedIn && !callNum}
            className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl bg-surface-secondary text-content text-[13.5px] sm:text-sm font-bold leading-none whitespace-nowrap active:scale-95 transition-transform disabled:opacity-40"
            aria-label="Call the seller"
          >
            <Phone className="h-4 w-4 shrink-0" />
            <span>Call</span>
          </button>

          <button
            type="button"
            onClick={() => openWhatsApp()}
            className="flex-[1.2] min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl bg-whatsapp text-white text-[13.5px] sm:text-sm font-bold leading-none whitespace-nowrap active:scale-95 transition-transform"
            aria-label="Chat on WhatsApp"
          >
            <WaIcon className="h-4 w-4 shrink-0" />
            <span>WhatsApp</span>
          </button>

          {booking && !isSeller ? (
            <Link
              href={booking.href}
              className="flex-[1.25] min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-[13.5px] sm:text-sm font-bold leading-none whitespace-nowrap active:scale-95 transition-transform"
            >
              <CalendarCheck className="h-4 w-4 shrink-0" />
              <span>{booking.cta.replace(/ now$/i, "")}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={startChat}
              disabled={chatLoading}
              className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl bg-primary hover:bg-primary-dark text-white text-[13.5px] sm:text-sm font-bold leading-none whitespace-nowrap disabled:opacity-60 active:scale-95 transition-transform"
              aria-label="Live Chat"
            >
              {chatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span>Chat</span>
                </>
              )}
            </button>
          )}
        </nav>,
        document.body
      )}
    </>
  );
}
