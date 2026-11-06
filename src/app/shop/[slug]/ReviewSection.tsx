"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Star, X, Loader2, MessageSquarePlus, BadgeCheck, Handshake } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { loginUrl, useResumeIntent } from "@/lib/auth-intent";
import type { PublicReview as Review } from "@/lib/reviews";

/**
 * Seller reviews. Anyone can leave one: logged-in members' reviews carry a
 * "Verified" tag (and "Bought here" after an accepted deal); guests review
 * under a name they give, and their reviews say "Guest".
 */
export function ReviewSection({ sellerId, sellerName, initial }: { sellerId: string; sellerName: string; initial: Review[] }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>(initial);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [trap, setTrap] = useState(""); // honeypot — stays empty for people
  const [busy, setBusy] = useState(false);

  const me = (session as any)?.userId || (session as any)?.user?.id;
  const isOwn = !!me && me === sellerId;
  const isAdmin = (session as any)?.role === "admin" || (session as any)?.user?.role === "admin";
  const guest = status === "unauthenticated";

  const rate = () => {
    if (isOwn) { toast.error("You can't review yourself"); return; }
    setOpen(true);
  };
  // Back from "log in to post as a verified member" → reopen the form.
  useResumeIntent({ review: () => { if (!isOwn) setOpen(true); } }, status === "authenticated");

  const reload = async () => {
    const jj = await fetch(`/api/reviews?sellerId=${sellerId}`).then((r) => r.json()).catch(() => null);
    if (jj?.success) setReviews(jj.data);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) { toast.error("Please choose a star rating"); return; }
    if (guest && name.trim().length < 2) { toast.error("Please enter your name"); return; }
    if (guest && comment.trim().length < 10) { toast.error("Please write a few words about your experience"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId, rating, comment, ...(guest ? { name, website: trap } : {}) }),
      });
      const j = await r.json();
      if (j.success) {
        toast.success(j.message || "Thanks for your review!");
        setOpen(false); setRating(0); setComment("");
        reload();
      } else toast.error(j.message || "Couldn't post your review");
    } catch { toast.error("Couldn't post your review — check your connection"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this review? It will no longer count towards the seller's rating.")) return;
    const j = await fetch(`/api/reviews?id=${id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.success) { toast.success("Review removed"); setReviews((l) => l.filter((x) => x._id !== id)); }
    else toast.error(j?.message || "Couldn't remove the review");
  };

  const verifiedCount = reviews.filter((r) => r.verified).length;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-content">Reviews ({reviews.length})</h2>
          {reviews.length > 0 && <p className="text-[12px] text-content-tertiary">{verifiedCount} from verified members</p>}
        </div>
        {!isOwn && (
          <button onClick={rate} className="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm font-semibold text-content hover:border-primary hover:text-primary">
            <MessageSquarePlus className="h-4 w-4" /> Write a review
          </button>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-card-border bg-surface-secondary p-6 text-sm text-content-secondary text-center">
          No reviews yet.{!isOwn && <> Dealt with {sellerName}? <button onClick={rate} className="font-semibold text-primary hover:underline">Be the first to review</button>.</>}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {reviews.map((rv) => (
            <div key={rv._id} className="rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] p-3.5 flex gap-3">
              <div className={`h-9 w-9 rounded-full grid place-items-center font-bold shrink-0 ${rv.verified ? "bg-primary/10 text-primary" : "bg-surface-secondary text-content-secondary"}`}>
                {rv.reviewer?.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="font-semibold text-sm text-content truncate">{rv.reviewer?.name || "Member"}</span>
                    {rv.verified ? (
                      <span title="Written by a logged-in member" className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[11px] font-bold"><BadgeCheck className="h-3 w-3" /> Verified</span>
                    ) : (
                      <span title="Written without an account — the name isn't checked" className="rounded-full bg-surface-secondary text-content-tertiary px-1.5 py-0.5 text-[11px] font-semibold">Guest</span>
                    )}
                    {rv.dealVerified && (
                      <span title="Had an accepted deal with this seller" className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[11px] font-bold"><Handshake className="h-3 w-3" /> Bought here</span>
                    )}
                  </span>
                  <span suppressHydrationWarning className="text-[12px] text-content-tertiary shrink-0">{formatDate(rv.createdAt)}</span>
                </div>
                <div className="flex items-center gap-0.5 my-0.5" aria-label={`${rv.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i <= rv.rating ? "fill-amber-400 text-amber-400" : "text-content-tertiary"}`} />
                  ))}
                </div>
                {rv.comment && <p className="text-sm text-content-secondary whitespace-pre-line break-words">{rv.comment}</p>}
                <div className="flex items-center gap-3">
                  {rv.item && <Link href={`/ads/${rv.item.slug}`} className="text-[12px] text-primary hover:underline truncate">{rv.item.title}</Link>}
                  {isAdmin && <button onClick={() => remove(rv._id)} className="ml-auto text-[12px] font-semibold text-danger hover:underline">Remove</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Review ${sellerName}`}>
          <div className="fixed inset-0 bg-black/60" onClick={() => !busy && setOpen(false)} />
          <form onSubmit={submit} className="relative z-10 w-full sm:max-w-sm bg-card border-t sm:border border-card-border rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-3 animate-slide-up max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-content">Review {sellerName}</h3>
              <button type="button" aria-label="Close" onClick={() => !busy && setOpen(false)} className="p-1 rounded-full hover:bg-surface-secondary"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i > 1 ? "s" : ""}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setRating(i)}>
                  <Star className={`h-8 w-8 transition-colors ${i <= (hover || rating) ? "fill-amber-400 text-amber-400" : "text-content-tertiary"}`} />
                </button>
              ))}
            </div>
            {guest && (
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="Your name" aria-label="Your name"
                className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary bg-surface" />
            )}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={1000} aria-label="Your review"
              placeholder={guest ? "How was your experience with this seller?" : "How was your experience? (optional)"}
              className="rounded-lg border border-card-border p-3 text-sm outline-none focus:border-primary bg-surface resize-none" />
            {/* Honeypot: hidden from people and screen readers. */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            <button type="submit" disabled={busy} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Post review"}
            </button>
            {guest ? (
              <p className="text-[12px] text-content-tertiary text-center">
                Posting as a guest. <Link href={loginUrl(pathname, "review")} className="font-semibold text-primary hover:underline">Log in</Link> to post as a <b>verified</b> member.
              </p>
            ) : (
              <p className="text-[12px] text-content-tertiary text-center">Posted as {session?.user?.name || "you"} with a <b>Verified</b> tag. Posting again updates your review.</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
