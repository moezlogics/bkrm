/**
 * Icons for categories and specs — one registry for the home tiles, the sell
 * wizard, the admin icon picker and the ad page key facts, so an icon chosen
 * in the admin always renders.
 *
 * Lucide has no farm animals, so the goat, sheep, cow, buffalo, camel and
 * tooth icons are drawn here in the same style (24×24, 2px round strokes,
 * currentColor) and behave like any Lucide icon.
 */
import React, { forwardRef } from "react";
import {
  Car, CarFront, Truck, Bus, Motorbike, Scooter, Bike, Zap, Wrench, Cog, Disc3, Fuel, Gauge, Calendar,
  MapPinned, Palette, FileCheck, Users, Sparkles, ShieldCheck, BadgeCheck, MessageCircle, BatteryCharging,
  Route, Settings2, Layers, Package, KeyRound, Armchair, Lightbulb, HardHat, Tag, Snowflake, Radio, Hash,
  Weight, Ruler, Syringe, HeartPulse, MoonStar, Store, Warehouse, Wheat, Slice, VenusAndMars,
  type LucideIcon, type LucideProps,
} from "lucide-react";

/** A line icon from raw SVG children, with Lucide's props and defaults. */
function lineIcon(name: string, body: React.ReactNode): LucideIcon {
  const C = forwardRef<SVGSVGElement, LucideProps>(function Icon({ size = 24, strokeWidth = 2, color = "currentColor", className, absoluteStrokeWidth, ...rest }, ref) {
    const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    return (
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
        strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={["lucide", className].filter(Boolean).join(" ")} aria-hidden="true" {...rest}>
        {body}
      </svg>
    );
  });
  C.displayName = name;
  return C as unknown as LucideIcon;
}

const Goat = lineIcon("Goat", <>
  <path d="M9 7C8.5 4.5 6.5 3 4 3" /><path d="M15 7c.5-2.5 2.5-4 5-4" />
  <path d="M8.6 9.2 4.5 8.5c-.4 1.6.6 2.8 2.4 2.8h1.5" /><path d="M15.4 9.2l4.1-.7c.4 1.6-.6 2.8-2.4 2.8h-1.5" />
  <path d="M9 7h6l1 4-1.6 6.2a2.5 2.5 0 0 1-4.8 0L8 11z" /><path d="M12 19.6V22" /><path d="M10.6 11.2h.01M13.4 11.2h.01" />
</>);
const Sheep = lineIcon("Sheep", <>
  <path d="M7.6 10.4A3 3 0 0 1 8.5 5a3 3 0 0 1 3.5-2 3 3 0 0 1 3.5 2 3 3 0 0 1 .9 5.4" />
  <path d="M8 10.5 4.5 9.6c-.5 1.6.5 3 2.4 3H8" /><path d="M16 10.5l3.5-.9c.5 1.6-.5 3-2.4 3H16" />
  <path d="M8 10h8v4.5a4 4 0 0 1-8 0z" /><path d="M10.5 13h.01M13.5 13h.01" /><path d="M11 16h2" />
</>);
const Cow = lineIcon("Cow", <>
  <path d="M8 7C6 7 4 6 3 4" /><path d="M16 7c2 0 4-1 5-3" />
  <path d="M7 9.5 3.6 9.2c-.6 1.7.4 3 2.4 3H7" /><path d="M17 9.5l3.4-.3c.6 1.7-.4 3-2.4 3H17" />
  <path d="M8.5 7h7A1.5 1.5 0 0 1 17 8.5V14H7V8.5A1.5 1.5 0 0 1 8.5 7z" /><rect x="7" y="14" width="10" height="7" rx="3.5" />
  <path d="M10 17.5h.01M14 17.5h.01" />
</>);
const Buffalo = lineIcon("Buffalo", <>
  <path d="M8 7.5C5 6 2.5 7 2 9.5c1.5-.8 3.2-.6 5 .2" /><path d="M16 7.5c3-1.5 5.5-.5 6 2-1.5-.8-3.2-.6-5 .2" />
  <path d="M8.5 7h7A1.5 1.5 0 0 1 17 8.5V14H7V8.5A1.5 1.5 0 0 1 8.5 7z" /><rect x="7" y="14" width="10" height="7" rx="3.5" />
  <path d="M10 17.5h.01M14 17.5h.01" /><path d="M10 10.5h.01M14 10.5h.01" />
</>);
const Camel = lineIcon("Camel", <>
  <path d="M2 8.5h3l2 4" /><path d="M2 8.5v1.2" />
  <path d="M7 12.5c1-4.5 3-6 5.5-6s4.2 1.6 5.2 6l1.8 1" /><path d="M7 12.5V15h12v-1.5" />
  <path d="M8.5 15v6M10.5 15v6M16 15v6M18 15v6" />
</>);
const Tooth = lineIcon("Tooth", <>
  <path d="M7 3C5 3 3.5 4.6 3.5 7c0 2 .8 3.4 1.4 5 .7 2 .9 4 1.4 6.2.3 1.4 1 2.8 2.2 2.8 1.3 0 1.6-1.5 1.9-3l.6-3.2c.2-.9.6-1.3 1-1.3s.8.4 1 1.3l.6 3.2c.3 1.5.6 3 1.9 3 1.2 0 1.9-1.4 2.2-2.8.5-2.2.7-4.2 1.4-6.2.6-1.6 1.4-3 1.4-5 0-2.4-1.5-4-3.5-4-1.7 0-2.6 1-5 1S8.7 3 7 3z" />
</>);

