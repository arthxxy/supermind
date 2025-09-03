"use client";

// Simple wrapper to expose the tree-capable mind-map viewer under the new
// file-name requested by the product requirements. The implementation lives
// in `mind-map-viewer.tsx`, which already provides both the original force
// layout and the new hierarchical tree layout selectable in its settings UI.
//
// Having this thin wrapper avoids duplicate code while still allowing other
// parts of the application to import `MindMapTree` directly, e.g.:
//   import MindMapTree from "@/components/mind-map-tree";
//
// This keeps the existing UI structure completely unchanged.

import MindMap from "@/components/mind-map";

export default MindMap;

