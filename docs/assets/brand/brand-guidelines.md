# Look It Up Brand Guidelines

Codex Aperture pairs two symmetric 45-degree codebook pages with a centered rotated bit floating inside a uniform negative-space Y-channel. Every mark is built from pure integer geometry with flat two-tone colours and outlined letterforms, zero external font dependencies at render time.

## Files and Versions

Master artwork and exported variants live in [docs/assets/brand/](.) and the compiled web icons live in `web/public/`. Use light-background artwork on white or paper surfaces, and use `-dark` variants (`#F8FAFC` wings with `#22C55E` bit) on `#0F172A` slate surfaces.

| File | Background | Minimum Size | Use Case |
| --- | --- | --- | --- |
| `look-it-up-horizontal-color.svg` | Light surfaces | 120 px wide | Light headers, PDF papers, light README mode |
| `look-it-up-horizontal-dark.svg` | `#0F172A` dark UI | 120 px wide | Dark headers, Dev.to cover badge, dark README mode |
| `look-it-up-stacked-color.svg` | Light surfaces | 96 px wide | Square repository cards, social covers |
| `look-it-up-stacked-dark.svg` | `#0F172A` dark UI | 96 px wide | Dark presentation slides, slide title cards |
| `look-it-up-symbol-color.svg` | Light surfaces | 24 px square | Compact light-mode avatars and badges |
| `look-it-up-symbol-dark.svg` | `#0F172A` dark UI | 24 px square | Studio top bar and dark UI tiles |
| `look-it-up-symbol-small-dark.svg` | Dark tile containers | 16 px square | Opens the Y-channel to 26 units for crisp favicons |
| `look-it-up-app-icon.svg` | Rounded square tile | 16 px square | Browser favicon, macOS dock, PWA app icon |
| `look-it-up-symbol-black.svg` / `white` | Single-ink print | 20 px square | Monochrome badges, stickers, thermal labels |
| `look-it-up-symbol-mono-059669.svg` | Single brand tint | 20 px square | Monochrome emerald stamps |
| `look-it-up-wordmark-black.svg` / `white` | Light / Dark | 100 px wide | Standalone custom geometric wordmark lockup |

## Clear Space and Sizing

Keep at least 24 units of clear margin around symbols (`256 x 256` canvas scale, equal to one center diamond radius or one cap-height stem group) and one cap-height of air around lockups on all sides. For icon sizes at or below 32 px, pull `web/public/favicon.svg`, `web/public/favicon.ico`, or `look-it-up-app-icon.svg` instead of scaling the horizontal lockup down.

## Colour Palette

| Role | Name | HEX | RGB | CMYK |
| --- | --- | --- | --- | --- |
| Primary dark surface and light-mode ink | Codex Ink | `#0F172A` | `15, 23, 42` | `64, 45, 0, 84` |
| Light-background cipher bit | Deep Emerald | `#059669` | `5, 150, 105` | `97, 0, 30, 41` |
| Dark-background cipher bit | Signal Emerald | `#22C55E` | `34, 197, 94` | `83, 0, 52, 23` |
| Dark-background page wing ink | Crisp Chalk | `#F8FAFC` | `248, 250, 252` | `2, 1, 0, 1` |

On white backgrounds, pair `#0F172A` wings with `#059669` so the diamond bit maintains clean legibility and print contrast. On `#0F172A` dark grounds or rounded icon tiles, swap to `#F8FAFC` wings thinned by 1 unit to counter dark-ground irradiation bloom and brighten the bit to `#22C55E`.

## Typography

All wordmark and lockup SVGs convert the custom geometric `LOOK IT UP` letters into raw vector paths (`16`-unit stems, `14`-unit horizontal bars, `45`-degree `K` arms, and `2`-unit circular overshoots on `O` and `U`). Product interfaces (`web/`) pair IBM Plex Sans for UI copy and headings with JetBrains Mono for metrics, keys, and bit streams.

## Usage Rules

Keep proportions locked across every variant and pick the matching `-color` or `-dark` SVG rather than inverting CSS filters blindly. Never recreate `LOOK IT UP` with system fallback text inside SVG headers, never squash lockup aspect ratios, never rotate the symbol away from vertical upright symmetry, and never substitute drop shadows or glow filters in place of clean high-contrast tiles.
