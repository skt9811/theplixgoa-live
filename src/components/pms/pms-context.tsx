import { createContext, useContext } from "react";
import type { PmsTab, PmsUser } from "@/lib/pms-client";

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
  features: {
    pms_enabled: true,
    pos_enabled: true,
    airbnb_spaces_enabled: true,
    whatsapp_bot_enabled: false,
    audit_notifications_enabled: true,
  },
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
});
export const usePms = () => useContext(PmsContext);
