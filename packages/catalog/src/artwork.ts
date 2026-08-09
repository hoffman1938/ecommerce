/**
 * Generated product artwork.
 *
 * The catalogue ships no photography: real brand imagery is licensed, and
 * hotlinking it would make the demo depend on third-party URLs that rot. What
 * this module produces instead is a per-colourway studio still — a garment
 * rendered with real volume, fabric shading, seams and stitching on a neutral
 * sweep — so a grid of products reads as a shop rather than as a wall of
 * clip-art silhouettes.
 *
 * Two properties matter more than photographic realism and are why generated
 * art is the right call here: every colourway is *exactly* the colour the
 * variant says it is, and every product is lit and framed identically. A pile
 * of scraped stock photography gives up both.
 *
 * Three views are produced per colourway — `front`, `back` and `detail` — so
 * the product gallery and its zoom viewer have genuine content to show. The
 * micro-detail (stitch runs, ribbing, weave) is drawn at full fidelity always;
 * it simply resolves as texture at card size and becomes legible in `detail`.
 *
 * Rendering is deliberately filter-free. A grid of 24 cards each running
 * feGaussianBlur is measurably slow to rasterise, so all soft shading is done
 * with gradient stops, which cost nothing.
 *
 * Swapping in real photography later means replacing the `url` written by the
 * seed (packages/database/src/seed/catalog.ts) with an R2/S3 object URL;
 * nothing downstream cares where the image came from.
 *
 * Output is a plain SVG string so both consumers can use it: the seed uploads
 * it to object storage, the static demo inlines it as a data URI.
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

/** Studio sweep tones. Kept close together so a grid of tiles stays calm. */
const SWEEP_TOP = '#f4f2ef';
const SWEEP_BOTTOM = '#e4e0da';

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

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  return (0.299 * ((num >> 16) & 0xff) + 0.587 * ((num >> 8) & 0xff) + 0.114 * (num & 0xff)) / 255;
}

interface Palette {
  /** The garment colour as specified. */
  base: string;
  /** Lit face — where the key light falls. */
  light: string;
  /** Brightest sheen, used sparingly on folds that catch the light. */
  sheen: string;
  /** Shadowed face. */
  dark: string;
  /** Deepest core shadow, for cavities like a hood interior or a pocket. */
  deep: string;
  /** Edge tone. Never black — a hard outline is what makes vector art read as clip art. */
  line: string;
  /** Contrast stitching. */
  stitch: string;
  /** Hardware: zips, eyelets, buckles. */
  metal: string;
  /** Whether the fabric is pale, which flips how shading has to be applied. */
  pale: boolean;
}

function paletteFor(color: string): Palette {
  const base = COLOR_HEX[color] ?? '#9ca3af';
  const lum = luminance(base);
  const pale = lum > 0.62;

  // Pale fabrics need shading pushed down rather than highlights pushed up. The
  // studio sweep is itself near-white, so a white garment lit with a white
  // highlight dissolves into the backdrop and loses its silhouette entirely —
  // pale colourways get almost no lift and a much deeper shadow range instead.
  return {
    base,
    light: pale ? shift(base, 0.04) : shift(base, 0.16),
    sheen: pale ? shift(base, 0.16) : shift(base, 0.32),
    dark: pale ? shift(base, -0.15) : shift(base, -0.24),
    deep: pale ? shift(base, -0.32) : shift(base, -0.42),
    line: pale ? shift(base, -0.4) : shift(base, -0.45),
    stitch: pale ? shift(base, -0.42) : shift(base, 0.26),
    metal: pale ? '#928d84' : shift(base, 0.42),
    pale,
  };
}

/**
 * Product tiles are 4:5 throughout the storefront and crop with `object-cover`,
 * so the canvas matches that ratio. Garments are authored in a square 1000×1000
 * space and translated into the taller canvas, which keeps path data readable.
 */
const CANVAS_W = 1000;
const CANVAS_H = 1250;

/**
 * Puts the authoring-space point (`focusX`, `focusY`) at the centre of the
 * canvas at the given scale. Framing a view is then just "what should this shot
 * be centred on, and how close", which is how the crops below are specified.
 */
function shapeTransform(scale: number, focusX: number, focusY: number): string {
  return `translate(${CANVAS_W / 2} ${CANVAS_H / 2}) scale(${scale}) translate(${-focusX} ${-focusY})`;
}

export type ProductView = 'front' | 'back' | 'detail';

interface DrawContext {
  p: Palette;
  view: ProductView;
  /** True when drawing the reverse of the garment. */
  back: boolean;
}

type Draw = (ctx: DrawContext) => string;

// --- Shared drawing helpers -------------------------------------------------

/** A run of contrast stitching along a path. */
function stitch(d: string, p: Palette, width = 2.4, dash = '9 7', opacity = 0.55): string {
  return `<path d="${d}" fill="none" stroke="${p.stitch}" stroke-width="${width}" stroke-dasharray="${dash}" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** A seam — a pressed fold, drawn as a soft dark line rather than an outline. */
function seam(d: string, p: Palette, width = 3, opacity = 0.4): string {
  return `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** Knit ribbing, used on cuffs, collars and waistbands. */
function ribbing(
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  step = 11,
  rx = 4,
): string {
  const lines: string[] = [];
  for (let i = x + step; i < x + w; i += step) {
    lines.push(`M${i} ${y + 3} L${i} ${y + h - 3}`);
  }
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${p.dark}" opacity="0.9"/>` +
    `<path d="${lines.join(' ')}" stroke="${p.deep}" stroke-width="1.6" opacity="0.45"/>`
  );
}

/**
 * Gradient definitions every garment shares. Authored once per document; ids
 * are stable because each SVG is its own document inside an <img>.
 */
function fabricDefs(p: Palette): string {
  return (
    `<defs>` +
    // Studio sweep: light falls from upper-left, floor darkens toward the base.
    `<linearGradient id="sweep" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${SWEEP_TOP}"/>` +
    `<stop offset="0.62" stop-color="${SWEEP_TOP}"/>` +
    `<stop offset="1" stop-color="${SWEEP_BOTTOM}"/>` +
    `</linearGradient>` +
    `<radialGradient id="vignette" cx="50%" cy="40%" r="78%">` +
    `<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0.07"/>` +
    `</radialGradient>` +
    // Contact shadow under the garment.
    `<radialGradient id="contact" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0" stop-color="#2a2723" stop-opacity="0.26"/>` +
    `<stop offset="0.6" stop-color="#2a2723" stop-opacity="0.1"/>` +
    `<stop offset="1" stop-color="#2a2723" stop-opacity="0"/>` +
    `</radialGradient>` +
    // Body volume: lit shoulder, mid body, shadowed opposite edge.
    `<linearGradient id="body" x1="0.1" y1="0" x2="0.95" y2="1">` +
    `<stop offset="0" stop-color="${p.light}"/>` +
    `<stop offset="0.42" stop-color="${p.base}"/>` +
    `<stop offset="1" stop-color="${p.dark}"/>` +
    `</linearGradient>` +
    // Panels that face away from the key light.
    `<linearGradient id="panel" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="${p.base}"/>` +
    `<stop offset="1" stop-color="${p.deep}"/>` +
    `</linearGradient>` +
    // A vertical fold: bright crest falling to shadow on both sides.
    `<linearGradient id="fold" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0.16"/>` +
    `<stop offset="0.45" stop-color="#ffffff" stop-opacity="0.09"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0.14"/>` +
    `</linearGradient>` +
    // Soft shadow cast into the garment from a sleeve or hem.
    `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<linearGradient id="shadeUp" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0.2"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</linearGradient>` +
    // Rubber/leather gets a tighter, glossier falloff than woven fabric.
    `<linearGradient id="gloss" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="${p.sheen}" stop-opacity="0.55"/>` +
    `<stop offset="0.3" stop-color="${p.base}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<linearGradient id="sole" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fbfbfa"/>` +
    `<stop offset="0.55" stop-color="#eceae6"/>` +
    `<stop offset="1" stop-color="#cdc9c2"/>` +
    `</linearGradient>` +
    `<linearGradient id="outsole" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#4a4a4c"/>` +
    `<stop offset="1" stop-color="#26262a"/>` +
    `</linearGradient>` +
    // Weave, only legible when the detail view magnifies it.
    `<pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">` +
    `<path d="M0 0 L0 8" stroke="#000000" stroke-opacity="0.05" stroke-width="3"/>` +
    `</pattern>` +
    `</defs>`
  );
}

