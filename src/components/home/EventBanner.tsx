import Link from "next/link";
import { MoonStar, ArrowRight } from "lucide-react";
import { VERTICAL } from "@/vertical";

// Where bookings are on: straight to the sections people book (qasai, hissa).
const BOOK_LINKS = [VERTICAL.bookings?.service, VERTICAL.bookings?.share]
  .filter((b): b is NonNullable<typeof b> => !!b?.tops[0])
  .map((b) => ({ top: b.tops[0], label: b.title }));

/**
 * The home hero: the site's headline, a countdown to its event (Eid ul Adha
 * on a bakra mandi) and the two things people come to do besides browsing —
 * book a qasai or a hissa. Event name, date (YYYY-MM-DD, Pakistan time) and
 * note come from Admin → Settings → Homepage; without them the countdown
 * hides. From Eid day to three days after it says "Eid Mubarak".
 */
export function EventBanner({
  name, date, note, title, subtitle, prefix = "",
}: { name?: string; date?: string; note?: string; title?: string; subtitle?: string; prefix?: string }) {
  let countdown: { big: string; small: string } | null = null;
  let live = true;
  if (name?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date?.trim() || "")) {
    const at = Date.parse(`${date!.trim()}T00:00:00+05:00`);
    if (Number.isFinite(at)) {
      const days = Math.ceil((at - Date.now()) / 864e5);
      const when = new Date(at).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
      if (days > 1) countdown = { big: `${days.toLocaleString("en-US")} days`, small: `to ${name} · ${when}` };
      else if (days === 1) countdown = { big: "Tomorrow", small: `${name} · ${when}` };
      else if (days >= -3) { countdown = { big: `${name} Mubarak`, small: when }; live = false; }
    }
  }

  return (
    <section className="wrap pt-4 md:pt-6" aria-label={name || title}>
      <div className="relative overflow-hidden rounded-[28px] bg-primary text-white px-5 py-6 md:px-10 md:py-11">
        {/* soft depth: two large, faint rings */}
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[44px] border-white/[0.06]" />
        <span aria-hidden className="pointer-events-none absolute right-24 -bottom-32 h-64 w-64 rounded-full bg-black/[0.08]" />

        <div className="relative max-w-2xl">
          {countdown && (
            <p title={live ? note?.trim() || undefined : undefined} className="inline-flex items-center gap-2 h-8 pl-2 pr-3.5 rounded-full bg-white/15 text-[13.5px] font-semibold">
              <span className="grid place-items-center h-5 w-5 rounded-full bg-white text-primary"><MoonStar className="h-3 w-3" /></span>
              <span><b className="font-extrabold">{countdown.big}</b> {countdown.small}</span>
            </p>
          )}
          <h1 className="mt-3.5 text-[26px] leading-[1.15] md:text-[42px] font-extrabold tracking-tight !text-white">
            {title || VERTICAL.defaults.heroTitle}
          </h1>
          {subtitle && (
            <p className="mt-2.5 text-[15px] md:text-base text-white/80 leading-relaxed line-clamp-3 max-sm:line-clamp-2">{subtitle}</p>
          )}

          <div className="mt-5 md:mt-7 flex flex-wrap gap-2.5">
            {BOOK_LINKS.map((l, i) => (
              <Link key={l.top} href={`${prefix}/${l.top}`}
                className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-bold transition-colors ${i === 0 ? "bg-white text-primary-dark hover:bg-white/90" : "bg-white/15 text-white hover:bg-white/25"}`}>
                {l.label}
              </Link>
            ))}
            <Link href={`${prefix}/${VERTICAL.primaryTop}`} className="max-sm:hidden inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-white/15 text-white hover:bg-white/25 text-sm font-bold">
              {VERTICAL.copy.browseAll} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
