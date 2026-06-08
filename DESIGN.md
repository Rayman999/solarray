# Solarray UI/UX Design Guide

This file documents the visual language and interaction principles for Solarray so
that future work (human or agent) stays consistent. Read this before touching any
`.css`/`.html` in `src/`.

## The concept: "observatory minimalism"

Solarray is a space-themed reminders app, but it must **not** look like every other
"space vibe" app (no purple/blue nebula gradients, no glowing neon, no literal
starfield photos, no busy planet illustrations). Instead the look is:

- **Deep, near-black backgrounds** with one restrained warm accent — think a quiet
  observatory at night, not a sci-fi dashboard.
- **Hairline borders and glass surfaces** instead of heavy drop shadows.
- **Light-weight, tightly-tracked display type** — closer to Apple's calm confidence
  than a gamer/cyberpunk aesthetic.
- **Sparse, intentional motion**: slow-breathing glows, faint drifting stars, thin
  rotating orbit rings. Everything moves like it's far away and patient — never
  flashy or attention-grabbing at rest.

If in doubt, favor restraint: one accent color, hairline strokes, generous
whitespace, and motion that feels like it's always been there.

## Color palette (CSS custom properties, defined in `src/styles.css`)

```css
--bg: #05070b;                      /* page background, near-black */
--surface: rgba(255,255,255,0.04);  /* glass card surfaces */
--surface-strong: rgba(255,255,255,0.075);
--ink: #eef1f5;                     /* primary text, "starlight white" */
--muted: #828d9b;                   /* secondary text, cool gray-blue */
--line: rgba(255,255,255,0.09);     /* hairline borders everywhere */
--accent: #f0c987;                  /* the ONE warm accent — "starlight amber" */
--accent-ink: #1c1408;              /* dark text placed on top of --accent */
--green / --rose: muted status colors, used sparingly (done / delete / error) */
```

**Rule of one accent**: `--accent` is the only saturated color in the system. It
marks primary actions, focus states, and "reward" moments (success). Don't
introduce new brand colors — extend the neutral scale instead.

## Typography

- Font: Inter / system sans, antialiased.
- Headings: `font-weight: 600`, `letter-spacing: -0.02em`, tight `line-height`
  (~1.05–1.15). Confident but quiet — no heavy black weights.
- Eyebrow / section labels: small caps-style — `font-size: 0.7rem`,
  `font-weight: 600`, `letter-spacing: 0.16–0.32em`, `text-transform: uppercase`,
  colored `var(--accent)` for brand marks or `var(--muted)` for section labels.
- Body / muted copy: `var(--muted)`, `0.85–0.95rem`.

## Surfaces & structure

- Cards/panels: `background: var(--surface)`, `border: 1px solid var(--line)`,
  `border-radius` ~0.65–1.1rem, `backdrop-filter: blur(20px)`, soft dark shadow
  (`box-shadow: 0 24-28px 60-70px rgba(0,0,0,0.45)`).
- Decorative orbit rings: thin (`1px solid rgba(255,255,255,0.07)` or a faint
  accent-tinted variant), large circles positioned with `border-radius: 999px`,
  often peeking off the edge of a panel (`top: -6rem; right: -6rem`).
- Background texture: a sparse two-layer dot pattern simulating distant stars
  (see `body::before` in `src/styles.css`) plus two extremely subtle radial
  gradients suggesting distant starlight — never a literal nebula photo.

## Motion principles ("micro-delight", not decoration)

Reference: addictive/pleasurable UI research boils down to small, fast, honest
feedback loops — the brain rewards "I did something → it visibly worked".

1. **Ambient motion is slow and calm** — orbit rings rotate over 60–90s, glow
   orbs "breathe" (scale 1 → 1.08) over ~7s, star texture drifts over ~2 minutes.
   These exist to make the space feel alive at rest, never to distract.
2. **Interactive feedback is fast and honest** — input focus glows in
   (`border-color` + soft `box-shadow` ring in `--accent` at ~200ms), buttons
   lift 1px on hover, press down slightly on `:active`.
3. **The "reward" moment uses the accent color exclusively** — e.g. a submit
   button morphs label → spinner → bouncy checkmark
   (`cubic-bezier(.34, 1.56, .64, 1)` overshoot easing) with a soft radial
   "burst" ring (`success-burst` keyframes, `box-shadow` 0 → 16px fade).
   This is the one moment allowed to feel celebratory.
