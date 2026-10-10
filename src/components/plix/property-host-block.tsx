import { COMPANY_GSTIN, COMPANY_LEGAL_NAME, FOUNDER } from "@/lib/trust-config";

/**
 * Founder name/photo/story are all TODO in trust-config.ts and hide
 * independently when empty. The company name + GSTIN line is always
 * shown — both are real, already-published facts (same values as every
 * real tax invoice this business issues; see trust-config.ts's comment).
 */
export function PropertyHostBlock() {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm font-semibold text-navy">About your host</p>
      {FOUNDER.name && (
        <div className="mt-3 flex items-center gap-3">
          {FOUNDER.photoUrl && (
            <img
              src={FOUNDER.photoUrl}
              alt={FOUNDER.name}
              className="size-12 rounded-full object-cover"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-navy">{FOUNDER.name}</p>
            {FOUNDER.story && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {FOUNDER.story}
              </p>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {COMPANY_LEGAL_NAME} · GSTIN {COMPANY_GSTIN}
      </p>
    </div>
  );
}
