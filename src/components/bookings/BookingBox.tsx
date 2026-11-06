import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export type BookingSummary = { kind: "service" | "share"; cta: string; title: string; href: string; lines: string[]; full: boolean };

/** On a bookable ad: what's still free, and the button to book it. */
export function BookingBox({ b, className = "" }: { b: BookingSummary; className?: string }) {
  return (
    <div className={`rounded-xl border border-primary/25 bg-primary/5 p-4 ${className}`}>
      <p className="text-sm font-bold text-content flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-primary" /> {b.title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {b.lines.map((l) => (
          <li key={l} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${/full|booked|no days/i.test(l) ? "bg-red-50 text-red-600" : "bg-card text-content-secondary border border-card-border"}`}>{l}</li>
        ))}
      </ul>
      {b.full ? (
        <p className="mt-3 text-[12px] text-content-secondary">Fully booked — you can still call or message to ask.</p>
      ) : (
        <Link href={b.href} className="mt-3 h-11 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold flex items-center justify-center gap-2">
          <CalendarCheck className="h-4 w-4" /> {b.cta}
        </Link>
      )}
      <p className="mt-2 text-[11px] text-content-tertiary">Free to book. You pay in person — never an advance.</p>
    </div>
  );
}