4. **Page transitions use the native View Transitions API** via Angular Router's
   `withViewTransitions()` (configured in `src/main.ts`) — no animation library
   needed. Two layered effects:
   - A page "glide": old view slides left + fades, new view slides in from the
     right + fades (`page-glide-out` / `page-glide-in` keyframes in
     `src/styles.css`), ~480ms, `cubic-bezier(0.32, 0.08, 0.24, 1)`.
   - A **shared-element brand morph**: any element with class `.brand-mark`
     (the "Solarray" word-mark) carries `view-transition-name: solarray-brand`,
     so the browser automatically glides/resizes it between its position on one
     route and the next — reinforcing that it's one continuous space, not
     separate screens. When adding a new routed page that shows the brand mark,
     give it `class="eyebrow brand-mark"` to opt into this morph.

## Magnetic hover ("charged" interactive elements)

Primary buttons and key links use the reusable `appMagnetic` directive
(`src/app/shared/magnetic.directive.ts`) — it nudges the element a few pixels
toward the cursor on hover (fast `cubic-bezier(0.22, 1, 0.36, 1)` ease) and
snaps back with a bouncy overshoot on mouse-leave
(`cubic-bezier(0.34, 1.56, 0.64, 1)`, ~560ms). The directive auto-applies the
`.magnetic-glow` host class, which adds a soft accent-colored halo
(`radial-gradient` in `--accent`) that fades in behind the element on
hover/focus — defined globally in `src/styles.css`.

- **Usage**: add `appMagnetic` to any clickable element — `<button appMagnetic>`
  or tune the pull with `[magneticStrength]="0.2"` (smaller = subtler; ~0.18–0.25
  for buttons, ~0.4–0.5 for inline text links so the tug reads against their
  smaller hit area).
- **Where it's applied**: the auth-page submit buttons and "switch to
  signup/login" links (`pages/login`, `pages/signup`). The dashboard/home page
  intentionally uses calmer tactile buttons instead of magnetic attraction so
  everyday actions feel useful rather than theatrical.
- **When to add it elsewhere**: any new primary CTA or nav-style link should
  pick this up too — it's the app's signature "this thing wants to be touched"
  cue, distinct from the plain hover-lift used on secondary controls. Don't
  apply it to dense lists of small icon-buttons (e.g. reminder card actions) —
  the pull reads as noisy at that density; reserve it for primary actions.

## Components: prefer PrimeNG, themed to match

PrimeNG (`primeng` + `@primeuix/themes`, Aura preset) is installed and configured
in `src/main.ts` with a custom preset (`SolarrayPreset`) whose `semantic.primary`
ramp is built from `--accent` (`#f0c987`). Dark mode is forced via
`darkModeSelector: '.dark-mode'` and the `.dark-mode` class on `<html>`
(`src/index.html`).

- Use PrimeNG components for anything with built-in interaction polish:
  `p-floatlabel` + `pInputText` / `p-password` for forms (floating labels,
  password toggle/strength meter — the strength meter doubles as a "progress"
  reward per the addictive-UI research), `p-button` for actions (built-in
  `[loading]` spinner + ripple via `providePrimeNG({ ripple: true })`).
- Visually wrap/override with component-scoped CSS (`::ng-deep` is acceptable
  here since these are page-level auth forms, not shared design-system pieces)
  to enforce the hairline/glass look — see `src/app/pages/login/login.css` for
  the pattern (`.auth-form ::ng-deep .submit-button { ... }`).
- Don't fight the theme system: extend `SolarrayPreset` with new design tokens
  rather than overriding every component's CSS by hand.

## Layout patterns

- **Dashboard / home** (`pages/dashboard`): mobile-first daily command center.
  Lead with a calm greeting, quick capture, lightweight type chips, and a
  collapsible details panel. Follow with a short "Today" list and compact
  secondary cards (`nearby`, future routines). Avoid putting the full reminder
  form above the fold by default.
- **Auth pages** (`pages/login`, `pages/signup`): split-screen — an ambient
  visual pane (orbit rings, glow orb, drifting stars, brand copy) on one side,
  a centered minimal form card on the other. **Below 920px the visual pane is
  hidden entirely** (`.visual-pane { display: none; }`) — a partially-collapsed
  strip left a dead empty rectangle where the orb/orbits used to sit, which
  read as a UI bug rather than atmosphere. On small screens the form card
  alone carries the page.

## When extending this UI

- New pages should reuse the existing CSS custom properties — never hardcode
  hex colors.
- Keep the "one accent" rule. Status colors (`--green`, `--rose`) are for
  semantic meaning only (done/delete/error), not decoration.
- Any new "reward" interaction (save, complete, sync) should follow the same
  morph-to-checkmark + burst pattern used on the auth submit buttons, so the
  app's feedback language stays consistent.
- Prefer the View Transitions API + `.brand-mark` convention over a JS animation
  library for cross-route motion — it's native, free, and already wired up.
