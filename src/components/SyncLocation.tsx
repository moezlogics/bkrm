"use client";

import { useEffect } from "react";
import { syncCityAction } from "@/app/actions/location";

/**
 * Rendered by a city archive whose city differs from the visitor's saved one.
 * Browsing /karachi/... makes Karachi the visitor's location (OLX behaviour),
 * so Home and every other page follow.
 *
 * Only the city is synced: exploring other areas of your own city shouldn't
 * throw away your precise "near me" point. Uses a Server Action so the client
 * router cache is invalidated too (see syncCityAction).
 */
export function SyncLocation({ city }: { city: string }) {
  useEffect(() => {
    syncCityAction(city).catch(() => {});
  }, [city]);
  return null;
}
