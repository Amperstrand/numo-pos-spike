/**
 * Venue config for the Burgermeister Mehringdamm demo.
 * The spike shipped as a fictional Norwegian trattoria (VAT 25%);
 * Burgermeister is a German venue — eat-in restaurant VAT is 19%.
 */
export const VAT_RATE_PERCENT = 19;

export const RESTAURANT = {
  name: "Burgermeister Mehringdamm",
  tagline: "Burgers from the iconic U-Bahn arches · paid in Bitcoin, cooked in Kreuzberg",
  currency: "EUR",
} as const;
