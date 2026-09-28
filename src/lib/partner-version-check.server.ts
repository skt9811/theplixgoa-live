// Server-only. Backs GET /api/partner/version-check — the Plix Partner
// app's (com.plix.partner) force-update gate. These three values are
// maintained by hand alongside android/app/build.gradle's own versionCode/
// versionName: bump MIN_BUILD_NUMBER (and LATEST_VERSION_NAME) whenever a
// release ships that the app should require everyone to be on — e.g. one
// that fixes a crash, or that a new server-side API contract depends on.
// Leaving MIN_BUILD_NUMBER at the previous release's versionCode means nobody
// is forced to update; this is a manual gate; nothing bumps it automatically.
// Kept at the CURRENTLY LIVE Play Console versionCode (6 / 1.0.4 as of this
// write), not the new build being uploaded (7 / 1.0.5) — bumping this to 7
// before that build has actually cleared Play Console review and rolled out
// would force-block every existing installed user with no update they can
// actually download yet. Move this to 7 only once 1.0.5 is live on the
// track you're gating.
const MIN_BUILD_NUMBER = 6;
const LATEST_VERSION_NAME = "1.0.4";
const FORCE_UPDATE = true;
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.plix.partner";

export function handlePartnerVersionCheck(): Response {
  return new Response(
    JSON.stringify({
      minBuildNumber: MIN_BUILD_NUMBER,
      latestVersion: LATEST_VERSION_NAME,
      forceUpdate: FORCE_UPDATE,
      playStoreUrl: PLAY_STORE_URL,
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
