import * as d3 from 'd3';
import type { Node, Link } from './types'; // Import Node and Link types from lib/types.ts

// Custom force for distributing sibling nodes
export function createSiblingDistributionForce(
  initialNodes: Node[],
  initialLinks: Link[],
  strengthVal: number,
  idealLinkDistanceVal: number,
  rootNodeIds?: Set<string>
): d3.Force<Node, Link> {
  let nodes: Node[] = [];
  let links: Link[] = []; // All links
  let parentChildLinks: Link[] = []; // Filtered parent-child links
  let nodesMap: Map<string, Node> = new Map();
  let strength = strengthVal;
  let idealLinkDistance = idealLinkDistanceVal;
  let rootNodes: Set<string> = rootNodeIds || new Set();
  
  // Pre-compute parent-child relationships once
  let childrenByParent: Map<string, Node[]> = new Map();

  function force(alpha: number) {
    if (!nodes || !parentChildLinks || !nodesMap) return;

    // Apply sibling distribution force
    childrenByParent.forEach((children, parentId) => {
      const parentNode = nodesMap.get(parentId);
      if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) {
        return;
      }
      
      // For root nodes, start distributing children in a circle from 2 children onwards
      // For non-root nodes, keep the original behavior (only distribute if more than 1 child)
      const isRootNode = rootNodes.has(parentId);
      const minimumChildrenForDistribution = isRootNode ? 2 : 2; // Changed: both start at 2 now
      
      if (children.length < minimumChildrenForDistribution) {
        return;
      }

      // Calculate the angle step for evenly distributing children
      const angleStep = (2 * Math.PI) / children.length;
      const scaledStrength = strength * alpha;

      // For root nodes, use a larger radius to give children more space for 360° distribution
      const distributionRadius = isRootNode ? idealLinkDistance * 1.8 : idealLinkDistance;

      // Apply forces to position children in a circle around parent
      children.forEach((child, i) => {
        if (child.x === undefined || child.y === undefined) {
          // Initialize position if undefined
          child.x = parentNode.x! + (Math.random() - 0.5) * 0.1;
          child.y = parentNode.y! + (Math.random() - 0.5) * 0.1;
        }

        // Calculate target position in a circle around parent
        const angle = i * angleStep;
        const targetX = parentNode.x! + distributionRadius * Math.cos(angle);
        const targetY = parentNode.y! + distributionRadius * Math.sin(angle);

        // Apply force toward target position
        child.vx = (child.vx || 0) + (targetX - child.x!) * scaledStrength;
        child.vy = (child.vy || 0) + (targetY - child.y!) * scaledStrength;
      });
    });
  }

  force.initialize = (_nodes: Node[], random?: () => number) => {
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
    
    // Pre-compute parent-child relationships
    childrenByParent = new Map();
    parentChildLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetNode = typeof link.target === 'string' ? nodesMap.get(link.target) : link.target as Node;
      if (targetNode) {
        if (!childrenByParent.has(sourceId)) {
          childrenByParent.set(sourceId, []);
        }
        childrenByParent.get(sourceId)!.push(targetNode);
      }
    });
  };

  force.strength = function(_strength?: number) {
    if (_strength === undefined) return strength;
    strength = _strength;
    return force;
  };

  force.links = function(_links?: Link[]) {
    if (_links === undefined) return links;
    links = _links;
    parentChildLinks = links.filter(link => link.type === 'parent-child');
    
    // Update parent-child relationships when links change
    if (nodesMap && nodesMap.size > 0) {
      childrenByParent = new Map();
      parentChildLinks.forEach(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetNode = typeof link.target === 'string' ? nodesMap.get(link.target) : link.target as Node;
        if (targetNode) {
          if (!childrenByParent.has(sourceId)) {
            childrenByParent.set(sourceId, []);
          }
          childrenByParent.get(sourceId)!.push(targetNode);
        }
      });
    }
    
    return force;
  };

  force.nodes = function(_nodes?: Node[]) {
    if (_nodes === undefined) return nodes;
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
    
    // Update parent-child relationships when nodes change
    if (parentChildLinks && parentChildLinks.length > 0) {
      childrenByParent = new Map();
      parentChildLinks.forEach(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetNode = typeof link.target === 'string' ? nodesMap.get(link.target) : link.target as Node;
        if (targetNode) {
          if (!childrenByParent.has(sourceId)) {
            childrenByParent.set(sourceId, []);
          }
          childrenByParent.get(sourceId)!.push(targetNode);
        }
      });
    }
    
    return force;
  };

  force.distance = function(_distance?: number) {
    if (_distance === undefined) return idealLinkDistance;
    idealLinkDistance = _distance;
    return force;
  };

  force.rootNodes = function(_rootNodes?: Set<string>) {
    if (_rootNodes === undefined) return rootNodes;
    rootNodes = _rootNodes;
    return force;
  };

  links = initialLinks;
  parentChildLinks = initialLinks.filter(link => link.type === 'parent-child');
  if (initialNodes) {
    nodes = initialNodes;
    nodesMap = new Map(initialNodes.map(n => [n.id, n]));
    
    // Initialize parent-child relationships
    childrenByParent = new Map();
    parentChildLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetNode = typeof link.target === 'string' ? nodesMap.get(link.target) : link.target as Node;
      if (targetNode) {
        if (!childrenByParent.has(sourceId)) {
          childrenByParent.set(sourceId, []);
        }
        childrenByParent.get(sourceId)!.push(targetNode);
      }
    });
  }

  return force;
}

