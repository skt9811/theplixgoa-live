import { createContext, useContext } from "react";

type PmsContextValue = {
  openCreate: () => void;
  /** Increments after a reservation is saved so open pages reload their data. */
  refreshKey: number;
};

export const PmsContext = createContext<PmsContextValue>({ openCreate: () => undefined, refreshKey: 0 });
export const usePms = () => useContext(PmsContext);
