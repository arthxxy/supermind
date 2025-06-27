# Supermind Code Table of Contents (ToC)

## Haupt-Komponenten

- **app/layout.tsx** – Globales Layout, bindet Tailwind & Fonts ein
- **app/page.tsx** – Startseite, Übersicht, Einstiegspunkte
- **app/mindmap/[id]/page.tsx** – Einzelne Mindmap-Ansicht (dynamisch)
- **app/mindmap/new/page.tsx** – Neue Mindmap anlegen
- **components/mind-map.tsx** – Zentrale Komponente für die Mindmap-Visualisierung (D3, State, UI)
- **components/markdown-editor.tsx** – Editor für Notizen/Nodes
- **components/node-toolbar.tsx** – Toolbar für Node-Interaktionen

## Hooks & Logik

- **hooks/use-mind-map-simulation.ts** – (optional, für spätere Refaktorisierung) D3-Simulation als Hook
- **lib/graph-utils.ts** – Hilfsfunktionen für Graph-Operationen (z.B. Connected Components)
- **lib/types.ts** – Typdefinitionen für Nodes, Links, GraphData
- **lib/d3-custom-forces.ts** – Eigene D3-Forces für Node-Verteilung

## UI & Styling

- **app/globals.css** – Tailwind & globale Styles
- **components/ui/** – Wiederverwendbare UI-Bausteine (Button, Dialog, etc.)

## D3-Integration

- **components/mind-map.tsx** –
  - SVG-Canvas & D3-Rendering
  - State-Management für Nodes/Links
  - Event-Handling (Klick, Drag, etc.)
  - Settings-Panel, Toolbar, Editor

---

**Hinweis:**
- Diese Datei dient als Einstieg und Überblick für Entwickler und KI.
- Bei größeren Refactorings bitte hier die neuen Strukturen ergänzen!
- Für schnelle Navigation: Suche nach `#`-Überschriften oder Dateinamen. 