// tiers.js — single source of truth for the grading system.
// <=75  -> white   (fifa_card tier-white.png)
// 76-85 -> red     (tier-red.png)
// 86-95 -> gold    (tier-gold.png)
// 96+   -> black   (tier-black.png)
function tierForRating(rating) {
  const r = Number(rating);
  if (r >= 96) return 'black';
  if (r >= 86) return 'gold';
  if (r >= 76) return 'red';
  return 'white';
}

const TIER_IMAGE = {
  white: 'assets/tier-white.png',
  red: 'assets/tier-red.png',
  gold: 'assets/tier-gold.png',
  black: 'assets/tier-black.png',
};

module.exports = { tierForRating, TIER_IMAGE };
