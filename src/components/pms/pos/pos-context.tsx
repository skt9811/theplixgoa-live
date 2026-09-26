import { createContext, useContext } from "react";
import type { PosState } from "@/lib/pms-pos-client";

export type PosCtx = {
  property: string;
  propertyName: string;
  state: PosState | null;
  reload: () => Promise<void>;
};
export const PosContext = createContext<PosCtx>({ property: "all", propertyName: "", state: null, reload: async () => undefined });
export const usePos = () => useContext(PosContext);
