export type Category = "lifestyle" | "pet" | "wedding" | "aggregator";

export type Target = {
  domain: string;
  category: Category;
  recipientEmail: string;
  recipientName: string;
  /** false = domain failed a basic reachability check when the target list
   * was built (bad DNS, or resolves to a non-routable address). The mailer
   * skips these in --send until someone manually confirms the domain is
   * real and flips this to true. */
  verified: boolean;
};

export type Status = "PENDING" | "SENT" | "FOLLOWUP_1" | "FOLLOWUP_2" | "REPLIED";
export type Touch = "initial" | "followup1" | "followup2";

export type HistoryEntry = {
  touch: Touch;
  sentAt: string;
  subject: string;
};

export type OutreachRecord = {
  domain: string;
  recipientEmail: string;
  status: Status;
  lastSentAt: string | null;
  history: HistoryEntry[];
};

export type OutreachDb = Record<string, OutreachRecord>;
