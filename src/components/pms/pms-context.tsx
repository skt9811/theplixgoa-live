import { createContext, useContext } from "react";
import type { PmsProperty, PmsTab, PmsUser } from "@/lib/pms-client";
import { defaultFeaturesForTier } from "@/lib/tenant-features-config";

type PmsContextValue = {
  openCreate: () => void;
  /** Increments after a reservation is saved so open pages reload their data. */
  refreshKey: number;
  /** Active property scope for every PMS page: "all" (portfolio) or a property slug. */
  property: string;
  setProperty: (property: string) => void;
  /** The signed-in user and what they may open. */
  user: PmsUser;
  can: (tab: PmsTab) => boolean;
  /** Property slugs this user may see (all of them for full-access users). */
  allowedProperties: string[];
  allProperties: boolean;
  /** This actor's own organization's real properties, from GET
   * /api/pms/properties — already narrowed to allowedProperties. Empty while
   * still loading; every consumer should treat an empty array as "not ready
   * yet", the same way `user` starting null already gates the whole shell. */
  properties: PmsProperty[];
};

const OWNER: PmsUser = {
  id: null,
  name: "Owner",
  role: "admin",
  props: ["all"],
  tabs: ["dashboard", "bookings", "expenses", "invoices", "vouchers", "settings"],
  isOwner: true,
  organizationStatus: "active",
  trialEndsAt: null,
  isInternal: true,
  planTier: "internal_enterprise",
  features: defaultFeaturesForTier("enterprise"),
};

export const PmsContext = createContext<PmsContextValue>({
  openCreate: () => undefined,
  refreshKey: 0,
  property: "all",
  setProperty: () => undefined,
  user: OWNER,
  can: () => true,
  allowedProperties: [],
  allProperties: true,
  properties: [],
});
export const usePms = () => useContext(PmsContext);
