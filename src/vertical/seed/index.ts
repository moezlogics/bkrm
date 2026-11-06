import { VERTICAL } from "@/vertical";
import type { VerticalSeed } from "./types";
import { carsSeed } from "./cars";
import { bikesSeed } from "./bikes";
import { bakraSeed } from "./bakra";

/** Starter data for the active vertical (first-run setup only). */
const BY_ID: Record<string, VerticalSeed> = { cars: carsSeed, bikes: bikesSeed, bakra: bakraSeed };
export const SEED: VerticalSeed = BY_ID[VERTICAL.id] || carsSeed;
