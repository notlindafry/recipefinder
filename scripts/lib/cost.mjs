// Cost estimation for the link finder: token + web-search pricing. Used both to
// enforce the --budget cap and to print the projected full-run cost. Prices are
// the published per-MTok token rates and the web-search rate (USD).

export const PRICES = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
export const WEB_SEARCH_PER_1K = 10; // USD per 1,000 web searches

/**
 * Dollar cost of accumulated usage at the given model's published prices.
 * @param {{input:number, output:number, searches:number}} usage
 * @returns {{inCost:number, outCost:number, searchCost:number, total:number}}
 */
export function usageCost(usage, model) {
  const price = PRICES[model] || PRICES["claude-sonnet-4-6"];
  const inCost = (usage.input / 1e6) * price.in;
  const outCost = (usage.output / 1e6) * price.out;
  const searchCost = (usage.searches / 1000) * WEB_SEARCH_PER_1K;
  return { inCost, outCost, searchCost, total: inCost + outCost + searchCost };
}

/** Print a measured cost breakdown for this run and project it to all eligible rows. */
export function reportCost(usage, eligible, model) {
  if (usage.counted === 0) return;
  const { inCost, outCost, searchCost, total } = usageCost(usage, model);
  const perRecipe = total / usage.counted;

  console.log(`\nCost (measured over ${usage.counted} recipe(s), model ${model}):`);
  console.log(`  web searches: ${usage.searches}  ($${searchCost.toFixed(2)})`);
  console.log(`  input tokens:  ${usage.input.toLocaleString()}  ($${inCost.toFixed(2)})`);
  console.log(`  output tokens: ${usage.output.toLocaleString()}  ($${outCost.toFixed(2)})`);
  console.log(`  this run: $${total.toFixed(2)}  ·  ~$${perRecipe.toFixed(3)}/recipe`);
  console.log(
    `  → projected for all ${eligible} un-linked recipe(s): ~$${(perRecipe * eligible).toFixed(2)}`,
  );
  if (!PRICES[model]) {
    console.log(`  (unrecognized model — priced as claude-sonnet-4-6; adjust if needed)`);
  }
  const price = PRICES[model] || PRICES["claude-sonnet-4-6"];
  console.log(
    `  basis: web search $${WEB_SEARCH_PER_1K}/1k searches; tokens $${price.in}/$${price.out} per MTok in/out.`,
  );
}