export const ICONS = {
  car: { label: "Car", Icon: Car },
  carFront: { label: "Car (front)", Icon: CarFront },
  truck: { label: "Truck / pickup", Icon: Truck },
  bus: { label: "Bus / van", Icon: Bus },
  motorbike: { label: "Motorcycle", Icon: Motorbike },
  scooter: { label: "Scooter", Icon: Scooter },
  bicycle: { label: "Bicycle", Icon: Bike },
  electric: { label: "Electric", Icon: Zap },
  parts: { label: "Spare parts", Icon: Wrench },
  gear: { label: "Transmission / gear", Icon: Cog },
  tyre: { label: "Tyres & wheels", Icon: Disc3 },
  fuel: { label: "Fuel", Icon: Fuel },
  gauge: { label: "Mileage", Icon: Gauge },
  calendar: { label: "Year / age", Icon: Calendar },
  city: { label: "Registration", Icon: MapPinned },
  colour: { label: "Colour", Icon: Palette },
  documents: { label: "Documents", Icon: FileCheck },
  owners: { label: "Owners", Icon: Users },
  accessories: { label: "Accessories", Icon: Sparkles },
  helmet: { label: "Helmets & gear", Icon: HardHat },
  shield: { label: "Safety", Icon: ShieldCheck },
  battery: { label: "Battery", Icon: BatteryCharging },
  range: { label: "Range", Icon: Route },
  engine: { label: "Engine", Icon: Settings2 },
  body: { label: "Body type", Icon: CarFront },
  assembly: { label: "Assembly", Icon: Package },
  key: { label: "Starter / key", Icon: KeyRound },
  seat: { label: "Interior", Icon: Armchair },
  light: { label: "Lights", Icon: Lightbulb },
  ac: { label: "Air conditioning", Icon: Snowflake },
  audio: { label: "Audio", Icon: Radio },
  // Animals (bakra mandi)
  goat: { label: "Goat (bakra)", Icon: Goat },
  sheep: { label: "Sheep / dumba", Icon: Sheep },
  cow: { label: "Cow / bull", Icon: Cow },
  buffalo: { label: "Buffalo", Icon: Buffalo },
  camel: { label: "Camel", Icon: Camel },
  teeth: { label: "Teeth (age)", Icon: Tooth },
  weight: { label: "Weight", Icon: Weight },
  height: { label: "Height", Icon: Ruler },
  gender: { label: "Gender", Icon: VenusAndMars },
  vaccine: { label: "Vaccinated", Icon: Syringe },
  health: { label: "Health", Icon: HeartPulse },
  moon: { label: "Eid / moon", Icon: MoonStar },
  mandi: { label: "Mandi / market", Icon: Store },
  farm: { label: "Farm", Icon: Warehouse },
  feed: { label: "Feed & fodder", Icon: Wheat },
  butcher: { label: "Qasai / butcher", Icon: Slice },
  shares: { label: "Shares (hissa)", Icon: Users },
  tag: { label: "Other", Icon: Tag },
  id: { label: "ID", Icon: Hash },
  badge: { label: "Verified", Icon: BadgeCheck },
  chat: { label: "Chat", Icon: MessageCircle },
  other: { label: "Other", Icon: Layers },
} as const;

export type SpecIconKey = keyof typeof ICONS;

export function iconFor(key?: string | null) {
  return (key && (ICONS as Record<string, { Icon: typeof Car }>)[key]?.Icon) || Layers;
}