// New force to create a true hierarchical layout with concentric rings - optimized for performance
export function createHierarchicalForce(
  initialNodes: Node[],
  initialLinks: Link[],
  strengthVal: number,
  levelDistanceVal: number,
  rootNodeIds?: Set<string>
): d3.Force<Node, Link> {
  let nodes: Node[] = [];
  let links: Link[] = [];
  let parentChildLinks: Link[] = [];
  let nodesMap: Map<string, Node> = new Map();
  let strength = strengthVal;
  let levelDistance = levelDistanceVal;
  let identifiedRootNodes: Set<string> = rootNodeIds || new Set();
  
  // Pre-computed data structures for better performance
  let rootNodes: Node[] = [];
  let childNodes = new Set<string>();
  let childrenByParent = new Map<string, string[]>();
  let parentByChild = new Map<string, string>();
  let distanceFromRoot = new Map<string, number>();
  let siblingPositions = new Map<string, {angle: number, totalSiblings: number}>();
  let maxDepth = 0;
  
  function calculateHierarchy() {
    // Reset data structures
    rootNodes = [];
    childNodes = new Set<string>();
    childrenByParent = new Map<string, string[]>();
    parentByChild = new Map<string, string>();
    distanceFromRoot = new Map<string, number>();
    siblingPositions = new Map<string, {angle: number, totalSiblings: number}>();
    
    // Use the provided root node IDs if available, otherwise fall back to automatic detection
    if (identifiedRootNodes.size > 0) {
      nodes.forEach(node => {
        if (identifiedRootNodes.has(node.id)) {
          rootNodes.push(node);
        }
      });
    } else {
      // Fallback: identify root nodes (nodes with no parents)
      parentChildLinks.forEach(link => {
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        childNodes.add(targetId);
      });
      
      nodes.forEach(node => {
        if (!childNodes.has(node.id)) {
          rootNodes.push(node);
        }
      });
      
      // If no root nodes found, use the node with the lowest level as root
      if (rootNodes.length === 0 && nodes.length > 0) {
        let lowestLevel = Infinity;
        let lowestLevelNode = nodes[0];
        
        nodes.forEach(node => {
          if (node.level < lowestLevel) {
            lowestLevel = node.level;
            lowestLevelNode = node;
          }
        });
        
        rootNodes.push(lowestLevelNode);
      }
    }
    
    // Build node hierarchy (parent -> children mapping)
    parentChildLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
      
      if (!childrenByParent.has(sourceId)) {
        childrenByParent.set(sourceId, []);
      }
      childrenByParent.get(sourceId)!.push(targetId);
      parentByChild.set(targetId, sourceId);
    });
    
    // Calculate distance from each node to root
    function calculateDistanceFromRoot(nodeId: string, distance: number) {
      distanceFromRoot.set(nodeId, distance);
      
      const children = childrenByParent.get(nodeId) || [];
      children.forEach(childId => {
        calculateDistanceFromRoot(childId, distance + 1);
      });
    }
    
    rootNodes.forEach(root => {
      calculateDistanceFromRoot(root.id, 0);
    });
    
    // Calculate the maximum depth of the tree
    maxDepth = 0;
    distanceFromRoot.forEach(depth => {
      if (depth > maxDepth) maxDepth = depth;
    });
    
    // Pre-calculate sibling positions
    childrenByParent.forEach((siblings, parentId) => {
      const totalSiblings = siblings.length;
      siblings.forEach((nodeId, index) => {
        let angle = 0;
        if (totalSiblings > 1) {
          angle = (2 * Math.PI * index) / totalSiblings;
        }
        siblingPositions.set(nodeId, {angle, totalSiblings});
      });
    });
  }
  
  function force(alpha: number) {
    if (!nodes || !parentChildLinks || !nodesMap || nodes.length === 0) return;
    
    const scaledAlpha = alpha * strength;
    
    // For each node, position it based on its level from root
    nodes.forEach(node => {
      if (!node.x || !node.y) {
        // Initialize position if undefined
        node.x = (Math.random() - 0.5) * 100;
        node.y = (Math.random() - 0.5) * 100;
      }
      
      const nodeDepth = distanceFromRoot.get(node.id) || 0;
      
      // Root nodes stay at center
      if (nodeDepth === 0) {
        // Apply a very small force to keep root nodes near the center
        node.vx = (node.vx || 0) + (0 - node.x) * scaledAlpha * 0.5;
        node.vy = (node.vy || 0) + (0 - node.y) * scaledAlpha * 0.5;
        return;
      }
      
      // Get parent node
      const parentId = parentByChild.get(node.id);
      if (!parentId) return; // Skip if no parent (should be root)
      
      const parentNode = nodesMap.get(parentId);
      if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) return;
      
      // Calculate the radius for this level (increasing with depth)
      const radius = nodeDepth * levelDistance;
      
      // Get pre-calculated sibling position
      const siblingPosition = siblingPositions.get(node.id);
      if (!siblingPosition) return;
      
      const angle = siblingPosition.angle;
      
      // Calculate target position
      let targetX = 0;
      let targetY = 0;
      
      if (nodeDepth === 1) {
        // First level nodes (direct children of root) distribute around center (0,0)
        // Use a larger radius for root children to give them more space for 360° distribution
        const rootChildRadius = radius * 1.5; // Increased spacing for root children
        targetX = rootChildRadius * Math.cos(angle);
        targetY = rootChildRadius * Math.sin(angle);
      } else {
        // Get grandparent position to maintain hierarchy direction
        const grandparentId = parentByChild.get(parentId);
        if (grandparentId) {
          const grandparent = nodesMap.get(grandparentId);
          if (grandparent && grandparent.x !== undefined && grandparent.y !== undefined) {
            // Calculate vector from grandparent to parent
            const dirX = parentNode.x - grandparent.x;
            const dirY = parentNode.y - grandparent.y;
            const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
            
            if (dirLength > 0.001) {
              // Normalize and scale by level distance
              const normDirX = dirX / dirLength;
              const normDirY = dirY / dirLength;
              
              // Position along the same direction as parent-grandparent vector
              // but with some angular spread
              const spreadAngle = angle - Math.PI / 2; // Distribute perpendicular to parent-grandparent line
              targetX = parentNode.x + levelDistance * (normDirX + 0.8 * Math.cos(spreadAngle));
              targetY = parentNode.y + levelDistance * (normDirY + 0.8 * Math.sin(spreadAngle));
            } else {
              // Fallback if parent and grandparent are too close
              targetX = parentNode.x + levelDistance * Math.cos(angle);
              targetY = parentNode.y + levelDistance * Math.sin(angle);
            }
          } else {
            // Fallback if no valid grandparent
            targetX = parentNode.x + levelDistance * Math.cos(angle);
            targetY = parentNode.y + levelDistance * Math.sin(angle);
          }
        } else {
          // Parent is a root node, distribute children in a circle with larger radius
          const rootChildDistance = levelDistance * 1.5; // More space for root children
          targetX = parentNode.x + rootChildDistance * Math.cos(angle);
          targetY = parentNode.y + rootChildDistance * Math.sin(angle);
        }
      }
      
      // Apply force toward target position - with performance optimization
      node.vx = (node.vx || 0) + (targetX - node.x) * scaledAlpha;
      node.vy = (node.vy || 0) + (targetY - node.y) * scaledAlpha;
    });
  }
  
  force.initialize = (_nodes: Node[], random?: () => number) => {
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
    calculateHierarchy();
  };
  
  force.strength = function(_strength?: number) {
    if (_strength === undefined) return strength;
    strength = _strength;
    return force;
  };
  
  force.links = function(_links?: Link[]) {
    if (_links === undefined) return links;
    links = _links;
    parentChildLinks = links.filter(link => link.type === 'parent-child');
    calculateHierarchy();
    return force;
  };
  
  force.nodes = function(_nodes?: Node[]) {
    if (_nodes === undefined) return nodes;
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
    calculateHierarchy();
    return force;
  };
  
  force.distance = function(_distance?: number) {
    if (_distance === undefined) return levelDistance;
    levelDistance = _distance;
    return force;
  };

  force.rootNodes = function(_rootNodes?: Set<string>) {
    if (_rootNodes === undefined) return identifiedRootNodes;
    identifiedRootNodes = _rootNodes;
    calculateHierarchy();
    return force;
  };

  links = initialLinks;
  parentChildLinks = initialLinks.filter(link => link.type === 'parent-child');
  if (initialNodes) {
    nodes = initialNodes;
    nodesMap = new Map(initialNodes.map(n => [n.id, n]));
    calculateHierarchy();
  }

  return force;
} 