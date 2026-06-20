// Curated allowlist of reputable recipe sources. This list is the backbone of
// the feature's security model AND its quality model:
//
//  * Security — it is a default-deny allowlist. We only ever search these
//    domains (passed to Claude's web_search as `allowed_domains`) and we only
//    ever accept/validate/write a URL whose host is on this list. A page from
//    anywhere else is rejected before it is ever fetched, which keeps us away
//    from parked domains, link farms, and malware-hosting look-alikes.
//  * Quality — each site carries a reputation tier used to break ties when more
//    than one trusted site has the same recipe ("the most reputable website").
//
// Keep this list conservative. Adding a domain grants it trust; only add
// established, editorially-run culinary publishers and well-known recipe sites.

/** Reputation tiers (higher = preferred when breaking ties between matches). */
export const TIER = { TOP: 3, STRONG: 2, GOOD: 1 };

/**
 * domain -> { name, tier }. Domains are registrable hosts; a page is considered
 * "on" a domain when its hostname equals the domain or is a sub-domain of it.
 */
export const TRUSTED_SITES = new Map([
  // --- Tier: TOP (editorially rigorous; includes the user's paid subscriptions) ---
  ["cooking.nytimes.com", { name: "NYT Cooking", tier: TIER.TOP }],
  ["epicurious.com", { name: "Epicurious", tier: TIER.TOP }],
  ["americastestkitchen.com", { name: "America's Test Kitchen", tier: TIER.TOP }],
  ["cooksillustrated.com", { name: "Cook's Illustrated", tier: TIER.TOP }],
  ["cookscountry.com", { name: "Cook's Country", tier: TIER.TOP }],
  ["seriouseats.com", { name: "Serious Eats", tier: TIER.TOP }],
  ["bonappetit.com", { name: "Bon Appétit", tier: TIER.TOP }],
  ["food52.com", { name: "Food52", tier: TIER.TOP }],
  ["kingarthurbaking.com", { name: "King Arthur Baking", tier: TIER.TOP }],
  ["smittenkitchen.com", { name: "Smitten Kitchen", tier: TIER.TOP }],
  ["thekitchn.com", { name: "The Kitchn", tier: TIER.TOP }],

  // --- Tier: STRONG (large, reputable, professionally edited) ---
  ["foodnetwork.com", { name: "Food Network", tier: TIER.STRONG }],
  ["foodandwine.com", { name: "Food & Wine", tier: TIER.STRONG }],
  ["simplyrecipes.com", { name: "Simply Recipes", tier: TIER.STRONG }],
  ["eatingwell.com", { name: "EatingWell", tier: TIER.STRONG }],
  ["bbcgoodfood.com", { name: "BBC Good Food", tier: TIER.STRONG }],
  ["saveur.com", { name: "Saveur", tier: TIER.STRONG }],
  ["splendidtable.org", { name: "The Splendid Table", tier: TIER.STRONG }],
  ["marthastewart.com", { name: "Martha Stewart", tier: TIER.STRONG }],
  ["allrecipes.com", { name: "Allrecipes", tier: TIER.STRONG }],
  ["delish.com", { name: "Delish", tier: TIER.STRONG }],
  ["tasteofhome.com", { name: "Taste of Home", tier: TIER.STRONG }],
  ["food.com", { name: "Food.com", tier: TIER.STRONG }],

  // --- Tier: GOOD (well-known author/publisher sites that republish cookbooks) ---
  ["ottolenghi.co.uk", { name: "Ottolenghi", tier: TIER.GOOD }],
  ["davidlebovitz.com", { name: "David Lebovitz", tier: TIER.GOOD }],
  ["101cookbooks.com", { name: "101 Cookbooks", tier: TIER.GOOD }],
  ["cookieandkate.com", { name: "Cookie and Kate", tier: TIER.GOOD }],
  ["minimalistbaker.com", { name: "Minimalist Baker", tier: TIER.GOOD }],
  ["loveandlemons.com", { name: "Love and Lemons", tier: TIER.GOOD }],
  ["budgetbytes.com", { name: "Budget Bytes", tier: TIER.GOOD }],
  ["onceuponachef.com", { name: "Once Upon a Chef", tier: TIER.GOOD }],
  ["sallysbakingaddiction.com", { name: "Sally's Baking Addiction", tier: TIER.GOOD }],
  ["halfbakedharvest.com", { name: "Half Baked Harvest", tier: TIER.GOOD }],
]);

/**
 * Domains the user holds a paid subscription to. A recipe that is reachable but
 * sits behind a login/paywall on one of these is still a valid match (the user
 * can open it); on any other site a paywall disqualifies the match.
 */
export const ALLOWED_PAYWALL_DOMAINS = new Set([
  "cooking.nytimes.com",
  "nytimes.com",
  "epicurious.com",
  "americastestkitchen.com",
  "cooksillustrated.com",
  "cookscountry.com",
]);

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

/** True when `hostname` equals `domain` or is a sub-domain of it. */
function hostMatchesDomain(hostname, domain) {
  const h = normalizeHost(hostname);
  return h === domain || h.endsWith(`.${domain}`);
}

/** The matching trusted-site entry for a hostname, or null. */
export function trustedSiteFor(hostname) {
  const h = normalizeHost(hostname);
  if (!h) return null;
  for (const [domain, meta] of TRUSTED_SITES) {
    if (hostMatchesDomain(h, domain)) return { domain, ...meta };
  }
  return null;
}

export function isTrustedDomain(hostname) {
  return trustedSiteFor(hostname) !== null;
}

export function reputationTier(hostname) {
  return trustedSiteFor(hostname)?.tier ?? 0;
}

export function isAllowedPaywall(hostname) {
  const h = normalizeHost(hostname);
  for (const domain of ALLOWED_PAYWALL_DOMAINS) {
    if (hostMatchesDomain(h, domain)) return true;
  }
  return false;
}

/** The plain domain list handed to Claude's web_search `allowed_domains`. */
export function allowedSearchDomains() {
  return [...TRUSTED_SITES.keys()];
}
