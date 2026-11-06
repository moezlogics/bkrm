import Link from "next/link";
import { MoonStar } from "lucide-react";
import { VERTICAL } from "@/vertical";

// Where bookings are on: straight to the sections people book (qasai, hissa).
const BOOK_LINKS = [VERTICAL.bookings?.service, VERTICAL.bookings?.share]
  .filter((b): b is NonNullable<typeof b> => !!b?.tops[0])
  .map((b) => ({ href: `/${b.tops[0]}`, label: b.title }));

/**
 * Countdown to the site's event (Eid ul Adha on a bakra mandi). Name, date
 * (YYYY-MM-DD, Pakistan time) and a short note come from Admin → Settings →
 * Homepage; an empty name or date hides it. From Eid day to three days after
 * it says "Eid Mubarak", then hides until the admin sets next year's date.
 */
export function EventBanner({ name, date, note }: { name?: string; date?: string; note?: string }) {
  if (!name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date?.trim() || "")) return null;
  const at = Date.parse(`${date!.trim()}T00:00:00+05:00`);
  if (!Number.isFinite(at)) return null;
  const days = Math.ceil((at - Date.now()) / 864e5);
  if (days < -3) return null;
  const when = new Date(at).toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const headline = days > 1 ? `${days.toLocaleString("en-US")} days to ${name}` : days === 1 ? `${name} is tomorrow` : `${name} Mubarak!`;

  return (
    <section className="wrap pt-3 pb-1" aria-label={name}>
      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="grid place-items-center h-11 w-11 rounded-full bg-primary text-white shrink-0"><MoonStar className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-base font-bold text-content">{headline}</p>
            <p className="text-xs text-content-secondary">{when}{note?.trim() ? ` · ${note.trim()}` : ""}</p>
          </div>
        </div>
        {days >= 0 && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {BOOK_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex items-center h-10 px-4 rounded-lg border border-primary/40 bg-card text-sm font-semibold text-primary hover:bg-primary/10">
                {l.label}
              </Link>
            ))}
            <Link href={`/${VERTICAL.primaryTop}`} className="inline-flex items-center h-10 px-4 rounded-lg border border-primary/40 bg-card text-sm font-semibold text-primary hover:bg-primary/10">
              {VERTICAL.copy.browseAll}
            </Link>
            <Link href="/ads/post" className="inline-flex items-center h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-bold">
              {VERTICAL.copy.sellCta}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
