# Global Escalation Map

Interactive hypothetical multi-front escalation map built with Leaflet and OpenStreetMap.

## What it shows

The map explores a negative but hypothetical scenario in which several regional crises overlap or are exploited opportunistically. It does **not** assume a unified four-state command structure. The scenario focuses on strategic-level pressure in the Baltic region, Taiwan, the Korean Peninsula, the Middle East, global chokepoints, US/allied reinforcement, and cyber/logistics pressure on the US homeland.

The interface uses six scenario phases. Symbolization stays consistent between phases; zooming changes the level of detail. In Overview mode, the map keeps only clean animated routes and compact endpoints. Zoom in to reveal labels, zones, and richer operational context.

## Files

- `index.html` — page structure
- `styles.css` — visual design and responsive layout
- `scenario-data.js` — scenario phases, theaters, routes, and popup descriptions
- `app.js` — Leaflet rendering, animation, adaptive zoom logic, and interaction

## Run locally

Because the project is static, you can open `index.html` directly or serve the folder with any simple local web server.

## Disclaimer

This is a hypothetical analytical visualization for strategic discussion. It is not a prediction, intelligence product, operational plan, target list, or instruction for real-world military action. Routes and locations are schematic and intentionally remain at theater/strategic level.

## Basemap and libraries

- Leaflet 1.9.4
- OpenStreetMap tiles