/** The studio ground: sweep, vignette and the shadow the product sits in. */
function studio(): string {
  return (
    `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#sweep)"/>` +
    `<ellipse cx="${CANVAS_W / 2}" cy="${CANVAS_H * 0.845}" rx="${CANVAS_W * 0.34}" ry="46" fill="url(#contact)"/>` +
    `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#vignette)"/>`
  );
}

/**
 * Wraps garment markup in the weave overlay and a silhouette edge.
 *
 * The edge is not decoration: the studio sweep is near-white, so without it a
 * white or beige garment dissolves into the backdrop and loses its shape
 * entirely. It is drawn in a darkened tone of the fabric rather than in black,
 * which is the difference between a product shot and a coloured-in icon.
 */
function woven(body: string, clip: string, p: Palette): string {
  return (
    body +
    `<path d="${clip}" fill="url(#weave)"/>` +
    `<path d="${clip}" fill="url(#fold)" opacity="0.5"/>` +
    `<path d="${clip}" fill="none" stroke="${p.line}" stroke-width="${p.pale ? 3 : 2}" ` +
    `stroke-linejoin="round" opacity="${p.pale ? 0.5 : 0.3}"/>`
  );
}

/** The same silhouette edge for hard goods, which are not drawn through `woven`. */
function edge(d: string, p: Palette): string {
  return (
    `<path d="${d}" fill="none" stroke="${p.line}" stroke-width="${p.pale ? 3 : 2}" ` +
    `stroke-linejoin="round" opacity="${p.pale ? 0.5 : 0.3}"/>`
  );
}

// --- Garments ---------------------------------------------------------------

/*
 * Every silhouette is drawn in a 1000×1000 space, roughly filling the 170..830
 * band so products sit at a consistent scale. Construction order is always:
 * base shape → volume gradient → cast shadows → seams → stitching → hardware.
 */

const TEE_BODY =
  'M352 292 L444 246 Q500 296 556 246 L648 292 L742 372 L676 448 L648 418 L648 770 ' +
  'Q500 794 352 770 L352 418 L324 448 L258 372 Z';

const TEE_BACK =
  'M352 292 L444 250 Q500 286 556 250 L648 292 L742 372 L676 448 L648 418 L648 770 ' +
  'Q500 794 352 770 L352 418 L324 448 L258 372 Z';

const drawTee: Draw = ({ p, back }) => {
  const body = back ? TEE_BACK : TEE_BODY;
  return woven(
    `<path d="${body}" fill="url(#body)"/>` +
      // Sleeves catch the light differently from the body.
      `<path d="M352 292 L258 372 L324 448 L352 418 Z" fill="${p.light}" opacity="0.5"/>` +
      `<path d="M648 292 L742 372 L676 448 L648 418 Z" fill="${p.deep}" opacity="0.32"/>` +
      // Shadow the sleeves cast onto the chest.
      `<path d="M352 292 L352 620 L392 620 L392 300 Z" fill="url(#shade)" opacity="0.5"/>` +
      `<path d="M648 292 L648 620 L608 620 L608 300 Z" fill="url(#shade)" opacity="0.7"/>` +
      // Hem shadow.
      `<path d="M352 700 L648 700 L648 770 Q500 794 352 770 Z" fill="url(#shadeUp)" opacity="0.55"/>` +
      (back
        ? `<path d="M444 250 Q500 286 556 250 Q556 274 500 288 Q444 274 444 250 Z" fill="${p.dark}"/>`
        : `<path d="M444 246 Q500 296 556 246 Q556 276 500 292 Q444 276 444 246 Z" fill="${p.deep}"/>`) +
      // Collar rib.
      `<path d="M${back ? 444 : 444} ${back ? 250 : 246} Q500 ${back ? 286 : 296} 556 ${back ? 250 : 246}" fill="none" stroke="${p.line}" stroke-width="7" stroke-linecap="round" opacity="0.75"/>` +
      seam('M352 418 L352 760', p, 2.5, 0.28) +
      seam('M648 418 L648 760', p, 2.5, 0.28) +
      stitch('M356 752 Q500 774 644 752', p) +
      stitch('M332 430 L358 404', p, 2, '6 5', 0.4) +
      stitch('M668 430 L642 404', p, 2, '6 5', 0.4),
    body,
    p,
  );
};

const POLO_BODY =
  'M352 292 L440 250 L500 320 L560 250 L648 292 L742 372 L676 448 L648 418 L648 770 ' +
  'Q500 794 352 770 L352 418 L324 448 L258 372 Z';

const drawPolo: Draw = ({ p, back }) =>
  woven(
    `<path d="${POLO_BODY}" fill="url(#body)"/>` +
      `<path d="M352 292 L258 372 L324 448 L352 418 Z" fill="${p.light}" opacity="0.5"/>` +
      `<path d="M648 292 L742 372 L676 448 L648 418 Z" fill="${p.deep}" opacity="0.32"/>` +
      `<path d="M648 292 L648 620 L608 620 L608 300 Z" fill="url(#shade)" opacity="0.6"/>` +
      `<path d="M352 700 L648 700 L648 770 Q500 794 352 770 Z" fill="url(#shadeUp)" opacity="0.5"/>` +
      (back
        ? // The reverse of a polo is a plain yoke — no placket, no buttons.
          `<path d="M436 254 Q500 290 564 254 Q564 280 500 296 Q436 280 436 254 Z" fill="${p.dark}"/>` +
          seam('M500 300 L500 760', p, 2, 0.2)
        : // Ribbed collar sitting proud of the body, then the placket.
          `<path d="M440 250 L500 320 L440 330 L424 268 Z" fill="${p.dark}"/>` +
          `<path d="M560 250 L500 320 L560 330 L576 268 Z" fill="${p.light}"/>` +
          `<path d="M472 318 L528 318 L524 452 L476 452 Z" fill="${p.dark}" opacity="0.75"/>` +
          seam('M500 320 L500 452', p, 3, 0.5) +
          `<circle cx="500" cy="356" r="7" fill="${p.metal}" opacity="0.9"/>` +
          `<circle cx="500" cy="410" r="7" fill="${p.metal}" opacity="0.9"/>` +
          stitch('M476 322 L476 450', p, 1.8, '5 4', 0.45) +
          stitch('M524 322 L524 450', p, 1.8, '5 4', 0.45)) +
      seam('M352 418 L352 760', p, 2.5, 0.26) +
      seam('M648 418 L648 760', p, 2.5, 0.26) +
      stitch('M356 752 Q500 774 644 752', p),
    POLO_BODY,
    p,
  );

const HOODIE_BODY =
  'M318 316 L420 262 Q500 312 580 262 L682 316 L772 386 L810 646 L716 666 L662 452 ' +
  'L662 800 Q500 822 338 800 L338 452 L284 666 L190 646 L228 386 Z';

