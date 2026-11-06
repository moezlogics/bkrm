"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { chat as chatApi } from "@/lib/api-client";
import { MessageSquare, Send, Check, CheckCheck, AlertCircle, Gavel, X, Sparkles, Loader2, ArrowLeft, Heart, ShieldAlert } from "lucide-react";
import Pusher from "pusher-js";
import { AppBar } from "@/components/layout/AppChrome";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/utils";
import { loginUrl } from "@/lib/auth-intent";
import { withBasePath } from "@/lib/base-path";
import { refreshBadges } from "@/lib/badges-client";
import { askForPush } from "@/lib/push-client";
import { PushNudge } from "@/components/push/PushNudge";

function ChatPageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [serverThreads, setServerThreads] = useState<any[]>([]);
  /*
   * A conversation opened from an ad has no messages yet, so the server's
   * thread list (built from messages) doesn't include it. It's kept here until
   * its first message is sent — the 6-second refresh used to replace the list
   * and wipe it, taking the message box with it ("Chat does nothing").
   */
  const [draftThread, setDraftThread] = useState<any | null>(null);
  const threads = draftThread && !serverThreads.some((t) => t._id === draftThread._id)
    ? [draftThread, ...serverThreads]
    : serverThreads;
  const setThreads = setServerThreads;
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState(searchParams.get("threadId") || "");
  const [inputText, setInputText] = useState("");

  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingOfferId, setUpdatingOfferId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const me = session?.user?.id || "";
  const urlThreadId = searchParams.get("threadId") || "";

  // Protect route — and come back to the same conversation after logging in.
  useEffect(() => {
    if (status === "unauthenticated") {
      toast.info("Please log in to see your messages.");
      router.push(loginUrl(urlThreadId ? `/chat?threadId=${encodeURIComponent(urlThreadId)}` : "/chat"));
    }
  }, [status, router, toast, urlThreadId]);

  // Keep the selection in step with the address (back button, notification taps).
  useEffect(() => {
    setSelectedThreadId(urlThreadId);
  }, [urlThreadId]);

  // Phones: an open conversation is full screen — the bottom navigation bar
  // used to sit on top of the message box, so there was nowhere to type.
  useEffect(() => {
    document.body.classList.toggle("chat-open", !!selectedThreadId);
    return () => document.body.classList.remove("chat-open");
  }, [selectedThreadId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 1. Load the inbox once per account; open a new conversation from the address.
  //    (Keyed on the user id, not the session object — that changes on every
  //    session refresh and used to reload everything.)
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await chatApi.threads();
        if (cancelled || !res.success) return;
        setThreads(res.data);
        if (urlThreadId && !res.data.some((t: any) => t._id === urlThreadId)) {
          const [adId] = urlThreadId.split("_");
          const initRes: any = await chatApi.createThread(adId).catch((e: any) => ({ success: false, message: e?.message }));
          if (cancelled) return;
          if (initRes.success) setDraftThread(initRes.data);
          else toast.error(initRes.message || "This conversation isn't available");
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || "Couldn't load your messages");
      } finally {
        if (!cancelled) setThreadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me, urlThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Load + live-poll messages for the selected thread (Pusher optional).
  useEffect(() => {
    if (!selectedThreadId || !session) return;
    let active = true;

    const load = async (initial: boolean) => {
      if (initial) setMessagesLoading(true);
      try {
        const res = await chatApi.messages(selectedThreadId);
        if (res.success && active) {
          setMessages((prev) => {
            const next = res.data;
            const same = prev.length === next.length && prev[prev.length - 1]?._id === next[next.length - 1]?._id
              && prev[prev.length - 1]?.offerStatus === next[next.length - 1]?.offerStatus;
            return same ? prev : next;
          });
          setThreads((prev) => prev.map((t) => (t._id === selectedThreadId ? { ...t, unreadCount: 0 } : t)));
          // Opening a conversation reads it: the Chat tab's count goes down.
          if (initial) refreshBadges();
        }
      } catch { /* transient */ }
      finally { if (initial) setMessagesLoading(false); }
    };

    load(true);
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(false); }, 3000); // near-real-time without Pusher

    // Optional Pusher push (only when actually configured)
    let pusher: any = null;
    // Accept either env spelling (see lib/pusher.ts).
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY;
    if (key) {
      const [adId] = selectedThreadId.split("_");
      const buyerId = threads.find((t) => t._id === selectedThreadId)?.buyerId;
      if (buyerId) {
        pusher = new Pusher(key, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2" });
        pusher.subscribe(`chat-${adId}-${buyerId}`).bind("new-message", (msg: any) => {
          if (msg.threadId === selectedThreadId) setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
        });
      }
    }

    return () => { active = false; clearInterval(iv); if (pusher) pusher.disconnect(); };
  }, [selectedThreadId, me]); // eslint-disable-line

  // 2b. Live-poll the thread list (new conversations / previews / unread).
  useEffect(() => {
    if (!me) return;
    const iv = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await chatApi.threads();
        if (res.success) setThreads(res.data.map((t: any) => (t._id === selectedThreadId ? { ...t, unreadCount: 0 } : t)));
      } catch { /* transient */ }
    }, 6000);
    return () => clearInterval(iv);
  }, [me, selectedThreadId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;

    setSending(true);
    try {
      const res = await chatApi.send(selectedThreadId, {
        text: inputText.trim(),
      });
      if (res.success) {
        setMessages((prev) => [...prev, res.data]);
        setInputText("");
        askForPush("chat");
        const preview = { text: res.data.text, createdAt: res.data.createdAt, senderId: res.data.senderId };
        // The first message makes a new conversation real: it joins the inbox.
        if (draftThread && draftThread._id === selectedThreadId) {
          setThreads((prev) => (prev.some((t) => t._id === selectedThreadId) ? prev : [{ ...draftThread, lastMessage: preview }, ...prev]));
          setDraftThread(null);
        } else {
          setThreads((prev) => prev.map((t) => (t._id === selectedThreadId ? { ...t, lastMessage: preview } : t)));
        }
      } else {
        toast.error((res as any).message || "Message not sent. Please try again.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleUpdateOffer = async (messageId: string, offerId: string, status: "accepted" | "rejected") => {
    setUpdatingOfferId(offerId);
    try {
      const res = await fetch(withBasePath(`/api/offers/${offerId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Offer ${status} successfully!`);
        // Update local message list
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, offerStatus: status } : m))
        );
      } else {
        toast.error(data.message || "Failed to update offer status.");
      }
    } catch (err) {
      toast.error("Failed to process offer action.");
    } finally {
      setUpdatingOfferId(null);
    }
  };

  const activeThread = threads.find((t) => t._id === selectedThreadId);

  if (threadsLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <span className="text-sm font-semibold text-content-secondary">Loading Inbox...</span>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      <div className={selectedThreadId ? "hidden md:block" : ""}>
        <AppBar title="Messages" backHref="/" />
      </div>
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto md:p-4">
      <div className="bg-card md:border border-card-border md:rounded-2xl h-full flex overflow-hidden md:shadow-xl">
        {/* Left Column: Thread list */}
        <div className={`w-full md:w-80 shrink-0 border-r border-card-border flex flex-col h-full bg-surface-secondary/40 ${selectedThreadId ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-card-border hidden md:block">
            <h2 className="text-lg font-bold text-content flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Inbox
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-card-border/50">
            <PushNudge context="chat" className="m-3" />
            {threads.length > 0 ? (
              threads.map((t) => {
                const otherParticipant = t.participants.find((p: any) => p._id !== session?.user?.id);
                const isSelected = t._id === selectedThreadId;

                return (
                  <button
                    key={t._id}
                    onClick={() => {
                      setSelectedThreadId(t._id);
                      router.push(`/chat?threadId=${t._id}`, { scroll: false });
                    }}
                    className={`w-full text-left p-4 flex gap-3 hover:bg-surface-secondary/60 transition-colors ${
                      isSelected ? "bg-primary/5 hover:bg-primary/5" : ""
                    }`}
                  >
                    {/* Other avatar */}
                    <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {otherParticipant?.image ? (
                        <img src={otherParticipant.image} alt={otherParticipant.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        otherParticipant?.name?.[0].toUpperCase() || "U"
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-content truncate">
                          {otherParticipant?.name}
                        </span>
                        <span className="text-[10px] text-content-tertiary font-medium">
                          {t.lastMessage?.senderId ? new Date(t.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "New"}
                        </span>
                      </div>

                      <span className="text-xs text-content-secondary line-clamp-1 mt-0.5 font-medium">
                        {t.ad.title}
                      </span>
                      <p className="text-xs text-content-tertiary line-clamp-1 mt-0.5">
                        {t.lastMessage?.text}
                      </p>
                    </div>

                    {/* Unread badge */}
                    {t.unreadCount > 0 && (
                      <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center mt-1">
                        {t.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-sm text-content-secondary">
                No active conversations found.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chat messages area */}
        <div className={`flex-grow flex flex-col h-full bg-surface ${!selectedThreadId ? "hidden md:flex" : "flex"}`}>
          {activeThread ? (
            <>
              {/* Top Detail Bar + Listing context panel */}
              <div className="border-b border-card-border shrink-0 liquid-glass">
                <div className="p-4 flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => {
                      setSelectedThreadId("");
                      router.push("/chat", { scroll: false });
                    }}
                    className="md:hidden p-1.5 hover:bg-surface-secondary rounded-lg shrink-0"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {activeThread.participants.find((p: any) => p._id !== session?.user?.id)?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <h3 className="font-bold text-content text-sm truncate">
                    {activeThread.participants.find((p: any) => p._id !== session?.user?.id)?.name}
                  </h3>
                </div>
                {/* Listing context strip */}
                <Link
                  href={`/ads/${activeThread.ad.slug}`}
                  className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-card-border bg-surface/60 p-2 hover:border-primary/40 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {activeThread.ad.images?.[0] ? (
                      <img src={activeThread.ad.images[0]} alt={activeThread.ad.title} className="h-full w-full object-cover" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-content-tertiary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-content line-clamp-1">{activeThread.ad.title}</p>
                    <p className="text-xs font-bold text-primary">{formatPrice(activeThread.ad.price)}</p>
                  </div>
                  <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded-md shrink-0">
                    <ShieldAlert className="h-3 w-3" /> Never pay in advance
                  </span>
                </Link>
              </div>

              {/* Message scroll container */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-surface-secondary/10">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="m-auto text-center max-w-xs px-4">
                    <p className="text-sm font-semibold text-content">Say hello to {activeThread.participants.find((p: any) => p._id !== me)?.name || "the seller"}</p>
                    <p className="text-xs text-content-secondary mt-1">Ask if it&apos;s still available, or agree a time to see it. Never pay in advance.</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      {["Is this still available?", "What's your final price?", "Where can I see it?"].map((q) => (
                        <button key={q} type="button" onClick={() => setInputText(q)} className="rounded-full border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-content hover:border-primary">{q}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === session?.user?.id;
                    const isOffer = msg.type === "offer" && msg.offerAmount;

                    return (
                      <div
                        key={msg._id}
                        className={`flex flex-col max-w-[70%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                      >
                        {isOffer ? (
                          /* Inline Offer Card styling */
                          <div className="bg-surface border-2 border-secondary/30 rounded-2xl p-4 shadow-sm w-72 flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-secondary tracking-wider uppercase">
                              <Gavel className="h-4.5 w-4.5" /> Price Offer
                            </div>
                            <div className="text-xl font-bold text-content">
                              {formatPrice(msg.offerAmount)}
                            </div>
                            <p className="text-xs text-content-secondary">{msg.text}</p>

                            {/* Actions / Status badges */}
                            {msg.offerStatus === "accepted" ? (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1.5 rounded-lg border border-emerald-200 self-start">
                                <Check className="h-3.5 w-3.5" /> Offer Accepted
                              </div>
                            ) : msg.offerStatus === "rejected" ? (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-2.5 py-1.5 rounded-lg border border-rose-200 self-start">
                                <AlertCircle className="h-3.5 w-3.5" /> Offer Declined
                              </div>
                            ) : (
                              /* Pending - show buttons ONLY if I am the seller */
                              !isMe ? (
                                <div className="flex gap-2.5 w-full mt-1">
                                  <button
                                    disabled={updatingOfferId !== null}
                                    onClick={() => handleUpdateOffer(msg._id, msg.offerId, "accepted")}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Accept
                                  </button>
                                  <button
                                    disabled={updatingOfferId !== null}
                                    onClick={() => handleUpdateOffer(msg._id, msg.offerId, "rejected")}
                                    className="flex-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold py-2.5 rounded-xl text-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                                  >
                                    <X className="h-3.5 w-3.5" /> Decline
                                  </button>
                                </div>
                              ) : (
                                <div className="text-[10px] uppercase font-bold text-content-tertiary bg-surface-secondary px-2.5 py-1.5 rounded-lg border border-card-border self-start">
                                  Pending decision
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          /* Text message bubble */
                          <div
                            className={`p-3.5 rounded-2xl text-sm font-medium shadow-sm ${
                              isMe
                                ? "bg-gradient-to-br from-primary to-primary-light text-white rounded-tr-none"
                                : "bg-card border border-card-border text-content rounded-tl-none shadow-xs"
                            }`}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                          </div>
                        )}
                        <span className="flex items-center gap-1 text-[9px] text-content-tertiary mt-1 font-medium px-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {isMe && (
                            msg.isRead
                              ? <CheckCheck className="h-3 w-3 text-sky-500" />
                              : <Check className="h-3 w-3" />
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom message input form */}
              <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-card-border flex gap-2.5 shrink-0 bg-surface">
                <input
                  type="text"
                  placeholder="Type your message..."
                  aria-label="Message"
                  maxLength={2000}
                  enterKeyHint="send"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-content-tertiary"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-3 rounded-xl transition-all shadow-md active:scale-95 shrink-0 flex items-center justify-center"
                >
                  <Send className="h-5 w-5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8 gap-4">
              <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-lg text-content">Select a Conversation</h3>
              <p className="text-sm text-content-secondary max-w-xs">
                Select a thread from the left menu panel or post a new ad offer to start negotiating!
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8 text-center">Loading Inbox...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
