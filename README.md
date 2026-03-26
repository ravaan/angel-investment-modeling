# Angel Investment Model — India

Interactive financial model for angel investing in Indian startups. Pure HTML/CSS/JS, no frameworks, under 100KB.

## Features

- **7 sections**: Dashboard, Deployment, Portfolio, Returns, Net Worth, Opportunity Cost, Sensitivity
- **67+ configurable inputs** with instant recalculation
- **3 scenarios**: Base, Bull, Bear with adjustable modifiers
- **5 SVG charts**: Donut, Line, Stacked Area, Bar, Heatmap
- **3 themes**: Dark, Light, Warm Amber
- **Sound effects**: Web Audio API oscillators
- **Keyboard shortcuts**: T (theme), S (sound), ? (help), 1-7 (sections)

## Quick Start

Open `index.html` in any modern browser. No build step needed.

Or serve locally:

```bash
python3 -m http.server 8080
```

## Deployment

Push to GitHub and enable GitHub Pages. The included workflow (`.github/workflows/deploy.yml`) auto-deploys on push to `main`.

## Size Budget

| File       | Size       |
| ---------- | ---------- |
| index.html | ~34KB      |
| styles.css | ~15KB      |
| engine.js  | ~13KB      |
| charts.js  | ~12KB      |
| sound.js   | ~1.5KB     |
| app.js     | ~25KB      |
| **Total**  | **~100KB** |

## License

MIT