const drawHoodie: Draw = ({ p, back }) =>
  woven(
    `<path d="${HOODIE_BODY}" fill="url(#body)"/>` +
      // Raglan sleeves: the near one lit, the far one in shadow.
      `<path d="M318 316 L228 386 L190 646 L284 666 L338 452 L338 380 Z" fill="${p.light}" opacity="0.42"/>` +
      `<path d="M682 316 L772 386 L810 646 L716 666 L662 452 L662 380 Z" fill="${p.deep}" opacity="0.3"/>` +
      `<path d="M338 380 L338 700 L390 700 L390 390 Z" fill="url(#shade)" opacity="0.45"/>` +
      `<path d="M662 380 L662 700 L610 700 L610 390 Z" fill="url(#shade)" opacity="0.65"/>` +
      (back
        ? // Back of the hood lies flat against the shoulders.
          `<path d="M414 258 Q500 176 586 258 Q586 300 500 316 Q414 300 414 258 Z" fill="url(#panel)"/>` +
          seam('M500 190 L500 314', p, 2.5, 0.35)
        : // Hood: outer shell, then the shadowed interior, then the drawcords.
          `<path d="M410 254 Q500 366 590 254 Q560 186 500 182 Q440 186 410 254 Z" fill="${p.dark}"/>` +
          `<path d="M432 262 Q500 340 568 262 Q544 214 500 210 Q456 214 432 262 Z" fill="${p.deep}"/>` +
          `<path d="M410 254 Q500 366 590 254" fill="none" stroke="${p.line}" stroke-width="6" opacity="0.5"/>` +
          `<circle cx="452" cy="322" r="9" fill="${p.metal}" opacity="0.85"/>` +
          `<circle cx="548" cy="322" r="9" fill="${p.metal}" opacity="0.85"/>` +
          `<path d="M452 330 Q446 392 456 424" fill="none" stroke="${p.sheen}" stroke-width="7" stroke-linecap="round" opacity="0.8"/>` +
          `<path d="M548 330 Q554 392 544 424" fill="none" stroke="${p.sheen}" stroke-width="7" stroke-linecap="round" opacity="0.8"/>` +
          // Kangaroo pocket.
          `<path d="M394 620 L606 620 L590 736 L410 736 Z" fill="${p.dark}" opacity="0.55"/>` +
          seam('M394 620 L606 620', p, 3, 0.5) +
          stitch('M398 628 L602 628', p) +
          stitch('M410 730 L590 730', p)) +
      ribbing(338, 762, 324, 42, p) +
      ribbing(196, 616, 84, 40, p, 9) +
      ribbing(720, 616, 84, 40, p, 9) +
      stitch('M342 452 L342 756', p, 2, '6 6', 0.3) +
      stitch('M658 452 L658 756', p, 2, '6 6', 0.3),
    HOODIE_BODY,
    p,
  );

const JACKET_BODY =
  'M318 316 L424 260 L500 316 L576 260 L682 316 L772 386 L810 646 L716 666 L662 452 ' +
  'L662 800 L338 800 L338 452 L284 666 L190 646 L228 386 Z';

const drawJacket: Draw = ({ p, back }) =>
  woven(
    `<path d="${JACKET_BODY}" fill="url(#body)"/>` +
      `<path d="M318 316 L228 386 L190 646 L284 666 L338 452 L338 380 Z" fill="${p.light}" opacity="0.4"/>` +
      `<path d="M682 316 L772 386 L810 646 L716 666 L662 452 L662 380 Z" fill="${p.deep}" opacity="0.28"/>` +
      `<path d="M662 380 L662 720 L606 720 L606 390 Z" fill="url(#shade)" opacity="0.6"/>` +
      (back
        ? `<path d="M424 264 Q500 300 576 264 Q576 292 500 308 Q424 292 424 264 Z" fill="${p.dark}"/>` +
          // Back yoke seam and centre pleat.
          seam('M338 424 Q500 452 662 424', p, 3, 0.4) +
          stitch('M342 434 Q500 462 658 434', p) +
          seam('M500 452 L500 796', p, 2.5, 0.25)
        : // Stand collar, centre zip, chest and hand pockets.
          `<path d="M424 260 L500 316 L576 260 L580 296 L500 350 L420 296 Z" fill="${p.dark}"/>` +
          `<path d="M424 260 L500 316 L576 260" fill="none" stroke="${p.line}" stroke-width="5" opacity="0.6"/>` +
          `<path d="M486 330 L514 330 L514 800 L486 800 Z" fill="${p.deep}" opacity="0.8"/>` +
          `<path d="M494 336 L506 336 L506 794 L494 794 Z" fill="${p.metal}" opacity="0.75"/>` +
          `<rect x="484" y="318" width="32" height="46" rx="8" fill="${p.metal}" opacity="0.9"/>` +
          `<path d="M366 596 L462 596 L456 626 L372 626 Z" fill="${p.dark}" opacity="0.6"/>` +
          `<path d="M538 596 L634 596 L628 626 L544 626 Z" fill="${p.dark}" opacity="0.6"/>` +
          stitch('M368 602 L458 602', p) +
          stitch('M542 602 L632 602', p) +
          seam('M338 424 L338 796', p, 2.5, 0.25) +
          seam('M662 424 L662 796', p, 2.5, 0.25)) +
      ribbing(338, 764, 324, 36, p) +
      ribbing(196, 618, 84, 36, p, 9) +
      ribbing(720, 618, 84, 36, p, 9),
    JACKET_BODY,
    p,
  );

const PANTS_BODY =
  'M362 250 L638 250 L660 336 L648 820 L534 820 L500 494 L466 820 L352 820 L340 336 Z';

const drawPants: Draw = ({ p, back }) =>
  woven(
    `<path d="${PANTS_BODY}" fill="url(#body)"/>` +
      // Inner leg edges fall away from the light.
      `<path d="M500 494 L534 820 L568 820 L520 494 Z" fill="${p.deep}" opacity="0.35"/>` +
      `<path d="M500 494 L466 820 L432 820 L480 494 Z" fill="${p.dark}" opacity="0.25"/>` +
      `<path d="M340 336 L660 336 L656 420 L344 420 Z" fill="url(#shade)" opacity="0.5"/>` +
      // Waistband.
      `<path d="M362 250 L638 250 L644 322 L356 322 Z" fill="${p.dark}"/>` +
      seam('M356 322 L644 322', p, 3, 0.45) +
      stitch('M360 258 L640 258', p) +
      stitch('M358 314 L642 314', p) +
      (back
        ? `<path d="M406 340 L470 340 L470 400 L406 400 Z" fill="${p.dark}" opacity="0.5"/>` +
          `<path d="M530 340 L594 340 L594 400 L530 400 Z" fill="${p.dark}" opacity="0.5"/>` +
          stitch('M408 346 L468 346', p) +
          stitch('M532 346 L592 346', p)
        : `<path d="M470 250 L530 250 L530 300 L470 300 Z" fill="${p.light}" opacity="0.35"/>` +
          seam('M500 322 L500 494', p, 3, 0.4) +
          `<path d="M366 330 Q396 372 372 430" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.35"/>` +
          `<path d="M634 330 Q604 372 628 430" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.35"/>`) +
      seam('M500 494 L500 340', p, 2, 0.2) +
      stitch('M356 812 L462 812', p, 2, '7 6', 0.35) +
      stitch('M538 812 L644 812', p, 2, '7 6', 0.35),
    PANTS_BODY,
    p,
  );

const SHORTS_BODY =
  'M356 280 L644 280 L666 356 L654 640 L534 640 L500 470 L466 640 L346 640 L334 356 Z';

