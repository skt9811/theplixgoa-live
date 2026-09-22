export type Category = "Luxury Travel" | "Homestay Directory" | "Weddings" | "Pet-Friendly" | "Lifestyle";

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

export type Status = "PENDING" | "SENT" | "FOLLOWUP_1" | "FOLLOWUP_2" | "REPLIED" | "BOUNCED";
export type Touch = "initial" | "followup1" | "followup2";

export type HistoryEntry = {
  touch: Touch;
  sentAt: string;
  subject: string;
  /** Set only when the send attempt for this touch failed (e.g. the
   * receiving server rejected the address immediately). The touch is
   * recorded either way so the CSV/history shows what was attempted. */
  bounceError?: string;
};

export type OutreachRecord = {
  domain: string;
  recipientEmail: string;
  status: Status;
  lastSentAt: string | null;
  history: HistoryEntry[];
};

export type OutreachDb = Record<string, OutreachRecord>;
