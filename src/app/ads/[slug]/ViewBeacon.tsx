"use client";
import { useEffect } from "react";
import { trackView } from "@/lib/track";

export function ViewBeacon({ id }: { id: string }) {
  useEffect(() => { trackView(id); }, [id]);
  return null;
}