const drawShorts: Draw = ({ p, back }) =>
  woven(
    `<path d="${SHORTS_BODY}" fill="url(#body)"/>` +
      `<path d="M500 470 L534 640 L572 640 L522 470 Z" fill="${p.deep}" opacity="0.32"/>` +
      `<path d="M334 356 L666 356 L662 430 L338 430 Z" fill="url(#shade)" opacity="0.45"/>` +
      `<path d="M356 280 L644 280 L650 344 L350 344 Z" fill="${p.dark}"/>` +
      seam('M350 344 L650 344', p, 3, 0.45) +
      (back
        ? `<path d="M430 366 L570 366 L570 424 L430 424 Z" fill="${p.dark}" opacity="0.45"/>` +
          stitch('M434 372 L566 372', p)
        : `<path d="M436 292 Q500 312 564 292" fill="none" stroke="${p.sheen}" stroke-width="8" stroke-linecap="round" opacity="0.85"/>` +
          seam('M500 344 L500 470', p, 3, 0.4)) +
      stitch('M340 630 L466 630', p, 2, '7 6', 0.35) +
      stitch('M534 630 L660 630', p, 2, '7 6', 0.35),
    SHORTS_BODY,
    p,
  );

/*
 * Footwear is drawn in side profile, toe left / heel right, which is how
 * catalogue photography shoots it and what stays legible at card size.
 */

const SNEAKER_UPPER =
  'M188 606 Q184 546 246 528 L400 500 L486 432 Q522 404 556 428 L588 458 L636 450 ' +
  'Q694 432 728 428 L784 424 Q820 432 818 494 L816 606 Z';

const drawSneaker: Draw = ({ p, back }) =>
  `<path d="${SNEAKER_UPPER}" fill="url(#body)"/>` +
  `<path d="${SNEAKER_UPPER}" fill="url(#gloss)"/>` +
  `<path d="${SNEAKER_UPPER}" fill="url(#weave)"/>` +
  // Toe box and heel counter are separate panels.
  `<path d="M188 606 Q184 546 246 528 L332 512 L338 606 Z" fill="${p.light}" opacity="0.4"/>` +
  `<path d="M726 428 Q820 432 818 494 L816 606 L722 606 Z" fill="${p.deep}" opacity="0.28"/>` +
  seam('M338 606 L332 512', p, 3, 0.3) +
  seam('M722 606 Q716 500 726 430', p, 3, 0.3) +
  (back
    ? `<path d="M736 452 L800 446 L802 590 L738 590 Z" fill="${p.dark}" opacity="0.4"/>` +
      stitch('M740 460 L798 456', p)
    : // Laces over the throat, plus eyelets.
      `<path d="M486 432 L556 428" stroke="${p.line}" stroke-width="4" opacity="0.5"/>` +
      `<path d="M436 508 L500 470 M452 542 L516 504 M468 576 L532 538" stroke="${p.sheen}" stroke-width="8" stroke-linecap="round" opacity="0.9"/>` +
      `<circle cx="500" cy="470" r="5" fill="${p.metal}"/>` +
      `<circle cx="516" cy="504" r="5" fill="${p.metal}"/>` +
      `<circle cx="532" cy="538" r="5" fill="${p.metal}"/>` +
      // Side stripe.
      `<path d="M374 592 Q500 546 626 508" fill="none" stroke="${p.sheen}" stroke-width="9" stroke-linecap="round" opacity="0.75"/>`) +
  edge(SNEAKER_UPPER, p) +
  // Midsole then outsole.
  `<path d="M188 606 L818 606 L818 648 Q818 658 802 658 L204 658 Q188 658 188 648 Z" fill="url(#sole)"/>` +
  `<path d="M188 606 L818 606 L818 648 Q818 658 802 658 L204 658 Q188 658 188 648 Z" fill="none" stroke="#a9a49c" stroke-width="2" opacity="0.6"/>` +
  `<path d="M196 658 L810 658 Q832 658 832 682 Q832 706 806 706 L208 706 Q182 706 182 682 Q182 658 196 658 Z" fill="url(#outsole)"/>` +
  `<path d="M240 682 L790 682" stroke="#ffffff" stroke-width="2" opacity="0.16"/>` +
  stitch('M196 620 L812 620', p, 2, '8 7', 0.22);

const RUNNER_UPPER =
  'M188 580 Q184 518 250 500 L398 472 L484 404 Q520 376 556 400 L588 432 L638 422 ' +
  'Q698 402 732 398 L788 394 Q826 402 824 468 L822 580 Z';

const drawRunner: Draw = ({ p, back }) =>
  `<path d="${RUNNER_UPPER}" fill="url(#body)"/>` +
  `<path d="${RUNNER_UPPER}" fill="url(#gloss)"/>` +
  `<path d="${RUNNER_UPPER}" fill="url(#weave)"/>` +
  `<path d="M188 580 Q184 518 250 500 L330 486 L336 580 Z" fill="${p.light}" opacity="0.38"/>` +
  `<path d="M730 398 Q826 402 824 468 L822 580 L726 580 Z" fill="${p.deep}" opacity="0.26"/>` +
  (back
    ? `<path d="M740 424 L806 418 L808 566 L742 566 Z" fill="${p.dark}" opacity="0.4"/>` +
      stitch('M744 432 L804 428', p)
    : `<path d="M484 404 L556 400" stroke="${p.line}" stroke-width="4" opacity="0.5"/>` +
      `<path d="M432 480 L498 442 M448 514 L514 476 M464 548 L530 510" stroke="${p.sheen}" stroke-width="8" stroke-linecap="round" opacity="0.9"/>` +
      `<path d="M362 566 Q500 516 634 476" fill="none" stroke="${p.sheen}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>`) +
  edge(RUNNER_UPPER, p) +
  // A running shoe reads as one by its thick, sculpted foam midsole.
  `<path d="M182 580 L824 580 Q846 580 844 622 L836 668 Q832 686 806 686 L200 686 Q176 686 174 662 L176 606 Q176 580 182 580 Z" fill="url(#sole)"/>` +
  `<path d="M182 580 L824 580 Q846 580 844 622 L836 668 Q832 686 806 686 L200 686 Q176 686 174 662 L176 606 Q176 580 182 580 Z" fill="none" stroke="#a9a49c" stroke-width="2" opacity="0.6"/>` +
  `<path d="M200 636 Q500 618 826 632" fill="none" stroke="#b9b4ac" stroke-width="2.5" opacity="0.75"/>` +
  `<path d="M194 686 L812 686 Q838 686 838 710 Q838 734 808 734 L204 734 Q176 734 176 710 Q176 686 194 686 Z" fill="url(#outsole)"/>` +
  `<path d="M250 710 L780 710" stroke="#ffffff" stroke-width="2" opacity="0.16"/>` +
  stitch('M196 596 L818 596', p, 2, '8 7', 0.2);

const BOOT_BODY =
  'M470 246 Q476 226 500 226 L716 226 Q744 226 746 252 L768 470 Q812 486 810 538 ' +
  'L808 596 L188 596 Q184 542 246 524 L398 496 Q464 428 484 364 Z';

