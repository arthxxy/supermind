"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { findConnectedComponents } from "@/lib/graph-utils";
import type { Node, Link } from "@/lib/types";
import type { ViewProps, TreeNode } from "./shared-types";
import { parseMarkdownAndApplyStyles, CONSTANTS, identifyTrueRoots } from "./shared-types";

const {
  BASE_SVG_FONT_SIZE,
  LEVEL_DISTANCE,
  RING_RADIUS,
  MIN_RING_DISTANCE,
  NODE_RADIUS,
  OTHER_NODE_TEXT_OPACITY_ON_HOVER
} = CONSTANTS;

interface TreeViewProps extends ViewProps {
  onTreePositionsSave: (treeNodes: TreeNode[]) => void;
  onTreePositionsRestore: (treeNodes: TreeNode[]) => void;
}

export default function TreeView({
  graphData,
  selectedNode,
  editingNode,
  hoveredNodeId,
  enableHoverEffects,
  intraGraphCompactness,
  interGraphCompactness,
  duplicateNodeTransparency = 0.9,
  isZooming,
  containerRef,
  svgRef,
  onNodeClick,
  onNodeDoubleClick,
  onHoveredNodeChange,
  onBackgroundClick,
  onTreePositionsSave,
  onTreePositionsRestore,
  savedPositions
}: TreeViewProps) {
  const treeNodesRef = useRef<TreeNode[]>([]);
  const treeLinkElementsRef = useRef<d3.Selection<SVGLineElement, Link, SVGGElement, unknown> | null>(null);
  const treeTextElementsRef = useRef<d3.Selection<SVGTextElement, TreeNode, SVGGElement, unknown> | null>(null);
  const treeNodeElementsRef = useRef<d3.Selection<SVGGElement, TreeNode, SVGGElement, unknown> | null>(null);



  // Build tree structure from graph data
  const buildTreeStructure = (nodes: Node[], links: Link[]): TreeNode[][] => {
    const components = findConnectedComponents(nodes, links);
    const trees: TreeNode[][] = [];

    components.forEach(componentNodes => {
      const nodeMap = new Map<string, TreeNode>();
      const nodeToParentsMap = new Map<string, string[]>(); // Track multiple parents
      
      // First pass: identify all parent-child relationships
      links.forEach(link => {
        if (link.type === 'parent-child') {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          
          // Check if both nodes are in this component
          if (componentNodes.some(n => n.id === sourceId) && componentNodes.some(n => n.id === targetId)) {
            if (!nodeToParentsMap.has(targetId)) {
              nodeToParentsMap.set(targetId, []);
            }
            nodeToParentsMap.get(targetId)!.push(sourceId);
          }
        }
      });

      // Create TreeNode objects - for nodes with multiple parents, create duplicates
      const duplicateCounter = new Map<string, number>();
      
      componentNodes.forEach(node => {
        const parentIds = nodeToParentsMap.get(node.id) || [];
        
        if (parentIds.length <= 1) {
          // Single or no parent - create normal TreeNode
          nodeMap.set(node.id, {
            id: node.id,
            node: node,
            children: []
          });
        } else {
          // Multiple parents - create original for first parent + duplicates for additional parents
          
          // Original node for the first parent (gets full connections to children)
          nodeMap.set(node.id, {
            id: node.id,
            node: node,
            children: []
          });
          
          // Create duplicate nodes for additional parents (parent index 1 onwards)
          for (let i = 1; i < parentIds.length; i++) {
            const duplicateId = `${node.id}_dup_${i}`;
            duplicateCounter.set(node.id, (duplicateCounter.get(node.id) || 0) + 1);
            
            nodeMap.set(duplicateId, {
              id: duplicateId,
              node: node, // Same underlying node data
              children: [] // Duplicates start with no children - they won't inherit children
            });
          }
          
          // Create duplicate parent nodes near the original multi-parent child
          for (let i = 1; i < parentIds.length; i++) {
            const parentId = parentIds[i];
            const parentNode = componentNodes.find(n => n.id === parentId);
            if (parentNode) {
              const parentDuplicateId = `${parentId}_parent_dup_for_${node.id}`;
              
              nodeMap.set(parentDuplicateId, {
                id: parentDuplicateId,
                node: parentNode, // Same underlying parent node data
                children: [] // Parent duplicates will only connect to original multi-parent child
              });
            }
          }
        }
      });
      


      // Build parent-child relationships using the new node structure
      links.forEach(link => {
        if (link.type === 'parent-child') {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          
          // Check if both nodes are in this component
          if (!componentNodes.some(n => n.id === sourceId) || !componentNodes.some(n => n.id === targetId)) {
            return;
          }
          
          const parentIds = nodeToParentsMap.get(targetId) || [];
          const sourceTreeNode = nodeMap.get(sourceId);
          
          if (!sourceTreeNode || parentIds.length === 0) return;
          
          // Find which parent index this source is
          const parentIndex = parentIds.indexOf(sourceId);
          if (parentIndex === -1) return;
          
          if (parentIndex === 0) {
            // First parent connects to original node (which will get all the children)
            const targetTreeNode = nodeMap.get(targetId);
            if (targetTreeNode) {
              targetTreeNode.parent = sourceTreeNode;
              sourceTreeNode.children.push(targetTreeNode);
            }
            
            // Also create connections from parent duplicates to original child
            for (let i = 1; i < parentIds.length; i++) {
              const otherParentId = parentIds[i];
              const parentDuplicateId = `${otherParentId}_parent_dup_for_${targetId}`;
              const parentDuplicateNode = nodeMap.get(parentDuplicateId);
              
              if (parentDuplicateNode && targetTreeNode) {
                // Connect parent duplicate to original child
                parentDuplicateNode.children.push(targetTreeNode);
                // Note: Don't set parent on targetTreeNode as it already has the first parent
              }
            }
          } else {
            // Additional parents connect to duplicate nodes (which have no children)
            const duplicateId = `${targetId}_dup_${parentIndex}`;
            const duplicateTreeNode = nodeMap.get(duplicateId);
            if (duplicateTreeNode) {
              duplicateTreeNode.parent = sourceTreeNode;
              sourceTreeNode.children.push(duplicateTreeNode);
            }
          }
        }
      });

      // After building relationships, handle parent duplicates
      // Parent duplicates should be isolated - only connect to their target child
      nodeMap.forEach((treeNode, treeNodeId) => {
        if (treeNodeId.includes('_parent_dup_for_')) {
          // Extract original parent ID from duplicate ID
          const match = treeNodeId.match(/^(.+)_parent_dup_for_(.+)$/);
          if (match) {
            const originalParentId = match[1];
            const originalParentTreeNode = nodeMap.get(originalParentId);
            
            if (originalParentTreeNode) {
              // Duplicate parents should be isolated - no parent assigned
              // They will only connect to the original multi-parent child
              treeNode.parent = undefined;
              
              // Ensure the duplicate parent has the same level as the original parent
              if (treeNode.node.level !== originalParentTreeNode.node.level) {
                treeNode.node = {
                  ...treeNode.node,
                  level: originalParentTreeNode.node.level
                };
              }
              
              // Duplicate parents are never roots - they are positioning helpers
              treeNode.isRoot = false;
            }
          }
        }
      });

             // Find potential root nodes (nodes without parents, excluding parent duplicates)
       const potentialRoots: TreeNode[] = [];
       nodeMap.forEach(treeNode => {
         if (!treeNode.parent && !treeNode.id.includes('_parent_dup_for_')) {
           potentialRoots.push(treeNode);
         }
       });

       // If no nodes without parents, pick the node with minimum level
       if (potentialRoots.length === 0 && componentNodes.length > 0) {
         const minLevel = Math.min(...componentNodes.map(n => n.level));
         const candidateNodes = componentNodes.filter(n => n.level === minLevel);
         if (candidateNodes.length > 0) {
           const rootTreeNode = nodeMap.get(candidateNodes[0].id);
           if (rootTreeNode) {
             potentialRoots.push(rootTreeNode);
           }
         }
       }

       // Determine which potential roots are true hierarchical roots
       const rootNodes = identifyTrueRoots(potentialRoots, nodeMap, links, componentNodes) as TreeNode[];
       
       // Handle friend-only nodes that were filtered out by identifyTrueRoots
       const friendOnlyNodes: TreeNode[] = [];
       const parentDuplicates: TreeNode[] = [];
       
       potentialRoots.forEach(potentialRoot => {
         if (!rootNodes.includes(potentialRoot)) {
           // Check if this is a parent duplicate
           if (potentialRoot.id.includes('_parent_dup_for_')) {
             parentDuplicates.push(potentialRoot);
           } else {
             // This node was filtered out - check if it has friend connections
             const hasFriendConnections = links.some(link => {
               const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
               const targetId = typeof link.target === 'string' ? link.target : link.target.id;
               return link.type === 'friend' && (sourceId === potentialRoot.id || targetId === potentialRoot.id);
             });
             
             if (hasFriendConnections) {
               potentialRoot.isFriendOnly = true;
               friendOnlyNodes.push(potentialRoot);
             }
           }
         }
       });

      trees.push([...rootNodes, ...friendOnlyNodes, ...parentDuplicates]);
    });

    return trees;
  };

  // Calculate tree layout positions
  const calculateTreeLayout = (treeRoots: TreeNode[], centerX: number, centerY: number): TreeNode[] => {
    // Adjust distances based on compactness settings
    const intraScale = (Math.max(0, Math.min(10, intraGraphCompactness)) / 10)
    const levelDist = LEVEL_DISTANCE * (1 - 0.4 * intraScale) // up to 40% tighter at max compactness

    const allNodes: TreeNode[] = [];
    
    // Separate different types of nodes
    const hierarchicalRoots = treeRoots.filter(root => !root.isFriendOnly && !root.id.includes('_parent_dup_for_'));
    const friendOnlyNodes = treeRoots.filter(root => root.isFriendOnly);
    const parentDuplicates = treeRoots.filter(root => root.id.includes('_parent_dup_for_'));

    // Layout hierarchical trees first
    if (hierarchicalRoots.length === 1) {
      const root = hierarchicalRoots[0];
      root.x = centerX;
      root.y = centerY;
      root.distance = 0;
      
      allNodes.push(root);
      layoutSubtree(root, 0, 2 * Math.PI, allNodes, levelDist);
    } else if (hierarchicalRoots.length > 1) {
      // Multiple hierarchical roots - arrange in circle
      hierarchicalRoots.forEach((root, index) => {
        const angle = (2 * Math.PI / hierarchicalRoots.length) * index;
        root.x = centerX + levelDist * 0.5 * Math.cos(angle);
        root.y = centerY + levelDist * 0.5 * Math.sin(angle);
        root.distance = levelDist * 0.5;
        
        allNodes.push(root);
        layoutSubtree(root, angle - Math.PI / 4, angle + Math.PI / 4, allNodes, levelDist);
      });
    }
    
    // Position friend-only nodes near their friend connections
    friendOnlyNodes.forEach(friendNode => {
      positionFriendOnlyNode(friendNode, allNodes, graphData.links, levelDist);
      allNodes.push(friendNode);
    });
    
    // Add parent duplicates to allNodes first (they'll be positioned later)
    parentDuplicates.forEach(parentDup => {
      allNodes.push(parentDup);
    });
    
    // Position parent duplicates near their original child
    hierarchicalRoots.forEach(rootNode => {
      positionParentDuplicates(rootNode, allNodes, levelDist);
    });

    return allNodes;
  };

  // Position parent duplicates near their original child
  const positionParentDuplicates = (rootNode: TreeNode, allNodes: TreeNode[], levelDist: number) => {
    const visitedNodes = new Set<string>();
    
    const positionDuplicatesRecursively = (node: TreeNode) => {
      if (visitedNodes.has(node.id)) return;
      visitedNodes.add(node.id);
      
      // Look for parent duplicates that connect to this node
      const parentDuplicates = allNodes.filter(n => 
        n.id.includes('_parent_dup_for_') && 
        n.children.some(child => child.id === node.id)
      );
      
      if (parentDuplicates.length > 0 && node.x !== undefined && node.y !== undefined) {
        // Position parent duplicates around the original child node
        const angleStep = (2 * Math.PI) / Math.max(parentDuplicates.length, 4);
        const radius = levelDist * 0.6; // Closer than normal parent-child distance
        
        parentDuplicates.forEach((parentDup, index) => {
          const angle = angleStep * index;
          parentDup.x = node.x! + radius * Math.cos(angle);
          parentDup.y = node.y! + radius * Math.sin(angle);
          parentDup.distance = (node.distance || 0) - radius; // Slightly closer to root
          
          if (!allNodes.includes(parentDup)) {
            allNodes.push(parentDup);
          }
        });
      }
      
      // Recursively position duplicates for children
      node.children.forEach(child => {
        positionDuplicatesRecursively(child);
      });
    };
    
    positionDuplicatesRecursively(rootNode);
  };

  // Position friend-only node near its friend connections
  const positionFriendOnlyNode = (friendNode: TreeNode, placedNodes: TreeNode[], links: Link[], levelDist: number) => {
    // Find all friend connections for this node
    const friendConnections = links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return link.type === 'friend' && (sourceId === friendNode.id || targetId === friendNode.id);
    });
    
    if (friendConnections.length === 0) {
      // No friend connections found, place at origin as fallback
      friendNode.x = 0;
      friendNode.y = 0;
      friendNode.distance = 0;
      return;
    }
    
    // Find the positions of connected friends that are already placed
    const connectedFriends: { x: number; y: number }[] = [];
    friendConnections.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      const connectedNodeId = sourceId === friendNode.id ? targetId : sourceId;
      
      const connectedNode = placedNodes.find(node => node.id === connectedNodeId);
      if (connectedNode && connectedNode.x !== undefined && connectedNode.y !== undefined) {
        connectedFriends.push({ x: connectedNode.x, y: connectedNode.y });
      }
    });
    
    if (connectedFriends.length === 0) {
      // No connected friends placed yet, place at a default position
      friendNode.x = levelDist * 1.5; // Place away from center
      friendNode.y = 0;
      friendNode.distance = levelDist * 1.5;
      return;
    }
    
    // Calculate average position of connected friends
    const avgX = connectedFriends.reduce((sum, friend) => sum + friend.x, 0) / connectedFriends.length;
    const avgY = connectedFriends.reduce((sum, friend) => sum + friend.y, 0) / connectedFriends.length;
    
    // Position friend node at a distance from the average position
    const offsetDistance = levelDist * 0.8; // Slightly closer than parent-child distance
    // Use a more deterministic angle based on node ID to avoid randomness
    const nodeIdNum = parseInt(friendNode.id.replace(/\D/g, '')) || 0;
    const angle = (nodeIdNum * 1.618) % (2 * Math.PI); // Golden ratio for better distribution
    
    friendNode.x = avgX + offsetDistance * Math.cos(angle);
    friendNode.y = avgY + offsetDistance * Math.sin(angle);
    friendNode.distance = Math.sqrt(friendNode.x * friendNode.x + friendNode.y * friendNode.y);
  };

  // Layout a subtree recursively
  const layoutSubtree = (parent: TreeNode, startAngle: number, endAngle: number, allNodes: TreeNode[], levelDist: number) => {
    if (parent.children.length === 0) return;

    const parentX = parent.x!;
    const parentY = parent.y!;
    const parentDistance = parent.distance!;

    // Determine if we should use ring distribution
    // For root nodes: use ring distribution starting from 2 children for 360° distribution
    // For non-root nodes: keep original behavior (4+ children, all leaf nodes)
    const isRootNode = parent.isRoot;
    const shouldUseRing = isRootNode ? 
      (parent.children.length >= 2) : 
      (parent.children.length >= 4 && parent.children.every(child => child.children.length === 0));

    if (shouldUseRing) {
      // Ring distribution around parent
      layoutChildrenInRing(parent, allNodes, isRootNode, levelDist);
    } else {
      // Normal hierarchical layout
      const angleSpan = endAngle - startAngle;
      const childAngleStep = angleSpan / Math.max(1, parent.children.length - 1);
      
      parent.children.forEach((child, index) => {
        const childAngle = parent.children.length === 1 ? 
          (startAngle + endAngle) / 2 : 
          startAngle + index * childAngleStep;
        
        const childDistance = parentDistance + levelDist;
        
        child.angle = childAngle;
        child.distance = childDistance;
        child.x = parentX + levelDist * Math.cos(childAngle);
        child.y = parentY + levelDist * Math.sin(childAngle);
        
        allNodes.push(child);
        
        // Recursively layout children
        const childSpan = Math.min(Math.PI / 2, angleSpan / parent.children.length);
        layoutSubtree(child, childAngle - childSpan / 2, childAngle + childSpan / 2, allNodes, levelDist);
      });
    }
  };

  // Layout children in a ring around their parent
  const layoutChildrenInRing = (parent: TreeNode, allNodes: TreeNode[], isRootNode = false, levelDist: number = LEVEL_DISTANCE) => {
    const parentX = parent.x!;
    const parentY = parent.y!;
    const parentDistance = parent.distance!;
    
    // Calculate ring radius ensuring minimum distance from grandparent
    // For root nodes, use a larger radius for better 360° distribution
    let ringRadius: number = isRootNode ? RING_RADIUS * 1.8 : RING_RADIUS;
    if (parent.parent) {
      const distanceToGrandparent = Math.sqrt(
        Math.pow(parentX - parent.parent.x!, 2) + 
        Math.pow(parentY - parent.parent.y!, 2)
      );
      const minRequiredRadius = Math.max(0, MIN_RING_DISTANCE - distanceToGrandparent + NODE_RADIUS);
      ringRadius = Math.max(ringRadius, minRequiredRadius);
    }
    
    // Place children in ring
    parent.children.forEach((child, index) => {
      const ringAngle = (2 * Math.PI / parent.children.length) * index;
      
      child.angle = ringAngle;
      child.distance = parentDistance + ringRadius; // Distance from root, not parent
      child.x = parentX + ringRadius * Math.cos(ringAngle);
      child.y = parentY + ringRadius * Math.sin(ringAngle);
      child.isRingChild = true;
      
      allNodes.push(child);
      
      // Continue recursive layout for children of ring children
      if (child.children.length > 0) {
        const childSpan = Math.PI / 3; // Give each ring child a reasonable angular span for their subtree
        layoutSubtree(child, ringAngle - childSpan / 2, ringAngle + childSpan / 2, allNodes, levelDist);
      }
    });
  };

  // Apply repulsion forces between sibling nodes to prevent overlapping
  const applyTreeRepulsionForces = (allTreeNodes: TreeNode[], nodeElements: d3.Selection<SVGGElement, TreeNode, SVGGElement, unknown>) => {
    const MIN_DISTANCE = 50; // Minimum distance between siblings
    const REPULSION_STRENGTH = 0.3; // How strong the repulsion force is
    const ITERATIONS = 20; // Number of iterations to run the simulation
    
    // Group nodes by their parent (siblings)
    const siblingGroups = new Map<string | undefined, TreeNode[]>();
    
    allTreeNodes.forEach(node => {
      const parentId = node.parent?.id || 'root';
      if (!siblingGroups.has(parentId)) {
        siblingGroups.set(parentId, []);
      }
      siblingGroups.get(parentId)!.push(node);
    });

    // Run repulsion simulation for multiple iterations
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      // First: Apply sibling repulsion (existing logic)
      siblingGroups.forEach((siblings, parentId) => {
        if (siblings.length < 2) return; // No repulsion needed for single child
        
        // Skip ring children as they're already positioned in a ring
        const nonRingSiblings = siblings.filter(s => !s.isRingChild);
        if (nonRingSiblings.length < 2) return;
        
        // Apply repulsion forces between siblings
        for (let i = 0; i < nonRingSiblings.length; i++) {
          for (let j = i + 1; j < nonRingSiblings.length; j++) {
            const nodeA = nonRingSiblings[i];
            const nodeB = nonRingSiblings[j];
            
            if (!nodeA.x || !nodeA.y || !nodeB.x || !nodeB.y) continue;
            
            const dx = nodeB.x - nodeA.x;
            const dy = nodeB.y - nodeA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < MIN_DISTANCE && distance > 0) {
              const force = (MIN_DISTANCE - distance) * REPULSION_STRENGTH;
              const normalizedDx = dx / distance;
              const normalizedDy = dy / distance;
              
              // Apply force to both nodes (Newton's third law)
              nodeA.x -= normalizedDx * force * 0.5;
              nodeA.y -= normalizedDy * force * 0.5;
              nodeB.x += normalizedDx * force * 0.5;
              nodeB.y += normalizedDy * force * 0.5;
            }
          }
        }
      });
      
      // Second: Apply selective repulsion between nodes from different parents
      applyInterParentRepulsion(allTreeNodes);
      
      // Apply constraints to maintain hierarchy
      applyHierarchicalConstraints(allTreeNodes);
    }
    
    // Update visual positions after simulation
    nodeElements.attr("transform", (d: TreeNode) => `translate(${d.x || 0},${d.y || 0})`);
    
    // Update link positions if needed
    updateTreeLinkPositions(allTreeNodes);
  };

  // Apply selective repulsion between nodes from different parents to prevent overlapping
  const applyInterParentRepulsion = (allTreeNodes: TreeNode[]) => {
    const MIN_INTER_DISTANCE = 45; // Slightly smaller than sibling distance to allow closer proximity
    const INTER_REPULSION_STRENGTH = 0.15; // Weaker than sibling repulsion to preserve hierarchy
    
    // Apply repulsion only between nodes that are too close and have different parents
    for (let i = 0; i < allTreeNodes.length; i++) {
      for (let j = i + 1; j < allTreeNodes.length; j++) {
        const nodeA = allTreeNodes[i];
        const nodeB = allTreeNodes[j];
        
        // Skip if nodes have the same parent (handled by sibling repulsion)
        if (nodeA.parent?.id === nodeB.parent?.id) continue;
        
        // Skip if either node has undefined position
        if (!nodeA.x || !nodeA.y || !nodeB.x || !nodeB.y) continue;
        
        // Skip ring children as they're already positioned optimally
        if (nodeA.isRingChild || nodeB.isRingChild) continue;
        
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only apply repulsion if nodes are too close
        if (distance < MIN_INTER_DISTANCE && distance > 0) {
          const force = (MIN_INTER_DISTANCE - distance) * INTER_REPULSION_STRENGTH;
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          // Apply gentler force to preserve hierarchical structure
          nodeA.x -= normalizedDx * force * 0.5;
          nodeA.y -= normalizedDy * force * 0.5;
          nodeB.x += normalizedDx * force * 0.5;
          nodeB.y += normalizedDy * force * 0.5;
        }
      }
    }
  };

  // Apply hierarchical constraints to maintain tree structure
  const applyHierarchicalConstraints = (allTreeNodes: TreeNode[]) => {
    allTreeNodes.forEach(node => {
      if (!node.parent || !node.x || !node.y || !node.parent.x || !node.parent.y) return;
      
      // Ensure child is at minimum distance from parent
      const parentX = node.parent.x;
      const parentY = node.parent.y;
      const dx = node.x - parentX;
      const dy = node.y - parentY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      
      // Don't constrain ring children as strongly
      if (node.isRingChild) return;
      
      const minDistanceFromParent = LEVEL_DISTANCE * 0.8; // 80% of level distance
      
      if (currentDistance < minDistanceFromParent) {
        const scale = minDistanceFromParent / currentDistance;
        node.x = parentX + dx * scale;
        node.y = parentY + dy * scale;
      }
      
      // Maintain general direction from parent
      if (node.angle !== undefined) {
        const targetX = parentX + minDistanceFromParent * Math.cos(node.angle);
        const targetY = parentY + minDistanceFromParent * Math.sin(node.angle);
        
        // Blend current position with target position (soft constraint)
        const blendFactor = 0.1;
        node.x = node.x * (1 - blendFactor) + targetX * blendFactor;
        node.y = node.y * (1 - blendFactor) + targetY * blendFactor;
      }
    });
  };

  // Update tree link positions
  const updateTreeLinkPositions = (allTreeNodes: TreeNode[]) => {
    if (!treeLinkElementsRef.current) return;
    
    treeLinkElementsRef.current
      .attr("x1", (d: any) => {
        // Use stored TreeNode ID for proper positioning
        const sourceTreeNode = allTreeNodes.find(tn => tn.id === d.sourceTreeNodeId);
        return sourceTreeNode?.x || 0;
      })
      .attr("y1", (d: any) => {
        const sourceTreeNode = allTreeNodes.find(tn => tn.id === d.sourceTreeNodeId);
        return sourceTreeNode?.y || 0;
      })
      .attr("x2", (d: any) => {
        // Use stored TreeNode ID for proper positioning
        const targetTreeNode = allTreeNodes.find(tn => tn.id === d.targetTreeNodeId);
        return targetTreeNode?.x || 0;
      })
      .attr("y2", (d: any) => {
        const targetTreeNode = allTreeNodes.find(tn => tn.id === d.targetTreeNodeId);
        return targetTreeNode?.y || 0;
      });
  };

  // Update visual styles for tree mode
  const updateTreeVisualStyles = (
    currentHoverId: string | null,
    isHoverEnabled: boolean,
    allTreeNodes: TreeNode[],
    linkElements: d3.Selection<SVGLineElement, Link, SVGGElement, unknown>,
    textElements: d3.Selection<SVGTextElement, TreeNode, SVGGElement, unknown>,
    nodeElements: d3.Selection<SVGGElement, TreeNode, SVGGElement, unknown>,
    duplicateTransparency: number
  ) => {
    let directlyConnectedToHovered = new Set<string>();
    if (isHoverEnabled && currentHoverId) {
      directlyConnectedToHovered.add(currentHoverId);
      
      // Find connected nodes using tree structure relationships
      const hoveredTreeNode = allTreeNodes.find(tn => tn.id === currentHoverId);
      if (hoveredTreeNode) {
        // Add parent
        if (hoveredTreeNode.parent) {
          directlyConnectedToHovered.add(hoveredTreeNode.parent.id);
        }
        
        // Add children
        hoveredTreeNode.children.forEach(child => {
          directlyConnectedToHovered.add(child.id);
        });
      }
      
      // Find all duplicates of the hovered node and their additional parents
      const originalNodeId = hoveredTreeNode?.node.id || currentHoverId;
      allTreeNodes.forEach(treeNode => {
        // If this is a duplicate of the hovered node, highlight it and its parent
        if (treeNode.node.id === originalNodeId && treeNode.id !== currentHoverId) {
          directlyConnectedToHovered.add(treeNode.id);
          if (treeNode.parent) {
            directlyConnectedToHovered.add(treeNode.parent.id);
          }
        }
        
        // If this node's original is the hovered node, highlight it too
        if (treeNode.id === currentHoverId && treeNode.node.id === originalNodeId) {
          // Find all other instances (original + duplicates) of this node
          allTreeNodes.forEach(otherTreeNode => {
            if (otherTreeNode.node.id === originalNodeId && otherTreeNode.id !== currentHoverId) {
              directlyConnectedToHovered.add(otherTreeNode.id);
              if (otherTreeNode.parent) {
                directlyConnectedToHovered.add(otherTreeNode.parent.id);
              }
            }
          });
        }
      });
      
      // If hovering over a parent duplicate, highlight the original parent and child duplicates
      if (currentHoverId && currentHoverId.includes('_parent_dup_for_')) {
        // Extract original parent ID and child ID from the duplicate ID
        const match = currentHoverId.match(/^(.+)_parent_dup_for_(.+)$/);
        if (match) {
          const [, originalParentId, childId] = match;
          
          // Highlight the original parent
          directlyConnectedToHovered.add(originalParentId);
          
          // Highlight all child duplicates for this child
          allTreeNodes.forEach(treeNode => {
            if (treeNode.node.id === childId) {
              directlyConnectedToHovered.add(treeNode.id);
            }
          });
        }
      }
      
      // If hovering over an original parent that has duplicates, highlight the duplicates too
      allTreeNodes.forEach(treeNode => {
        if (treeNode.id.includes('_parent_dup_for_') && treeNode.node.id === currentHoverId) {
          directlyConnectedToHovered.add(treeNode.id);
        }
      });
      
      // Also find friend connections from the original link data
      graphData.links.forEach(link => {
        if (link.type === 'friend') {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          
          // If one end of the friend link is hovered, highlight the other end
          if (sourceId === currentHoverId) {
            const targetTreeNode = allTreeNodes.find(tn => tn.id === targetId);
            if (targetTreeNode) {
              directlyConnectedToHovered.add(targetTreeNode.id);
            }
          }
          
          if (targetId === currentHoverId) {
            const sourceTreeNode = allTreeNodes.find(tn => tn.id === sourceId);
            if (sourceTreeNode) {
              directlyConnectedToHovered.add(sourceTreeNode.id);
            }
          }
        }
      });
    }

    // Update node styles
    nodeElements.selectAll<SVGCircleElement, TreeNode>(".node-base")
      .attr("fill", d => {
        if (isHoverEnabled && d.id === currentHoverId) return "transparent"; // Transparent fill for hover (only show stroke)
        return d.isRoot ? "white" : "transparent"; // White fill for root nodes
      })
      .attr("stroke", d => {
        if (isHoverEnabled && d.id === currentHoverId) return "rgba(200,200,255,0.7)";
        if (d.isRoot) return "#ffffff"; // White border for true root nodes
        if (d.isRingChild) return "#feca57"; // Yellow border for ring children
        return "transparent";
      })
      .attr("stroke-width", d => {
        if (isHoverEnabled && d.id === currentHoverId) return 2;
        if (d.isRoot) return 3; // Thick white border for root nodes
        if (d.isRingChild) return 2; // Medium border for ring children
        return 0;
      })
      .attr("opacity", d => {
        if (isHoverEnabled && d.id === currentHoverId) return 1; // Show hover circle
        return d.isRoot ? 1 : 0; // Only show white base circle for true root nodes or hovered nodes
      });
    
    // Update main node circles - preserve duplicate name transparency
    nodeElements.selectAll<SVGCircleElement, TreeNode>(".main-circle")
      .attr("opacity", (d: TreeNode) => {
        // Apply transparency to nodes with duplicate names
        const nodeName = d.node.name;
        const nodesWithSameName = allTreeNodes.filter(node => node.node.name === nodeName);
        if (nodesWithSameName.length > 1) {
          return duplicateTransparency;
        }
        return 1;
      });

    // Update link styles
    linkElements.attr("stroke", (d: Link) => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as Node).id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as Node).id;
        return (isHoverEnabled && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? "purple" : "#999";
      })
      .attr("stroke-width", (d: Link) => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as Node).id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as Node).id;
        return (isHoverEnabled && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? 3 : (d.type === "parent-child" ? 2 : 1);
      });

    // Update text styles
    textElements.each(function(d: TreeNode) {
        const element = d3.select(this);
        const styles = parseMarkdownAndApplyStyles(d.node.name, d.node.textStyle);
        const fontSize = (isHoverEnabled && currentHoverId && directlyConnectedToHovered.has(d.id)) ? 16 : styles.fontSize;
        
        element
          .text(styles.text)
          .attr("font-size", `${fontSize}px`)
          .style("font-weight", styles.fontWeight)
          .style("font-style", styles.fontStyle)
          .style("text-decoration", styles.textDecoration)
          .style("opacity", () => {
            let baseOpacity = 1.0;
            

            
            if (isHoverEnabled && currentHoverId) {
              if (directlyConnectedToHovered.has(d.id)) {
                return baseOpacity; 
              } else {
                return baseOpacity * OTHER_NODE_TEXT_OPACITY_ON_HOVER; 
              }
            } else { 
              return baseOpacity;
            }
          });
      });
  };

  // Tree layout rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");

    // Build tree structures for each component
    const treeComponents = buildTreeStructure(graphData.nodes, graphData.links);
    const allTreeNodes: TreeNode[] = [];
    
    // Layout each component
    treeComponents.forEach((treeRoots, componentIndex) => {
      if (treeRoots.length === 0) return;
      
      // Calculate center position for this component with improved spacing
      const angle = (2 * Math.PI / treeComponents.length) * componentIndex;
      
      // Improved inter-component distance calculation (similar to ForceView but adapted for tree layout)
      const numComponents = treeComponents.length;
      const effectiveInterGraphDivisor = Math.max(1, interGraphCompactness);
      const interGraphSpacingDivisor = effectiveInterGraphDivisor * 2.0; // Adjusted for tree layout
      
      // Higher minimum separation for tree layout (trees need more space than force layouts)
      const minComponentSeparation = 600; // Doubled minimum distance for tree layouts
      const compDistance = treeComponents.length > 1 ? Math.max(
        minComponentSeparation,
        (Math.min(width, height) / interGraphSpacingDivisor) * (Math.log(numComponents + 1) || 1)
      ) : 0;
      
      const centerX = treeComponents.length > 1 ? compDistance * Math.cos(angle) : 0;
      const centerY = treeComponents.length > 1 ? compDistance * Math.sin(angle) : 0;
      
      // Layout this component
      const componentNodes = calculateTreeLayout(treeRoots, centerX, centerY);
      allTreeNodes.push(...componentNodes);
    });

    // Store tree nodes reference
    treeNodesRef.current = allTreeNodes;

    // Restore tree positions if they exist
    if (savedPositions.tree.size > 0) {
      onTreePositionsRestore(allTreeNodes);
    }

    // Create links data for visualization - use tree structure relationships
    const linkData: Link[] = [];
    
    // Create links based on the actual tree structure we've built
    allTreeNodes.forEach(treeNode => {
      if (treeNode.parent) {
        // For duplicates, we need to look up the original node ID in graphData.links
        const originalParentId = treeNode.parent.id;
        const originalChildId = treeNode.id.includes('_dup_') ? treeNode.node.id : treeNode.id;
        
        const originalLink = graphData.links.find(link => {
          const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          return (sourceId === originalParentId && targetId === originalChildId);
        });
        
        if (originalLink) {
          linkData.push({
            ...originalLink,
            source: treeNode.parent.node,
            target: treeNode.node,
            // Store TreeNode IDs for proper positioning
            sourceTreeNodeId: treeNode.parent.id,
            targetTreeNodeId: treeNode.id
          } as any);
        }
      }
      
      // For parent duplicates, create links to their children (original child)
      if (treeNode.id.includes('_parent_dup_for_') && treeNode.children.length > 0) {
        treeNode.children.forEach(childTreeNode => {
          // Find the original link for this parent-child relationship
          const originalLink = graphData.links.find(link => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            return (sourceId === treeNode.node.id && targetId === childTreeNode.node.id);
          });
          
          if (originalLink) {
            linkData.push({
              ...originalLink,
              source: treeNode.node,
              target: childTreeNode.node,
              // Store TreeNode IDs for proper positioning
              sourceTreeNodeId: treeNode.id,
              targetTreeNodeId: childTreeNode.id
            } as any);
          }
        });
      }
    });
    

    
    // Add friend links between tree nodes
    graphData.links.forEach(link => {
      if (link.type === 'friend') {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        
        const sourceTreeNode = allTreeNodes.find(tn => tn.id === sourceId);
        const targetTreeNode = allTreeNodes.find(tn => tn.id === targetId);
        
        if (sourceTreeNode && targetTreeNode) {
          linkData.push({
            ...link,
            source: sourceTreeNode.node,
            target: targetTreeNode.node,
            // Store TreeNode IDs for proper positioning
            sourceTreeNodeId: sourceTreeNode.id,
            targetTreeNodeId: targetTreeNode.id
          } as any);
        }
      }
    });

    // Draw links
    const linkElements = g.append("g").attr("stroke", "#999").attr("stroke-opacity", 0.6)
      .selectAll<SVGLineElement, Link>("line")
      .data(linkData)
      .join("line")
      .attr("stroke-width", (d: Link) => d.type === "parent-child" ? 2 : 1)
      .attr("stroke-dasharray", (d: Link) => d.type === "friend" ? "5,5" : null)
      .attr("x1", (d: any) => {
        // Use stored TreeNode ID for proper positioning
        const sourceTreeNode = allTreeNodes.find(tn => tn.id === d.sourceTreeNodeId);
        return sourceTreeNode?.x || 0;
      })
      .attr("y1", (d: any) => {
        const sourceTreeNode = allTreeNodes.find(tn => tn.id === d.sourceTreeNodeId);
        return sourceTreeNode?.y || 0;
      })
      .attr("x2", (d: any) => {
        // Use stored TreeNode ID for proper positioning
        const targetTreeNode = allTreeNodes.find(tn => tn.id === d.targetTreeNodeId);
        return targetTreeNode?.x || 0;
      })
      .attr("y2", (d: any) => {
        const targetTreeNode = allTreeNodes.find(tn => tn.id === d.targetTreeNodeId);
        return targetTreeNode?.y || 0;
      });
    
    treeLinkElementsRef.current = linkElements;

    // Draw nodes
    const nodeElements = g
      .append("g")
      .selectAll<SVGGElement, TreeNode>(".node")
      .data(allTreeNodes)
      .join("g")
      .attr("class", "node")
      .attr("transform", (d: TreeNode) => `translate(${d.x || 0},${d.y || 0})`)
      .call(d3.drag<SVGGElement, TreeNode>()
        .on("start", (event, d: TreeNode) => {
          // Store initial position for dragging
          event.subject.fx = d.x ?? 0;
          event.subject.fy = d.y ?? 0;
        })
        .on("drag", function(event, d: TreeNode) {
          // Update TreeNode position
          d.x = event.x;
          d.y = event.y;
          // Update visual position
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
          // Update link positions
          updateTreeLinkPositions(allTreeNodes);
        })
        .on("end", (event, d: TreeNode) => {
          // Save tree layout positions after dragging
          onTreePositionsSave(allTreeNodes);
        })
      )
      .on("click", (event, d: TreeNode) => onNodeClick(d.node, event))
      .on("dblclick", (event, d: TreeNode) => onNodeDoubleClick(d.node, event))
      .on("pointerover", function(event, d: TreeNode) {
        event.stopPropagation();
        if (enableHoverEffects) {
          // For duplicates, use the original node ID for hover effects
          const hoverNodeId = d.id.includes('_dup_') ? d.node.id : d.id;
          onHoveredNodeChange(hoverNodeId);
        }
      })
      .on("pointerout", function(event, d: TreeNode) {
        event.stopPropagation();
        if (enableHoverEffects) {
          onHoveredNodeChange(null);
        }
      });

    treeNodeElementsRef.current = nodeElements;

    // Add node circles
    nodeElements.append("circle")
      .attr("r", 11)
      .attr("class", "node-base")
      .attr("fill", (d: TreeNode) => d.isRoot ? "white" : "transparent")
      .attr("stroke", (d: TreeNode) => {
        if (d.isRoot) return "#ffffff"; // White border for true root nodes
        if (d.isRingChild) return "#feca57"; // Yellow border for ring children
        return "transparent";
      })
      .attr("stroke-width", (d: TreeNode) => {
        if (d.isRoot) return 3; // Thick white border for root nodes
        if (d.isRingChild) return 2; // Medium border for ring children
        return 0;
      })
      .attr("opacity", (d: TreeNode) => d.isRoot ? 1 : 0); // Only show white base circle for true root nodes
      
    nodeElements.append("circle")
      .attr("r", 8)
      .attr("class", "main-circle")
      .attr("fill", (d: TreeNode) => d.node.color || "#999")
      .attr("opacity", (d: TreeNode) => {
        // Apply transparency to nodes with duplicate names
        const nodeName = d.node.name;
        const nodesWithSameName = allTreeNodes.filter(node => node.node.name === nodeName);
        if (nodesWithSameName.length > 1) {
          return duplicateNodeTransparency;
        }
        return 1;
      });

    // Add text labels
    const textElements = nodeElements.append("text")
      .attr("dx", 0).attr("dy", 20).attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-family", "sans-serif")
      .each(function(d: TreeNode) {
        const styles = parseMarkdownAndApplyStyles(d.node.name, d.node.textStyle);
        d3.select(this)
          .text(styles.text)
          .attr("font-size", `${styles.fontSize}px`)
          .style("font-weight", styles.fontWeight)
          .style("font-style", styles.fontStyle)
          .style("text-decoration", styles.textDecoration);
      });
    
    treeTextElementsRef.current = textElements;

    // Add zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoomBehavior)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    svg.on("click", (event: MouseEvent) => {
      if (event.target === svg.node()) {
        onBackgroundClick();
      }
    }, true);

    // Apply initial visual styles for tree mode
    updateTreeVisualStyles(hoveredNodeId, enableHoverEffects, allTreeNodes, linkElements, textElements, nodeElements, duplicateNodeTransparency);
    
    // Apply repulsion forces to prevent overlapping siblings
    applyTreeRepulsionForces(allTreeNodes, nodeElements);

    // Update positions after repulsion
    updateTreeLinkPositions(allTreeNodes);

  }, [graphData, intraGraphCompactness, interGraphCompactness, enableHoverEffects]);

  // Tree mode hover effects
  useEffect(() => {
    if (treeLinkElementsRef.current && treeTextElementsRef.current && treeNodeElementsRef.current) {
      updateTreeVisualStyles(
        hoveredNodeId,
        enableHoverEffects,
        treeNodesRef.current,
        treeLinkElementsRef.current,
        treeTextElementsRef.current,
        treeNodeElementsRef.current,
        duplicateNodeTransparency
      );
    }
  }, [hoveredNodeId, enableHoverEffects, duplicateNodeTransparency]);

  return null; // This component only handles D3 rendering
}
