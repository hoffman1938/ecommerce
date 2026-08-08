/**
 * Generated product artwork.
 *
 * The catalogue ships no photography: real brand imagery is licensed, and
 * hotlinking it would make the demo depend on third-party URLs that rot. What
 * this module produces instead is a per-product studio still — a recognisable
 * garment silhouette in the variant's actual colourway on a neutral backdrop —
 * so a grid of products reads as a shop rather than as a wall of colour swatches
 * with text stamped on them.
 *
 * Swapping in real photography later means replacing the `url` written by the
 * seed (packages/database/src/seed/catalog.ts) with an R2/S3 object URL; nothing
 * downstream cares where the image came from.
 *
 * Output is a plain SVG string so both consumers can use it: the seed uploads it
 * to object storage, the static demo inlines it as a data URI.
 */

import type { ProductShape } from './spec';

export const COLOR_HEX: Record<string, string> = {
  Black: '#23262b',
  White: '#f2f2ef',
  Red: '#b8332f',
  Blue: '#2f5aa8',
  Navy: '#22314e',
  Green: '#3a6147',
  Grey: '#8b9096',
  Beige: '#cbb99b',
  Pink: '#d99aa8',
  Orange: '#c8632c',
};

/** Backdrop tones, kept close together so the grid stays calm. */
const BACKDROP = '#efedea';
const BACKDROP_DARK = '#e6e3df';
const SHADOW = 'rgba(35, 38, 43, 0.10)';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mix a hex colour toward black (amount < 0) or white (amount > 0). */
function shift(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const num = parseInt(
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value,
    16,
  );
  const target = amount > 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  const channel = (offset: number): number => {
    const base = (num >> offset) & 0xff;
    return Math.round(base + (target - base) * ratio);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

interface Palette {
  /** The garment colour itself. */
  main: string;
  /** A darker tone for panels, soles and shadowed folds. */
  shade: string;
  /** A hairline that stays visible on both light and dark colourways. */
  line: string;
  /** Small hardware/branding accents. */
  accent: string;
}

function paletteFor(color: string): Palette {
  const main = COLOR_HEX[color] ?? '#9ca3af';
  const isLight = color === 'White' || color === 'Beige' || color === 'Grey' || color === 'Pink';
  return {
    main,
    shade: shift(main, isLight ? -0.12 : -0.22),
    line: isLight ? shift(main, -0.35) : shift(main, 0.28),
    accent: isLight ? shift(main, -0.5) : shift(main, 0.45),
  };
}

/**
 * Product tiles are 4:5 throughout the storefront and crop with `object-cover`,
 * so the canvas matches that ratio — a square would have its top and bottom
 * sliced off. Silhouettes are still authored in a square 800×800 space and
 * translated into the taller canvas, which keeps the path data readable.
 */
const CANVAS_W = 800;
const CANVAS_H = 1000;
/**
 * Maps the square authoring space onto the taller canvas: recentres (400,400)
 * on the canvas centre and scales up, so the subject fills roughly 70% of the
 * frame the way a product shot would, instead of floating in dead space.
 */
const SHAPE_TRANSFORM = `translate(${CANVAS_W / 2} ${CANVAS_H / 2}) scale(1.3) translate(-400 -400)`;

/**
 * Silhouettes. Each returns SVG markup drawn inside an 800×800 space, roughly
 * filling the 150..650 band so every product sits at a consistent scale.
 */
const SHAPES: Record<ProductShape, (p: Palette) => string> = {
  tee: (p) => `
    <path d="M287 232 L357 196 Q400 236 443 196 L513 232 L586 296 L534 352 L512 330 L512 618 Q400 636 288 618 L288 330 L266 352 L214 296 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M357 196 Q400 236 443 196" fill="none" stroke="${p.line}" stroke-width="3"/>
    <path d="M288 592 Q400 610 512 592" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.6"/>`,

  polo: (p) => `
    <path d="M287 232 L352 198 L400 250 L448 198 L513 232 L586 296 L534 352 L512 330 L512 618 Q400 636 288 618 L288 330 L266 352 L214 296 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M352 198 L400 250 L448 198" fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M400 250 L400 336" stroke="${p.line}" stroke-width="3"/>
    <circle cx="400" cy="278" r="5" fill="${p.accent}"/>
    <circle cx="400" cy="312" r="5" fill="${p.accent}"/>`,

  // Long-sleeve silhouette shared by hoodies and jackets: shoulders across the
  // top, sleeves angling out to the cuffs, straight body below the armholes.
  hoodie: (p) => `
    <path d="M262 250 L344 206 Q400 246 456 206 L538 250 L610 306 L640 514 L566 530 L528 358 L528 638 Q400 654 272 638 L272 358 L234 530 L160 514 L190 306 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M338 200 Q400 292 462 200 Q436 172 400 170 Q364 172 338 200 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M330 494 L470 494 L458 578 L342 578 Z" fill="none" stroke="${p.line}" stroke-width="3"/>
    <path d="M370 252 L366 322" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/>
    <path d="M430 252 L434 322" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/>
    <path d="M566 530 L640 514 M234 530 L160 514" stroke="${p.line}" stroke-width="3"/>
    <path d="M272 618 Q400 634 528 618" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.6"/>`,

  jacket: (p) => `
    <path d="M262 250 L348 204 L400 250 L452 204 L538 250 L610 306 L640 514 L566 530 L528 358 L528 638 L272 638 L272 358 L234 530 L160 514 L190 306 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M348 204 L400 250 L452 204 L452 232 L400 276 L348 232 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M400 258 L400 638" stroke="${p.line}" stroke-width="4"/>
    <path d="M284 388 L516 388 M284 470 L516 470 M284 552 L516 552"
          stroke="${p.line}" stroke-width="2" opacity="0.4"/>
    <rect x="392" y="282" width="16" height="26" rx="4" fill="${p.accent}"/>
    <path d="M566 530 L640 514 M234 530 L160 514" stroke="${p.line}" stroke-width="3"/>
    <path d="M272 610 L528 610" stroke="${p.line}" stroke-width="3" opacity="0.6"/>`,

  pants: (p) => `
    <path d="M300 196 L500 196 L516 258 L508 636 L424 636 L400 392 L376 636 L292 636 L284 258 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M292 250 L508 250" stroke="${p.line}" stroke-width="3"/>
    <path d="M300 196 L500 196 L505 232 L295 232 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="3"/>
    <path d="M400 392 L400 258" stroke="${p.line}" stroke-width="2" opacity="0.5"/>`,

  shorts: (p) => `
    <path d="M292 214 L508 214 L522 272 L512 496 L424 496 L400 356 L376 496 L288 496 L278 272 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M292 214 L508 214 L512 254 L288 254 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="3"/>
    <path d="M356 232 L444 232" stroke="${p.accent}" stroke-width="4" stroke-linecap="round"/>`,

  // Shoes are drawn in side profile, toe left / heel right, so the upper,
  // midsole and outsole stay legible at product-card size.
  sneaker: (p) => `
    <path d="M158 474 Q156 434 198 420 L318 400 L390 348 Q418 328 444 344 L468 366 L502 360 Q544 346 570 342 L616 338 Q644 344 642 390 L640 474 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M158 474 L642 474 L642 508 Q642 516 630 516 L170 516 Q158 516 158 508 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M164 516 L636 516 Q652 516 652 534 Q652 552 632 552 L172 552 Q150 552 150 534 Q150 516 164 516 Z"
          fill="${shift('#23262b', 0.1)}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M158 452 Q220 424 300 420" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.7"/>
    <path d="M390 348 L444 344" stroke="${p.line}" stroke-width="3"/>
    <path d="M352 396 L392 372 M366 416 L406 392 M380 436 L420 412"
          stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <path d="M300 466 Q400 430 500 404" fill="none" stroke="${p.accent}" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
    <path d="M578 350 Q600 410 598 474" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.7"/>`,

  runner: (p) => `
    <path d="M158 452 Q156 410 200 396 L316 374 L388 318 Q418 296 446 314 L470 340 L506 332 Q548 316 576 312 L620 308 Q650 314 648 364 L646 452 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M152 452 L650 452 Q662 452 660 478 L654 512 Q652 524 634 524 L166 524 Q148 524 146 508 L146 472 Q146 452 152 452 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M160 524 L640 524 Q660 524 660 542 Q660 560 638 560 L168 560 Q146 560 146 542 Q146 524 160 524 Z"
          fill="${shift('#23262b', 0.1)}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M200 488 L610 488" stroke="${p.line}" stroke-width="2" opacity="0.45"/>
    <path d="M388 318 L446 314" stroke="${p.line}" stroke-width="3"/>
    <path d="M348 368 L390 342 M362 390 L404 364 M376 412 L418 386"
          stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <path d="M286 442 Q400 402 512 376" fill="none" stroke="${p.accent}" stroke-width="8" stroke-linecap="round" opacity="0.85"/>
    <path d="M582 320 Q606 384 604 452" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.7"/>`,

  boot: (p) => `
    <path d="M404 200 Q408 186 428 186 L580 186 Q602 186 604 206 L620 372 Q650 384 648 424 L646 470 L158 470 Q156 428 200 414 L322 392 Q372 340 388 292 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M404 200 Q408 186 428 186 L580 186 Q602 186 604 206 L608 240 L410 240 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M152 470 L650 470 Q664 470 662 498 L656 526 Q654 538 636 538 L166 538 Q148 538 146 522 L146 490 Q146 470 152 470 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M160 538 L642 538 Q664 538 664 558 Q664 578 640 578 L168 578 Q144 578 144 558 Q144 538 160 538 Z"
          fill="${shift('#23262b', 0.1)}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M186 560 L640 560" stroke="${BACKDROP}" stroke-width="3" opacity="0.35"/>
    <path d="M428 286 L586 286 M424 330 L594 330 M416 374 L604 374"
          stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <path d="M330 388 Q374 336 392 288" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.7"/>`,

  backpack: (p) => `
    <path d="M330 176 Q400 142 470 176" fill="none" stroke="${p.line}" stroke-width="10" stroke-linecap="round"/>
    <path d="M252 300 Q252 208 400 208 Q548 208 548 300 L548 604 Q548 636 512 636 L288 636 Q252 636 252 604 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M252 396 L548 396" stroke="${p.line}" stroke-width="3"/>
    <path d="M296 444 Q400 430 504 444 L504 588 Q400 600 296 588 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M296 300 L504 300" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="400" cy="516" r="16" fill="none" stroke="${p.accent}" stroke-width="5"/>`,

  'shoulder-bag': (p) => `
    <path d="M262 330 Q262 176 400 176 Q538 176 538 330" fill="none" stroke="${p.line}" stroke-width="11" stroke-linecap="round"/>
    <path d="M212 330 L588 330 Q604 330 602 350 L578 600 Q574 626 546 626 L254 626 Q226 626 222 600 L198 350 Q196 330 212 330 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M212 330 L588 330 L582 396 L218 396 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="3"/>
    <rect x="374" y="440" width="52" height="34" rx="6" fill="${p.accent}"/>`,

  cap: (p) => `
    <path d="M206 456 Q200 268 400 268 Q600 268 594 456 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M594 456 Q690 462 700 508 Q702 528 668 528 L206 528 L206 456 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M400 268 L400 456 M300 292 Q288 380 292 456 M500 292 Q512 380 508 456"
          stroke="${p.line}" stroke-width="2" opacity="0.5" fill="none"/>
    <circle cx="400" cy="284" r="11" fill="${p.accent}"/>`,

  belt: (p) => `
    <path d="M196 356 L512 356 Q536 356 536 400 Q536 444 512 444 L196 444 Q172 444 172 400 Q172 356 196 356 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="516" y="330" width="112" height="140" rx="16" fill="none" stroke="${p.accent}" stroke-width="14"/>
    <path d="M556 330 L556 470" stroke="${p.accent}" stroke-width="10"/>
    <circle cx="260" cy="400" r="9" fill="${p.shade}"/>
    <circle cx="320" cy="400" r="9" fill="${p.shade}"/>
    <circle cx="380" cy="400" r="9" fill="${p.shade}"/>`,

  socks: (p) => `
    <path d="M262 200 L360 200 L360 430 Q360 470 322 486 L246 518 Q206 532 192 496 Q178 460 214 442 L262 420 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M440 200 L538 200 L538 430 Q538 470 500 486 L424 518 Q384 532 370 496 Q356 460 392 442 L440 420 Z"
          fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M262 246 L360 246 M440 246 L538 246" stroke="${p.accent}" stroke-width="7"/>`,

  wallet: (p) => `
    <path d="M212 268 Q212 244 240 244 L560 244 Q588 244 588 268 L588 532 Q588 556 560 556 L240 556 Q212 556 212 532 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M212 400 L588 400" stroke="${p.line}" stroke-width="3"/>
    <path d="M268 300 L420 300" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <rect x="452" y="440" width="96" height="66" rx="8" fill="${p.shade}" stroke="${p.line}" stroke-width="3"/>`,

  scarf: (p) => `
    <path d="M264 168 Q400 236 536 168 L536 262 Q400 330 264 262 Z"
          fill="${p.main}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M304 262 L400 262 L400 620 L304 620 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="3"/>
    <path d="M400 262 L496 262 L496 578 L400 578 Z" fill="${p.main}" stroke="${p.line}" stroke-width="3"/>
    <path d="M304 340 L400 340 M400 340 L496 340 M304 420 L400 420 M400 420 L496 420 M304 500 L400 500 M400 500 L496 500"
          stroke="${p.line}" stroke-width="2" opacity="0.45"/>`,
};

export interface ProductArtworkInput {
  shape: ProductShape;
  color: string;
  brandName: string;
  productName: string;
}

/**
 * A studio still for one colourway. The brand and colour are set as accessible
 * metadata (`<title>`/`<desc>`) rather than stamped across the artwork, so the
 * image reads as a product shot instead of a label.
 */
export function productArtworkSvg(input: ProductArtworkInput): string {
  const palette = paletteFor(input.color);
  const draw = SHAPES[input.shape] ?? SHAPES.tee;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" ` +
    `viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" role="img" ` +
    `aria-label="${escapeXml(`${input.productName} in ${input.color}`)}">` +
    `<title>${escapeXml(`${input.brandName} ${input.productName} — ${input.color}`)}</title>` +
    `<defs><radialGradient id="bd" cx="50%" cy="42%" r="72%">` +
    `<stop offset="0" stop-color="${BACKDROP}"/><stop offset="1" stop-color="${BACKDROP_DARK}"/>` +
    `</radialGradient></defs>` +
    `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#bd)"/>` +
    `<g transform="${SHAPE_TRANSFORM}">` +
    // A single soft contact shadow grounds the object without faking a scene.
    `<ellipse cx="400" cy="692" rx="196" ry="26" fill="${SHADOW}"/>` +
    draw(palette) +
    `</g>` +
    `</svg>`
  );
}

/**
 * Campaign cover. Deliberately typographic and flat — the product grid directly
 * beneath it carries the colour, so a loud gradient banner would only compete.
 */
export function campaignArtworkSvg(title: string, kicker = 'Limited stock. Limited time.'): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500" role="img" ` +
    `aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect width="1200" height="500" fill="#1b1d21"/>` +
    // Quiet diagonal rules instead of a gradient wash.
    `<g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1">` +
    Array.from(
      { length: 18 },
      (_, i) => `<path d="M${i * 96 - 240} 500 L${i * 96 + 120} 0"/>`,
    ).join('') +
    `</g>` +
    `<rect x="72" y="72" width="1056" height="356" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>` +
    `<text x="120" y="252" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" fill="#f6f5f3">${escapeXml(title)}</text>` +
    `<text x="122" y="308" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="3" fill="#a8a29b">${escapeXml(kicker.toUpperCase())}</text>` +
    `</svg>`
  );
}

/** `productArtworkSvg` packed as a data URI, for the static demo build. */
export function productArtworkDataUri(input: ProductArtworkInput): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(productArtworkSvg(input))}`;
}

export function campaignArtworkDataUri(title: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(campaignArtworkSvg(title))}`;
}