const drawBoot: Draw = ({ p, back }) =>
  `<path d="${BOOT_BODY}" fill="url(#body)"/>` +
  `<path d="${BOOT_BODY}" fill="url(#gloss)"/>` +
  `<path d="${BOOT_BODY}" fill="url(#weave)"/>` +
  `<path d="M470 246 Q476 226 500 226 L716 226 Q744 226 746 252 L752 304 L478 304 Z" fill="${p.dark}"/>` +
  seam('M478 304 L752 304', p, 3, 0.4) +
  `<path d="M188 596 Q184 542 246 524 L330 508 L336 596 Z" fill="${p.light}" opacity="0.35"/>` +
  (back
    ? `<path d="M600 330 L740 330 L744 470 L604 470 Z" fill="${p.dark}" opacity="0.4"/>` +
      stitch('M604 338 L740 338', p)
    : // Speed hooks and laces up the shaft.
      `<path d="M508 356 L706 356 M502 404 L716 404 M496 452 L726 452" stroke="${p.sheen}" stroke-width="8" stroke-linecap="round" opacity="0.8"/>` +
      `<circle cx="508" cy="356" r="6" fill="${p.metal}"/><circle cx="706" cy="356" r="6" fill="${p.metal}"/>` +
      `<circle cx="502" cy="404" r="6" fill="${p.metal}"/><circle cx="716" cy="404" r="6" fill="${p.metal}"/>` +
      `<circle cx="496" cy="452" r="6" fill="${p.metal}"/><circle cx="726" cy="452" r="6" fill="${p.metal}"/>` +
      `<path d="M398 496 Q464 428 484 364" fill="none" stroke="${p.line}" stroke-width="4" opacity="0.4"/>`) +
  edge(BOOT_BODY, p) +
  `<path d="M182 596 L808 596 Q830 596 828 638 L820 676 Q816 692 792 692 L200 692 Q176 692 174 668 L176 620 Q176 596 182 596 Z" fill="${p.deep}"/>` +
  `<path d="M190 692 L798 692 Q826 692 826 718 Q826 744 794 744 L200 744 Q172 744 172 718 Q172 692 190 692 Z" fill="url(#outsole)"/>` +
  // Lug tread — the thing that says "hiking boot".
  `<path d="M230 706 L230 730 M290 706 L290 730 M350 706 L350 730 M410 706 L410 730 M470 706 L470 730 M530 706 L530 730 M590 706 L590 730 M650 706 L650 730 M710 706 L710 730 M770 706 L770 730" stroke="#ffffff" stroke-width="4" opacity="0.16"/>` +
  stitch('M196 612 L804 612', p, 2, '8 7', 0.25);

const BACKPACK_BODY =
  'M292 400 Q292 268 500 268 Q708 268 708 400 L708 796 Q708 838 656 838 L344 838 Q292 838 292 796 Z';

const drawBackpack: Draw = ({ p, back }) =>
  woven(
    // Shoulder straps sit behind the body from the front and in front of it
    // from the back, which is the only thing that tells the two views apart.
    (back
      ? ''
      : `<path d="M396 288 Q330 380 336 560" fill="none" stroke="${p.deep}" stroke-width="34" stroke-linecap="round" opacity="0.85"/>` +
        `<path d="M604 288 Q670 380 664 560" fill="none" stroke="${p.deep}" stroke-width="34" stroke-linecap="round" opacity="0.85"/>`) +
      `<path d="${BACKPACK_BODY}" fill="url(#body)"/>` +
      `<path d="M292 400 Q292 268 500 268 L500 838 L344 838 Q292 838 292 796 Z" fill="${p.light}" opacity="0.18"/>` +
      (back
        ? // Reverse: padded back panel with a channel down the spine, then the
          // harness running over it to the load-lifters.
          `<path d="M356 330 L644 330 L644 786 L356 786 Z" fill="${p.dark}" opacity="0.55"/>` +
          `<path d="M420 350 L420 766 M580 350 L580 766" stroke="${p.deep}" stroke-width="26" opacity="0.45" stroke-linecap="round"/>` +
          `<path d="M470 350 L530 350 L530 766 L470 766 Z" fill="${p.deep}" opacity="0.4"/>` +
          `<path d="M424 340 Q372 470 396 690" fill="none" stroke="${p.deep}" stroke-width="42" stroke-linecap="round"/>` +
          `<path d="M576 340 Q628 470 604 690" fill="none" stroke="${p.deep}" stroke-width="42" stroke-linecap="round"/>` +
          `<path d="M424 340 Q372 470 396 690" fill="none" stroke="${p.line}" stroke-width="42" stroke-linecap="round" opacity="0.18"/>` +
          `<rect x="374" y="600" width="44" height="16" rx="4" fill="${p.metal}" opacity="0.8"/>` +
          `<rect x="582" y="600" width="44" height="16" rx="4" fill="${p.metal}" opacity="0.8"/>` +
          stitch('M362 338 L638 338', p) +
          stitch('M362 780 L638 780', p)
        : `<path d="M292 528 L708 528" stroke="${p.line}" stroke-width="4" opacity="0.4"/>` +
          // Front pocket.
          `<path d="M352 586 Q500 570 648 586 L648 764 Q500 782 352 764 Z" fill="${p.dark}" opacity="0.6"/>` +
          stitch('M356 594 Q500 578 644 594', p) +
          // Grab handle and zip pulls.
          `<path d="M448 268 Q500 236 552 268" fill="none" stroke="${p.deep}" stroke-width="16" stroke-linecap="round"/>` +
          `<path d="M320 520 Q500 496 680 520" fill="none" stroke="${p.metal}" stroke-width="5" opacity="0.8"/>` +
          `<rect x="486" y="500" width="28" height="16" rx="6" fill="${p.metal}"/>`) +
      seam('M292 400 Q292 268 500 268 Q708 268 708 400', p, 3, 0.3),
    BACKPACK_BODY,
    p,
  );

const SHOULDER_BAG_BODY =
  'M262 420 L738 420 Q762 420 760 448 L730 762 Q726 796 690 796 L310 796 Q274 796 270 762 L240 448 Q238 420 262 420 Z';

const drawShoulderBag: Draw = ({ p, back }) =>
  woven(
    `<path d="M318 420 Q318 232 500 232 Q682 232 682 420" fill="none" stroke="${p.deep}" stroke-width="26" stroke-linecap="round"/>` +
      `<path d="${SHOULDER_BAG_BODY}" fill="url(#body)"/>` +
      `<path d="M262 420 L500 420 L500 796 L310 796 Q274 796 270 762 L240 448 Q238 420 262 420 Z" fill="${p.light}" opacity="0.16"/>` +
      (back
        ? `<path d="M300 470 L700 470 L690 700 L310 700 Z" fill="${p.dark}" opacity="0.4"/>` +
          stitch('M304 478 L696 478', p)
        : `<path d="M262 420 L738 420 L730 512 L270 512 Z" fill="${p.dark}" opacity="0.55"/>` +
          seam('M270 512 L730 512', p, 3, 0.45) +
          `<rect x="452" y="556" width="96" height="62" rx="10" fill="${p.metal}" opacity="0.9"/>` +
          `<rect x="466" y="570" width="68" height="34" rx="6" fill="${p.deep}" opacity="0.5"/>` +
          stitch('M280 430 L720 430', p)) +
      stitch('M286 776 L714 776', p),
    SHOULDER_BAG_BODY,
    p,
  );

const CAP_CROWN = 'M258 566 Q250 330 500 330 Q750 330 742 566 Z';

