import { createContext, useContext } from "react";

type PmsContextValue = {
  openCreate: () => void;
  /** Increments after a reservation is saved so open pages reload their data. */
  refreshKey: number;
  /** Active property scope for every PMS page: "all" (portfolio) or a property slug. */
  property: string;
  setProperty: (property: string) => void;
};

export const PmsContext = createContext<PmsContextValue>({ openCreate: () => undefined, refreshKey: 0, property: "all", setProperty: () => undefined });
export const usePms = () => useContext(PmsContext);
