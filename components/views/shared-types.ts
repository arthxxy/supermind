import * as d3 from "d3";
import type { Node, Link, GraphData } from "@/lib/types";

// Tree node structure for layout calculation
export interface TreeNode {
  id: string;
  node: Node;
  parent?: TreeNode;
  children: TreeNode[];
  angle?: number; // Angle from parent (in radians)
  distance?: number; // Distance from root
  x?: number;
  y?: number;
  isRingChild?: boolean; // Whether this node is part of a ring around its parent
  isRoot?: boolean; // Whether this node is a true hierarchical root (with sufficient depth)

  isFriendOnly?: boolean; // Whether this node only has friend connections (no hierarchical parent/children)
}

// Separate position storage for each view mode
export interface ViewPositions {
  force: Map<string, { x: number; y: number; fx?: number | null; fy?: number | null }>;
  tree: Map<string, { x: number; y: number }>;
  // Track compactness values when positions were saved
  savedCompactness?: {
    intraGraph: number;
    interGraph: number;
  };
}

// Common props for both view components
export interface ViewProps {
  graphData: GraphData;
  selectedNode: Node | null;
  editingNode: Node | null;
  hoveredNodeId: string | null;
  enableHoverEffects: boolean;
  intraGraphCompactness: number;
  interGraphCompactness: number;
  duplicateNodeTransparency?: number;
  isZooming: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  onNodeClick: (node: Node, event: MouseEvent) => void;
  onNodeDoubleClick: (node: Node, event: MouseEvent) => void;
  onHoveredNodeChange: (nodeId: string | null) => void;
  onBackgroundClick: () => void;
  onPositionsSave: (mode: 'force' | 'tree') => void;
  savedPositions: ViewPositions;

}

// Constants shared between views
export const CONSTANTS = {
  // Text visibility
  BASE_SVG_FONT_SIZE: 12,
  FULLY_OPAQUE_EFFECTIVE_SIZE: 10,
  INVISIBLE_EFFECTIVE_SIZE: 7,
  OTHER_NODE_TEXT_OPACITY_ON_HOVER: 0.2,
  
  // Tree layout
  LEVEL_DISTANCE: 120,
  MIN_SIBLING_ANGLE: Math.PI / 8,
  RING_RADIUS: 80,
  MIN_RING_DISTANCE: 160,
  NODE_RADIUS: 25,
  
  // Force layout scaling
  MAX_INTERNAL_SCALE: 2.0,
  MIN_INTERNAL_SCALE: 0.5,
  

} as const;

// Utility functions shared between views
// Identify true hierarchical root nodes based on strict criteria
export const identifyTrueRoots = (
  potentialRoots: TreeNode[] | Node[], 
  nodeMap: Map<string, TreeNode>, 
  links: Link[], 
  componentNodes: Node[]
): (TreeNode | Node)[] => {
  const trueRoots: (TreeNode | Node)[] = [];
  
  for (const candidate of potentialRoots) {
    // Handle both TreeNode and Node types
    const isTreeNode = 'children' in candidate;
    if (isTreeNode) {
      (candidate as TreeNode).isRoot = false;
    }
    
    // For Node type, build temporary parent-child structure to check hierarchy
    let children: Node[] = [];
    if (!isTreeNode) {
      // Find children of this node
      children = links
        .filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          return link.type === 'parent-child' && sourceId === candidate.id;
        })
        .map(link => {
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          return componentNodes.find(n => n.id === targetId);
        })
        .filter(Boolean) as Node[];
    } else {
      children = (candidate as TreeNode).children.map(child => child.node);
    }
    
    // A node qualifies as a true root if it meets these criteria:
    // 1. It has no parent (already established for potentialRoots)
    // 2. It has at least one child
    // 3. It either has grandchildren OR has children with friends
    
    if (children.length === 0) {
      // Check if this node has any friend connections
      const hasFriendConnections = links.some(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return link.type === 'friend' && (sourceId === candidate.id || targetId === candidate.id);
      });
      
      // Only treat as root if it's truly isolated (no connections at all)
      if (!hasFriendConnections) {
        trueRoots.push(candidate);
      }
      continue;
    }
    
    let hasGrandchildren = false;
    let hasChildrenWithFriends = false;
    
    // Check each child
    for (const child of children) {
      // Check for grandchildren (children of children)
      const grandchildren = links
        .filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          return link.type === 'parent-child' && sourceId === child.id;
        });
      
      if (grandchildren.length > 0) {
        hasGrandchildren = true;
        break;
      }
      
      // Check for friends of this child
      const friendLinks = links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return (sourceId === child.id || targetId === child.id) && link.type === 'friend';
      });
      
      if (friendLinks.length > 0) {
        hasChildrenWithFriends = true;
        break;
      }
    }
    
    // Mark as true root if it has sufficient depth/complexity
    if (hasGrandchildren || hasChildrenWithFriends) {
      if (isTreeNode) {
        (candidate as TreeNode).isRoot = true;
      }
      // For Node type, we'll use a separate Set to track root status
    }
    
    trueRoots.push(candidate);
  }
  
  return trueRoots;
};