const drawCap: Draw = ({ p, back }) =>
  woven(
    `<path d="${CAP_CROWN}" fill="url(#body)"/>` +
      `<path d="M258 566 Q250 330 500 330 L500 566 Z" fill="${p.light}" opacity="0.3"/>` +
      (back
        ? // Reverse: the closure straps, with the gap between them showing the
          // shadowed inside of the crown rather than a hole in the artwork.
          `<path d="M380 462 L620 462 L620 566 L380 566 Z" fill="${p.deep}"/>` +
          `<path d="M380 462 L474 462 L474 566 L380 566 Z" fill="${p.dark}"/>` +
          `<path d="M526 462 L620 462 L620 566 L526 566 Z" fill="${p.dark}"/>` +
          `<rect x="404" y="496" width="66" height="20" rx="5" fill="${p.metal}" opacity="0.85"/>` +
          stitch('M386 470 L468 470', p, 2, '6 5', 0.45) +
          stitch('M532 470 L614 470', p, 2, '6 5', 0.45)
        : // Front: panel seams, crown button, embroidered eyelets.
          `<path d="M500 330 L500 566 M382 348 Q362 460 366 566 M618 348 Q638 460 634 566" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.35"/>` +
          `<circle cx="500" cy="348" r="14" fill="${p.dark}"/>` +
          `<circle cx="422" cy="440" r="5" fill="${p.deep}" opacity="0.6"/>` +
          `<circle cx="578" cy="440" r="5" fill="${p.deep}" opacity="0.6"/>` +
          stitch('M262 552 Q500 528 738 552', p)) +
      // Brim, curved and darker underneath.
      `<path d="M742 566 Q862 574 874 632 Q876 656 834 656 L258 656 L258 566 Z" fill="${p.dark}"/>` +
      `<path d="M742 566 Q862 574 874 632 Q876 656 834 656 L640 656 Q740 620 742 566 Z" fill="${p.deep}" opacity="0.55"/>` +
      stitch('M300 600 Q600 596 836 626', p, 2.4, '9 8', 0.5),
    CAP_CROWN,
    p,
  );

const BELT_STRAP =
  'M228 452 L616 452 Q646 452 646 500 Q646 548 616 548 L228 548 Q198 548 198 500 Q198 452 228 452 Z';

const drawBelt: Draw = ({ p }) =>
  `<path d="${BELT_STRAP}" fill="url(#body)"/>` +
  `<path d="${BELT_STRAP}" fill="url(#gloss)"/>` +
  `<path d="${BELT_STRAP}" fill="url(#weave)"/>` +
  edge(BELT_STRAP, p) +
  stitch('M216 468 L630 468', p, 2.2, '8 7', 0.5) +
  stitch('M216 532 L630 532', p, 2.2, '8 7', 0.5) +
  // Buckle: frame, prong, and the strap end feeding through it.
  `<rect x="640" y="420" width="132" height="160" rx="18" fill="none" stroke="${p.metal}" stroke-width="18"/>` +
  `<path d="M690 420 L690 580" stroke="${p.metal}" stroke-width="12"/>` +
  `<path d="M646 500 L706 500" stroke="${p.metal}" stroke-width="10" stroke-linecap="round"/>` +
  `<circle cx="312" cy="500" r="10" fill="${p.deep}"/>` +
  `<circle cx="384" cy="500" r="10" fill="${p.deep}"/>` +
  `<circle cx="456" cy="500" r="10" fill="${p.deep}"/>`;

const SOCK_LEFT =
  'M316 262 L432 262 L432 546 Q432 594 388 614 L296 654 Q248 674 230 630 Q212 586 256 566 L316 540 Z';
const SOCK_RIGHT =
  'M534 262 L650 262 L650 546 Q650 594 606 614 L514 654 Q466 674 448 630 Q430 586 474 566 L534 540 Z';

const drawSocks: Draw = ({ p }) =>
  `<path d="${SOCK_RIGHT}" fill="url(#body)" opacity="0.85"/>` +
  `<path d="${SOCK_RIGHT}" fill="url(#weave)"/>` +
  `<path d="${SOCK_LEFT}" fill="url(#body)"/>` +
  `<path d="${SOCK_LEFT}" fill="url(#weave)"/>` +
  edge(SOCK_RIGHT, p) +
  edge(SOCK_LEFT, p) +
  ribbing(316, 262, 116, 66, p, 10) +
  ribbing(534, 262, 116, 66, p, 10) +
  `<path d="M256 566 Q300 620 296 654" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.3"/>` +
  `<path d="M474 566 Q518 620 514 654" fill="none" stroke="${p.line}" stroke-width="3" opacity="0.3"/>` +
  stitch('M320 400 L428 400', p, 2.4, '7 6', 0.45) +
  stitch('M538 400 L646 400', p, 2.4, '7 6', 0.45);

const WALLET_BODY =
  'M266 336 Q266 306 300 306 L700 306 Q734 306 734 336 L734 664 Q734 694 700 694 L300 694 Q266 694 266 664 Z';

const drawWallet: Draw = ({ p, back }) =>
  `<path d="${WALLET_BODY}" fill="url(#body)"/>` +
  `<path d="${WALLET_BODY}" fill="url(#gloss)"/>` +
  `<path d="${WALLET_BODY}" fill="url(#weave)"/>` +
  edge(WALLET_BODY, p) +
  (back
    ? seam('M266 500 L734 500', p, 4, 0.4) + stitch('M280 512 L720 512', p)
    : // Card slots, stepped like a real cardholder.
      `<path d="M310 430 L690 430 L690 690 L310 690 Z" fill="${p.dark}" opacity="0.45"/>` +
      `<path d="M310 510 L690 510 L690 690 L310 690 Z" fill="${p.dark}" opacity="0.5"/>` +
      `<path d="M310 590 L690 590 L690 690 L310 690 Z" fill="${p.dark}" opacity="0.55"/>` +
      seam('M310 430 L690 430', p, 3, 0.5) +
      seam('M310 510 L690 510', p, 3, 0.5) +
      seam('M310 590 L690 590', p, 3, 0.5) +
      `<rect x="330" y="346" width="150" height="42" rx="8" fill="${p.deep}" opacity="0.35"/>`) +
  stitch('M286 326 L714 326', p, 2.4, '9 8', 0.5) +
  stitch('M286 674 L714 674', p, 2.4, '9 8', 0.5) +
  stitch('M286 326 L286 674', p, 2.4, '9 8', 0.5) +
  stitch('M714 326 L714 674', p, 2.4, '9 8', 0.5);

const SCARF_BODY = 'M330 214 Q500 300 670 214 L670 336 Q500 422 330 336 Z';
const SCARF_TAIL_L = 'M380 336 L500 336 L500 812 L380 812 Z';
const SCARF_TAIL_R = 'M500 336 L620 336 L620 744 L500 744 Z';

const drawScarf: Draw = ({ p }) => {
  const ribs: string[] = [];
  for (let y = 360; y < 800; y += 26) ribs.push(`M382 ${y} L618 ${y}`);
  return (
    `<path d="${SCARF_TAIL_R}" fill="${p.dark}"/>` +
    `<path d="${SCARF_TAIL_L}" fill="url(#body)"/>` +
    `<path d="${SCARF_BODY}" fill="url(#body)"/>` +
    `<path d="${SCARF_BODY}" fill="url(#weave)"/>` +
    // Chunky rib knit is the whole character of a scarf.
    `<path d="${ribs.join(' ')}" stroke="${p.deep}" stroke-width="3" opacity="0.28"/>` +
    `<path d="M420 336 L420 800 M460 336 L460 800 M540 336 L540 736 M580 336 L580 736" stroke="${p.deep}" stroke-width="5" opacity="0.22"/>` +
    edge(SCARF_TAIL_L, p) +
    edge(SCARF_TAIL_R, p) +
    edge(SCARF_BODY, p) +
    `<path d="M330 214 Q500 300 670 214" fill="none" stroke="${p.line}" stroke-width="5" opacity="0.45"/>` +
    `<path d="M330 336 Q500 422 670 336" fill="none" stroke="${p.line}" stroke-width="5" opacity="0.35"/>` +
    // Fringe.
    `<path d="M390 812 L390 844 M410 812 L410 848 M430 812 L430 840 M450 812 L450 848 M470 812 L470 842 M490 812 L490 846" stroke="${p.dark}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>` +
    `<path d="M510 744 L510 776 M530 744 L530 782 M550 744 L550 772 M570 744 L570 780 M590 744 L590 774 M610 744 L610 778" stroke="${p.deep}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>`
  );
};

