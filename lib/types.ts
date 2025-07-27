import * as d3 from 'd3';

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  level: number;
  color?: string;
  content?: string;
  x?: number;
  y?: number;
  fx?: number | null; // fx and fy can be null (for unfixing)
  fy?: number | null;
  textStyle?: {
    fontSize?: number;
    isBold?: boolean;
    isItalic?: boolean;
    isUnderline?: boolean;
    isStrikethrough?: boolean;
  };
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node; // Can be ID string initially, then resolved to Node object
  target: string | Node; // Can be ID string initially, then resolved to Node object
  type: "parent-child" | "friend";
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

// This interface was in mind-map.tsx, moving it here for centralization
export interface Relationship {
  type: "friend" | "child" | "parent";
  targetId: string;
  targetName: string;
} 