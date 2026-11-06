import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";

export type BookingSummary = { kind: "service" | "share"; cta: string; title: string; href: string; lines: string[]; full: boolean };

/** On a bookable ad: what's still free, and the button to book it. */
export function BookingBox({ b, className = "" }: { b: BookingSummary; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-primary-soft p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-white shrink-0"><CalendarCheck className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-content">{b.title}</p>
          <p className="text-[13px] text-content-secondary">Free to book · pay in person after the work</p>
        </div>
      </div>
      {b.lines.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {b.lines.map((l) => (
            <li key={l} className={`rounded-full h-7 px-3 inline-flex items-center text-[13px] font-semibold ${/full|booked|no days/i.test(l) ? "bg-danger-light text-danger" : "bg-white text-content"}`}>{l}</li>
          ))}
        </ul>
      )}
      {b.full ? (
        <p className="mt-3 text-[13.5px] text-content-secondary">Fully booked — you can still call or message to ask.</p>
      ) : (
        <Link href={b.href} className="mt-3.5 h-12 rounded-2xl bg-primary hover:bg-primary-dark text-white text-[15px] font-bold flex items-center justify-center gap-1.5">
          {b.cta} <ChevronRight className="h-[18px] w-[18px]" />
        </Link>
      )}
    </div>
  );
}