const SHAPES: Record<ProductShape, Draw> = {
  tee: drawTee,
  polo: drawPolo,
  hoodie: drawHoodie,
  jacket: drawJacket,
  pants: drawPants,
  shorts: drawShorts,
  sneaker: drawSneaker,
  runner: drawRunner,
  boot: drawBoot,
  backpack: drawBackpack,
  'shoulder-bag': drawShoulderBag,
  cap: drawCap,
  belt: drawBelt,
  socks: drawSocks,
  wallet: drawWallet,
  scarf: drawScarf,
};

/**
 * How each silhouette is framed: `[scale, focusX, focusY]`.
 *
 * `front` centres the garment's own bounding box and pushes it close enough to
 * fill the frame the way catalogue photography does — a product floating in
 * dead space is the single clearest tell of generated art.
 *
 * `detail` is a genuine macro crop rather than a different drawing: the same
 * artwork is scaled up and re-centred on the part worth looking at closely —
 * a placket, a zip pull, a lace row, a buckle — which is where the stitching
 * and ribbing drawn everywhere finally become legible.
 */
type Frame = [scale: number, focusX: number, focusY: number];

const FRAMING: Record<ProductShape, { front: Frame; back: Frame; detail: Frame }> = {
  tee: { front: [1.55, 500, 520], back: [1.55, 500, 520], detail: [2.7, 500, 300] },
  polo: { front: [1.55, 500, 520], back: [1.55, 500, 520], detail: [2.9, 500, 370] },
  hoodie: { front: [1.3, 500, 542], back: [1.3, 500, 542], detail: [2.5, 500, 300] },
  jacket: { front: [1.3, 500, 530], back: [1.3, 500, 530], detail: [2.5, 500, 350] },
  pants: { front: [1.5, 500, 535], back: [1.5, 500, 535], detail: [3.0, 500, 300] },
  shorts: { front: [1.8, 500, 460], back: [1.8, 500, 460], detail: [3.2, 500, 310] },
  sneaker: { front: [1.3, 507, 553], back: [1.3, 507, 553], detail: [2.6, 500, 510] },
  runner: { front: [1.3, 509, 564], back: [1.3, 509, 564], detail: [2.6, 480, 520] },
  boot: { front: [1.28, 500, 485], back: [1.28, 500, 485], detail: [2.4, 600, 400] },
  backpack: { front: [1.45, 500, 537], back: [1.45, 500, 537], detail: [2.4, 500, 560] },
  'shoulder-bag': { front: [1.5, 500, 514], back: [1.5, 500, 514], detail: [2.4, 500, 520] },
  cap: { front: [1.3, 541, 493], back: [1.3, 500, 493], detail: [2.4, 500, 450] },
  belt: { front: [1.45, 472, 500], back: [1.45, 472, 500], detail: [2.6, 690, 500] },
  socks: { front: [1.65, 431, 468], back: [1.65, 431, 468], detail: [3.0, 440, 320] },
  wallet: { front: [1.75, 500, 500], back: [1.75, 500, 500], detail: [3.0, 480, 470] },
  scarf: { front: [1.35, 500, 531], back: [1.35, 500, 531], detail: [3.0, 470, 560] },
};

export interface ProductArtworkInput {
  shape: ProductShape;
  color: string;
  brandName: string;
  productName: string;
  /** Defaults to the front view. */
  view?: ProductView;
}

/** The views every product ships, in gallery order. */
export const PRODUCT_VIEWS: ProductView[] = ['front', 'back', 'detail'];

const VIEW_LABEL: Record<ProductView, string> = {
  front: 'front view',
  back: 'back view',
  detail: 'fabric detail',
};

/** Human-readable alt text for one generated view. */
export function productArtworkAlt(productName: string, color: string, view: ProductView): string {
  return `${productName} in ${color} — ${VIEW_LABEL[view]}`;
}

/**
 * A studio still for one colourway and view. The brand and colour are set as
 * accessible metadata (`<title>`/`<desc>`) rather than stamped across the
 * artwork, so the image reads as a product shot instead of a label.
 */
export function productArtworkSvg(input: ProductArtworkInput): string {
  const view = input.view ?? 'front';
  const palette = paletteFor(input.color);
  const draw = SHAPES[input.shape] ?? SHAPES.tee;
  const framing = FRAMING[input.shape] ?? FRAMING.tee;
  const [scale, focusX, focusY] = framing[view];
  const body = draw({ p: palette, view, back: view === 'back' });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" ` +
    `viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" role="img" ` +
    `aria-label="${escapeXml(productArtworkAlt(input.productName, input.color, view))}">` +
    `<title>${escapeXml(`${input.brandName} ${input.productName} — ${input.color}, ${VIEW_LABEL[view]}`)}</title>` +
    fabricDefs(palette) +
    studio() +
    // The detail crop clips to the frame, so nothing spills onto the sweep.
    `<g clip-path="inset(0)"><g transform="${shapeTransform(scale, focusX, focusY)}">` +
    body +
    `</g></g>` +
    `</svg>`
  );
}

// --- Campaign covers --------------------------------------------------------

export interface CampaignArtworkItem {
  shape: ProductShape;
  color: string;
}

/**
 * Campaign cover.
 *
 * Carries no text: the card overlays its own title, and a title baked into the
 * artwork was being sliced in half by `object-cover` whenever the card's aspect
 * ratio differed from the image's.
 *
 * What it shows instead is the campaign's own merchandise, spotlit on a dark
 * ground — the same reason a real retailer shoots a campaign banner rather than
 * setting a coloured rectangle. Products are laid out along a shallow arc with
 * the hero centred and largest; the left third stays comparatively clear so the
 * headline the card draws there has somewhere quiet to sit.
 */
export function campaignArtworkSvg(seed: string, items: CampaignArtworkItem[] = []): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;

  const W = 1400;
  const H = 700;

  // A narrow band of deep, desaturated grounds — never a candy gradient.
  const grounds = [
    ['#1e2227', '#31383f'],
    ['#241f1d', '#3c332d'],
    ['#1b2422', '#2b3d38'],
    ['#221d26', '#362f3d'],
    ['#26211b', '#3f3629'],
  ];
  const [from, to] = grounds[hash % grounds.length];

  // Hero centre-right, supporting pieces stepping away and back.
  const slots = [
    { x: 0.5, y: 0.5, scale: 0.4, opacity: 0.5 },
    { x: 0.89, y: 0.48, scale: 0.44, opacity: 0.68 },
    { x: 0.63, y: 0.54, scale: 0.52, opacity: 0.86 },
    { x: 0.78, y: 0.6, scale: 0.62, opacity: 1 },
  ];

  const chosen = items.slice(0, slots.length);
  const body = chosen
    .map((item, index) => {
      const slot = slots[slots.length - chosen.length + index];
      const draw = SHAPES[item.shape] ?? SHAPES.tee;
      return (
        `<g opacity="${slot.opacity}" transform="translate(${W * slot.x} ${H * slot.y}) ` +
        `scale(${slot.scale}) translate(-500 -500)">` +
        draw({ p: paletteFor(item.color), view: 'front', back: false }) +
        `</g>`
      );
    })
    .join('');

  const hero = paletteFor(chosen[chosen.length - 1]?.color ?? 'Grey');

  const rules = Array.from(
    { length: 14 },
    (_, i) =>
      `<path d="M${(i + (hash % 7)) * 110 - 300} ${H} L${(i + (hash % 7)) * 110 + 180} 0"/>`,
  ).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="presentation">` +
    fabricDefs(hero) +
    `<defs><linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient>` +
    // The spotlight the goods stand in, and the scrim that protects the headline.
    `<radialGradient id="spot" cx="70%" cy="48%" r="58%">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>` +
    `<stop offset="0.6" stop-color="#ffffff" stop-opacity="0.08"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0.42"/>` +
    `<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#ground)"/>` +
    `<g stroke="#ffffff" stroke-opacity="0.05" stroke-width="1.5">${rules}</g>` +
    `<rect width="${W}" height="${H}" fill="url(#spot)"/>` +
    `<ellipse cx="${W * 0.72}" cy="${H * 0.86}" rx="${W * 0.28}" ry="34" fill="url(#contact)"/>` +
    body +
    `<rect width="${W}" height="${H}" fill="url(#scrim)"/>` +
    `</svg>`
  );
}