// Helper function for Force View to get Set of true root node IDs
export const getTrueRootNodeIds = (
  potentialRootNodes: Node[],
  links: Link[],
  componentNodes: Node[]
): Set<string> => {
  const trueRootIds = new Set<string>();
  
  for (const candidate of potentialRootNodes) {
    // Find children of this node
    const children = links
      .filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return link.type === 'parent-child' && sourceId === candidate.id;
      })
      .map(link => {
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return componentNodes.find(n => n.id === targetId);
      })
      .filter(Boolean) as Node[];
    
    // A node qualifies as a true root if it meets these criteria:
    // 1. It has no parent (already established for potentialRoots)
    // 2. It has at least one child
    // 3. It either has grandchildren OR has children with friends
    
    if (children.length === 0) {
      // Check if this node has any friend connections
      const hasFriendConnections = links.some(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return link.type === 'friend' && (sourceId === candidate.id || targetId === candidate.id);
      });
      
      // Only treat as root if it's truly isolated (no connections at all)
      if (!hasFriendConnections) {
        trueRootIds.add(candidate.id);
      }
      continue;
    }
    
    let hasGrandchildren = false;
    let hasChildrenWithFriends = false;
    
    // Check each child
    for (const child of children) {
      // Check for grandchildren (children of children)
      const grandchildren = links
        .filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          return link.type === 'parent-child' && sourceId === child.id;
        });
      
      if (grandchildren.length > 0) {
        hasGrandchildren = true;
        break;
      }
      
      // Check for friends of this child
      const friendLinks = links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return (sourceId === child.id || targetId === child.id) && link.type === 'friend';
      });
      
      if (friendLinks.length > 0) {
        hasChildrenWithFriends = true;
        break;
      }
    }
    
    // Mark as true root if it has sufficient depth/complexity
    if (hasGrandchildren || hasChildrenWithFriends) {
      trueRootIds.add(candidate.id);
    }
  }
  
  return trueRootIds;
};

export const parseMarkdownAndApplyStyles = (text: string, textStyle: Node['textStyle']) => {
  const baseFontSize = textStyle?.fontSize || CONSTANTS.BASE_SVG_FONT_SIZE;
  let fontWeight = textStyle?.isBold ? "bold" : "normal";
  let fontStyle = textStyle?.isItalic ? "italic" : "normal";
  let textDecoration = [];
  if (textStyle?.isUnderline) textDecoration.push("underline");
  if (textStyle?.isStrikethrough) textDecoration.push("line-through");

  let displayText = text || ""; // Handle undefined/null text
  
  if (displayText.includes('**')) {
    const boldMatch = displayText.match(/\*\*(.*?)\*\*/);
    if (boldMatch) {
      displayText = displayText.replace(/\*\*(.*?)\*\*/g, '$1');
      fontWeight = "bold";
    }
  }
  
  if (displayText.includes('_') && !displayText.includes('__')) {
    const italicMatch = displayText.match(/_(.*?)_/);
    if (italicMatch) {
      displayText = displayText.replace(/_(.*?)_/g, '$1');
      fontStyle = "italic";
    }
  }
  
  if (displayText.includes('__')) {
    const underlineMatch = displayText.match(/__(.*?)__/);
    if (underlineMatch) {
      displayText = displayText.replace(/__(.*?)__/g, '$1');
      if (!textDecoration.includes("underline")) {
        textDecoration.push("underline");
      }
    }
  }
  
  if (displayText.includes('~~')) {
    const strikethroughMatch = displayText.match(/~~(.*?)~~/);
    if (strikethroughMatch) {
      displayText = displayText.replace(/~~(.*?)~~/g, '$1');
      if (!textDecoration.includes("line-through")) {
        textDecoration.push("line-through");
      }
    }
  }

  return {
    text: displayText,
    fontSize: baseFontSize,
    fontWeight,
    fontStyle,
    textDecoration: textDecoration.join(" ")
  };
};