// --- Category tiles ---------------------------------------------------------

/**
 * Which silhouettes stand in for a category, and on what ground.
 *
 * Category navigation only works if a tile is recognisable at a glance, so each
 * one shows the garment the category is actually about — three overlapping
 * pieces, largest in front — rather than an icon or a colour block.
 */
const CATEGORY_ART: Record<string, { shapes: ProductShape[]; colors: string[] }> = {
  't-shirts': { shapes: ['tee', 'polo', 'tee'], colors: ['White', 'Navy', 'Black'] },
  shoes: { shapes: ['runner', 'sneaker', 'boot'], colors: ['White', 'Blue', 'Black'] },
  'running-shoes': { shapes: ['runner', 'runner', 'runner'], colors: ['Blue', 'Black', 'Red'] },
  sneakers: { shapes: ['sneaker', 'sneaker', 'sneaker'], colors: ['White', 'Red', 'Navy'] },
  boots: { shapes: ['boot', 'boot', 'boot'], colors: ['Black', 'Green', 'Beige'] },
  hoodies: { shapes: ['hoodie', 'hoodie', 'hoodie'], colors: ['Grey', 'Navy', 'Black'] },
  jackets: { shapes: ['jacket', 'jacket', 'jacket'], colors: ['Navy', 'Green', 'Black'] },
  pants: { shapes: ['pants', 'shorts', 'pants'], colors: ['Blue', 'Black', 'Beige'] },
  bags: { shapes: ['backpack', 'shoulder-bag', 'backpack'], colors: ['Black', 'Beige', 'Grey'] },
  backpacks: { shapes: ['backpack', 'backpack', 'backpack'], colors: ['Black', 'Grey', 'Navy'] },
  'shoulder-bags': {
    shapes: ['shoulder-bag', 'shoulder-bag', 'shoulder-bag'],
    colors: ['Black', 'Beige', 'Navy'],
  },
  accessories: { shapes: ['cap', 'belt', 'scarf'], colors: ['Black', 'Beige', 'Red'] },
};

const CATEGORY_FALLBACK = CATEGORY_ART['t-shirts'];

/**
 * Category tile, 4:3.
 *
 * Three silhouettes are staggered back-to-front and scaled down, so the tile
 * reads as an arrangement of goods rather than one big product — which is what
 * distinguishes "a category" from "a product" at a glance.
 */
export function categoryArtworkSvg(categorySlug: string, categoryName: string): string {
  const art = CATEGORY_ART[categorySlug] ?? CATEGORY_FALLBACK;
  const width = 1000;
  const height = 750;

  // Back to front: each layer is larger, lower and more opaque than the last.
  const layers = [
    { x: 0.26, y: 0.44, scale: 0.42, opacity: 0.5 },
    { x: 0.76, y: 0.46, scale: 0.48, opacity: 0.72 },
    { x: 0.5, y: 0.58, scale: 0.66, opacity: 1 },
  ];

  const body = layers
    .map((layer, index) => {
      const shape = art.shapes[index] ?? art.shapes[0];
      const draw = SHAPES[shape] ?? SHAPES.tee;
      const palette = paletteFor(art.colors[index] ?? 'Grey');
      return (
        `<g opacity="${layer.opacity}" transform="translate(${width * layer.x} ${height * layer.y}) ` +
        `scale(${layer.scale}) translate(-500 -500)">` +
        draw({ p: palette, view: 'front', back: false }) +
        `</g>`
      );
    })
    .join('');

  // Each tile needs its own defs because the palettes differ per layer; using
  // the front-most palette keeps the shared gradients coherent with the hero.
  const hero = paletteFor(art.colors[2] ?? 'Grey');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(categoryName)}">` +
    `<title>${escapeXml(categoryName)}</title>` +
    fabricDefs(hero) +
    `<rect width="${width}" height="${height}" fill="url(#sweep)"/>` +
    `<ellipse cx="${width / 2}" cy="${height * 0.82}" rx="${width * 0.3}" ry="34" fill="url(#contact)"/>` +
    body +
    `<rect width="${width}" height="${height}" fill="url(#vignette)"/>` +
    `</svg>`
  );
}

// --- Brand cards ------------------------------------------------------------

/**
 * Brand card, 3:2.
 *
 * Set as a plain typographic lockup — the brand's *name*, which the storefront
 * already shows in text everywhere. Deliberately not an imitation of anyone's
 * actual logo: reproducing a real mark would be a trademark problem and would
 * misrepresent this catalogue as officially licensed.
 */
export function brandArtworkSvg(brandName: string): string {
  const width = 600;
  const height = 400;
  // Long names need to step down or they overflow the card.
  const fontSize = brandName.length > 14 ? 42 : brandName.length > 9 ? 54 : 66;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(brandName)}">` +
    `<title>${escapeXml(brandName)}</title>` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="#22252a"/><stop offset="1" stop-color="#15171a"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>` +
    `<rect x="26" y="26" width="${width - 52}" height="${height - 52}" fill="none" stroke="#ffffff" stroke-opacity="0.13"/>` +
    `<text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" ` +
    `letter-spacing="-1" fill="#f6f5f3">${escapeXml(brandName.toUpperCase())}</text>` +
    `<text x="${width / 2}" y="${height - 58}" text-anchor="middle" ` +
    `font-family="Helvetica, Arial, sans-serif" font-size="14" letter-spacing="4.5" ` +
    `fill="#8d8880">OUTLET</text>` +
    `</svg>`
  );
}

/** `productArtworkSvg` packed as a data URI, for the static demo build. */
export function productArtworkDataUri(input: ProductArtworkInput): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(productArtworkSvg(input))}`;
}

export function campaignArtworkDataUri(seed: string, items: CampaignArtworkItem[] = []): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(campaignArtworkSvg(seed, items))}`;
}

/**
 * The pieces a campaign cover should show, picked from what the campaign
 * actually contains. Shapes are de-duplicated so a footwear campaign does not
 * render as four identical trainers, and the hero is the last entry.
 */
export function campaignArtworkItems(
  productSlugs: string[],
  lookup: (slug: string) => { shape: ProductShape; colors: string[] } | undefined,
): CampaignArtworkItem[] {
  const items: CampaignArtworkItem[] = [];
  const seen = new Set<ProductShape>();
  for (const slug of productSlugs) {
    const product = lookup(slug);
    if (!product || seen.has(product.shape)) continue;
    seen.add(product.shape);
    items.push({ shape: product.shape, color: product.colors[0] ?? 'Grey' });
    if (items.length === 4) break;
  }
  // A single-shape campaign still deserves a full arrangement: fill the
  // remaining slots with the other colourways of what it does have.
  if (items.length < 3) {
    for (const slug of productSlugs) {
      const product = lookup(slug);
      if (!product) continue;
      for (const color of product.colors) {
        if (items.some((i) => i.shape === product.shape && i.color === color)) continue;
        items.push({ shape: product.shape, color });
        if (items.length === 4) return items;
      }
    }
  }
  return items;
}

export function categoryArtworkDataUri(categorySlug: string, categoryName: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(categoryArtworkSvg(categorySlug, categoryName))}`;
}

export function brandArtworkDataUri(brandName: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandArtworkSvg(brandName))}`;
}
