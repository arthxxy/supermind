"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { findConnectedComponents, recalculateLevelsInComponent } from "@/lib/graph-utils";
import { createSiblingDistributionForce, createHierarchicalForce } from "@/lib/d3-custom-forces";
import type { Node, Link } from "@/lib/types";
import type { ViewProps } from "./shared-types";
import { parseMarkdownAndApplyStyles, CONSTANTS, identifyTrueRoots } from "./shared-types";

const {
  BASE_SVG_FONT_SIZE,
  FULLY_OPAQUE_EFFECTIVE_SIZE,
  INVISIBLE_EFFECTIVE_SIZE,
  OTHER_NODE_TEXT_OPACITY_ON_HOVER,
  MAX_INTERNAL_SCALE,
  MIN_INTERNAL_SCALE
} = CONSTANTS;

interface ForceViewProps extends ViewProps {
  onForcePositionsSave: (nodes: Node[]) => void;
  onForcePositionsRestore: (nodes: Node[]) => void;
}

export default function ForceView({
  graphData,
  selectedNode,
  editingNode,
  hoveredNodeId,
  enableHoverEffects,
  intraGraphCompactness,
  interGraphCompactness,
  isZooming,
  containerRef,
  svgRef,
  onNodeClick,
  onNodeDoubleClick,
  onHoveredNodeChange,
  onBackgroundClick,
  onForcePositionsSave,
  onForcePositionsRestore,
  savedPositions
}: ForceViewProps) {
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  
  // Refs for D3 selections
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, Node, SVGGElement, any> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, Link, SVGGElement, any> | null>(null);
  const textSelectionRef = useRef<d3.Selection<SVGTextElement, Node, SVGGElement, any> | null>(null);

  // Calculate scaling factors based on compactness
  const normalizedIntraGCompact = intraGraphCompactness / 10;
  const internalScale = MAX_INTERNAL_SCALE - normalizedIntraGCompact * (MAX_INTERNAL_SCALE - MIN_INTERNAL_SCALE);

  // Adjusted base values for stronger hierarchy
  const baseParentChildLinkDist = 60 * internalScale;
  const baseFriendLinkDist = 100 * internalScale;
  const baseMultiCompRadialLevelMultiplier = 100 * internalScale;
  const baseMultiCompRadialBaseOffset = 20 * internalScale;
  const baseSingleCompRadialLevelMultiplier = 110 * internalScale;
  const baseSingleCompRadialBaseOffset = 30 * internalScale;
  const baseManyBodyStrength = -600 * internalScale;
  const baseCollideRadius = 25 * internalScale;
  // Increased base distance for better 360° distribution of root children
  const baseSiblingDistForceIdealLinkDistance = 80 * internalScale;

  // Scaled values
  const scaledParentChildLinkDist = baseParentChildLinkDist;
  const scaledFriendLinkDist = baseFriendLinkDist;
  const scaledMultiCompRadialLevelMultiplier = baseMultiCompRadialLevelMultiplier;
  const scaledMultiCompRadialBaseOffset = baseMultiCompRadialBaseOffset;
  const scaledSingleCompRadialLevelMultiplier = baseSingleCompRadialLevelMultiplier;
  const scaledSingleCompRadialBaseOffset = baseSingleCompRadialBaseOffset;
  const scaledManyBodyStrength = baseManyBodyStrength;
  const scaledCollideRadius = baseCollideRadius;
  const scaledSiblingDistForceIdealLinkDistance = baseSiblingDistForceIdealLinkDistance;
  const fixedHighlightedFontSize = 16;

  // Visual styles update function
  const updateVisualStyles = (
    currentHoverId: string | null,
    isHoverEnabled: boolean,
    currentGraphData: typeof graphData,
    currentIntraGraphCompactness: number,
    svgNode: SVGSVGElement | null,
    linksSel: d3.Selection<SVGLineElement, Link, SVGGElement, any> | null,
    textsSel: d3.Selection<SVGTextElement, Node, SVGGElement, any> | null,
    nodesSel: d3.Selection<SVGGElement, Node, SVGGElement, any> | null,
    finalRootIds: Set<string>
  ) => {
    if (!svgNode || !linksSel || !textsSel || !nodesSel) return;

    const currentScale = d3.zoomTransform(svgNode).k;
    const effectiveFontSizeBase = BASE_SVG_FONT_SIZE * currentScale;

    let directlyConnectedToHovered = new Set<string>();
    if (isHoverEnabled && currentHoverId) {
      directlyConnectedToHovered.add(currentHoverId);
      currentGraphData.links.forEach(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        if (sourceId === currentHoverId) directlyConnectedToHovered.add(targetId);
        if (targetId === currentHoverId) directlyConnectedToHovered.add(sourceId);
      });
    }

    nodesSel.selectAll<SVGCircleElement, Node>(".node-base")
      .attr("fill", d_node => finalRootIds.has(d_node.id) ? "white" : "transparent")
      .attr("stroke", d_node => (isHoverEnabled && d_node.id === currentHoverId) ? "rgba(200,200,255,0.7)" : null)
      .attr("stroke-width", d_node => (isHoverEnabled && d_node.id === currentHoverId) ? 2 : null);

    linksSel.attr("stroke", (d_link: Link) => {
        const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
        const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
        return (isHoverEnabled && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? "purple" : "#999";
      })
      .attr("stroke-width", (d_link: Link) => {
        const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
        const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
        return (isHoverEnabled && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? 3 : (d_link.type === "parent-child" ? 2 : 1);
      })
      .attr("marker-start", (d_link: Link) => {
        if (d_link.type !== "parent-child") return null;
        const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
        const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
        return (isHoverEnabled && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? "url(#triangle-purple)" : "url(#triangle-default)";
      });

    textsSel.each(function(d_text: Node) {
        const element = d3.select(this);
        const styles = parseMarkdownAndApplyStyles(d_text.name, d_text.textStyle);
        const fontSize = (isHoverEnabled && currentHoverId && directlyConnectedToHovered.has(d_text.id)) ? fixedHighlightedFontSize : styles.fontSize;
        
        element
          .text(styles.text)
          .attr("font-size", `${fontSize}px`)
          .style("font-weight", styles.fontWeight)
          .style("font-style", styles.fontStyle)
          .style("text-decoration", styles.textDecoration)
          .style("opacity", () => {
            if (isHoverEnabled && currentHoverId) {
              if (directlyConnectedToHovered.has(d_text.id)) {
                return 1.0; 
              } else {
                return OTHER_NODE_TEXT_OPACITY_ON_HOVER; 
              }
            } else { 
              if (effectiveFontSizeBase >= FULLY_OPAQUE_EFFECTIVE_SIZE) return 1.0;
              if (effectiveFontSizeBase <= INVISIBLE_EFFECTIVE_SIZE) return 0;
              return d3.scaleLinear().domain([INVISIBLE_EFFECTIVE_SIZE, FULLY_OPAQUE_EFFECTIVE_SIZE]).range([0, 1.0]).clamp(true)(effectiveFontSizeBase);
            }
          });
      });
  };

  // Force layout rendering
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");

    // Restore force positions if they exist
    if (savedPositions.force.size > 0) {
      onForcePositionsRestore(graphData.nodes);
    }

    // Ensure links reference the current node instances from graphData.nodes
    const currentNodesMap = new Map(graphData.nodes.map(n => [n.id, n]));
    const processedLinks = graphData.links.map(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        const sourceNode = currentNodesMap.get(sourceId);
        const targetNode = currentNodesMap.get(targetId);

        if (!sourceNode || !targetNode) {
            console.warn("Orphaned link detected during processing, skipping: ", l, "Source ID:", sourceId, "Target ID:", targetId);
            return null; 
        }
        return {
            ...l,
            source: sourceNode,
            target: targetNode
        };
    }).filter(l => l !== null) as Link[];

    const components = findConnectedComponents(graphData.nodes, processedLinks);
    const nodeToComponentIndex = new Map<string, number>();
    const potentialRootNodeIds = new Set<string>();
    
    // Simple approach: Use Tree View logic by building the tree structure and extracting real roots
    const trees = [];
    components.forEach((comp, idx) => {
      comp.forEach(node => nodeToComponentIndex.set(node.id, idx));
      
      // Build tree structure for this component (same as Tree View)
      const nodeMap = new Map<string, any>();
      comp.forEach(node => {
        nodeMap.set(node.id, {
          id: node.id,
          node: node,
          children: [],
          parent: undefined,
          isRoot: false
        });
      });
      
      // Build parent-child relationships
      graphData.links.forEach(link => {
        if (link.type === 'parent-child') {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          const sourceTreeNode = nodeMap.get(sourceId);
          const targetTreeNode = nodeMap.get(targetId);
          
          if (sourceTreeNode && targetTreeNode) {
            sourceTreeNode.children.push(targetTreeNode);
            targetTreeNode.parent = sourceTreeNode;
          }
        }
      });
      
      // Find nodes without parents
      const compPotentialRoots = Array.from(nodeMap.values()).filter(treeNode => !treeNode.parent);
      
      // If no clear root, pick the node with minimum level
      if (compPotentialRoots.length === 0 && comp.length > 0) {
        const minLevel = Math.min(...comp.map(n => n.level));
        const candidateNodes = comp.filter(n => n.level === minLevel);
        if (candidateNodes.length > 0) {
          const rootTreeNode = nodeMap.get(candidateNodes[0].id);
          if (rootTreeNode) {
            compPotentialRoots.push(rootTreeNode);
          }
        }
      }
      
      // Use identifyTrueRoots to get the real roots
      const trueRoots = identifyTrueRoots(compPotentialRoots, nodeMap, graphData.links, comp) as any[];
      trueRoots.filter(n => n.isRoot).forEach(root => potentialRootNodeIds.add(root.id));
    });

    // First, identify all connected components through friend relationships
    const friendConnectedGroups = new Map<string, Set<string>>();
    
    // Initialize each node as its own group
    graphData.nodes.forEach(node => {
      friendConnectedGroups.set(node.id, new Set([node.id]));
    });
    
    // Merge groups based on friend relationships
    processedLinks.forEach(link => {
      if (link.type === 'friend') {
        const sourceId = (link.source as Node).id;
        const targetId = (link.target as Node).id;
        
        // Find the groups containing source and target
        let sourceGroup: Set<string> | undefined;
        let targetGroup: Set<string> | undefined;
        
        // Find existing groups
        for (const [groupId, members] of friendConnectedGroups.entries()) {
          if (members.has(sourceId)) {
            sourceGroup = members;
          }
          if (members.has(targetId)) {
            targetGroup = members;
          }
        }
        
        // If both nodes are already in groups, merge the groups
        if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
          // Merge target into source
          targetGroup.forEach(nodeId => {
            sourceGroup?.add(nodeId);
            // Update the group reference for this node
            friendConnectedGroups.set(nodeId, sourceGroup!);
          });
        }
      }
    });
    
    // Identify the oldest node in each friend group
    const oldestInGroup = new Map<Set<string>, string>();
    for (const [nodeId, group] of friendConnectedGroups.entries()) {
      if (!oldestInGroup.has(group) || 
          parseInt(nodeId.split('-')[1] || '0') < parseInt(oldestInGroup.get(group)!.split('-')[1] || '0')) {
        oldestInGroup.set(group, nodeId);
      }
    }
    
    // Now determine final root nodes, excluding friend nodes that are not the oldest in their group
    const finalRootNodeIds = new Set<string>();
    potentialRootNodeIds.forEach(nodeId => {
      let isTrueDisplayRoot = true;
      
      // Check parent-child relationships
      for (const link of processedLinks) {
        if (link.type === 'parent-child') {
          const linkTarget = link.target as Node;
          const linkSource = link.source as Node;
          
          if (linkTarget.id === nodeId && potentialRootNodeIds.has(linkSource.id)) {
            isTrueDisplayRoot = false;
            break;
          }
        }
      }
      
      // Check if this is the oldest node in its friend group
      const nodeGroup = friendConnectedGroups.get(nodeId);
      if (nodeGroup && oldestInGroup.get(nodeGroup) !== nodeId) {
        isTrueDisplayRoot = false;
      }
      
      if (isTrueDisplayRoot) {
        finalRootNodeIds.add(nodeId);
      }
    });
    


    // Create a force simulation with improved damping
    const simulation = d3.forceSimulation<Node>(graphData.nodes)
      .force("link", d3.forceLink<Node, Link>(graphData.links)
        .id(d => d.id)
        .distance(link => link.type === "friend" ? scaledFriendLinkDist : scaledParentChildLinkDist)
        .strength(link => link.type === "friend" ? 0.3 : 0.8)
      )
      .force("charge", d3.forceManyBody().strength(scaledManyBodyStrength))
      .force("collide", d3.forceCollide().radius(scaledCollideRadius).strength(1.0).iterations(2))
      .alphaDecay(0.03) // Faster decay for quicker stabilization
      .velocityDecay(0.7) // Higher value to reduce oscillation and improve stability
      .alphaMin(0.005) // Higher minimum alpha for better stabilization

    if (components.length > 0) {
      if (components.length > 1) {
        const numComponents = components.length;
        const effectiveInterGraphDivisor = Math.max(1, interGraphCompactness);
        const interGraphSpacingDivisor = effectiveInterGraphDivisor * 1.5; // Reduced divisor for more separation
        
        // Increased minimum separation between components
        const minComponentSeparation = 300; // Minimum distance between component centers
        const componentAnchorRadius = Math.max(
          minComponentSeparation,
          (Math.min(width, height) / interGraphSpacingDivisor) * (Math.log(numComponents + 1) || 1)
        );
        
        const componentAnchors = components.map((_, i) => {
          const angle = (2 * Math.PI / components.length) * i;
          return { x: componentAnchorRadius * Math.cos(angle), y: componentAnchorRadius * Math.sin(angle) };
        });

        components.forEach((_componentNodes, i) => {
          const anchorX = componentAnchors[i].x;
          const anchorY = componentAnchors[i].y;
          
          // Stronger anchor forces to keep components separated
          simulation.force(`anchorX-${i}`, d3.forceX<Node>(anchorX).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.15 : 0));
          simulation.force(`anchorY-${i}`, d3.forceY<Node>(anchorY).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.15 : 0));
          simulation.force(`radial-${i}`, d3.forceRadial<Node>(
            (d) => (d.level * scaledMultiCompRadialLevelMultiplier) + scaledMultiCompRadialBaseOffset,
            anchorX, anchorY
          ).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.95 : 0));
        });

        // Add inter-component repulsion force to prevent overlapping
        simulation.force("componentRepulsion", () => {
          for (let i = 0; i < components.length; i++) {
            for (let j = i + 1; j < components.length; j++) {
              const comp1Nodes = components[i];
              const comp2Nodes = components[j];
              const anchor1 = componentAnchors[i];
              const anchor2 = componentAnchors[j];
              
              // Calculate distance between component centers
              const dx = anchor2.x - anchor1.x;
              const dy = anchor2.y - anchor1.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              // Apply repulsion if components are too close
              if (distance < minComponentSeparation * 1.5) {
                const repulsionStrength = 0.02;
                const normalizedDx = dx / distance;
                const normalizedDy = dy / distance;
                
                // Push comp1 nodes away from comp2 center
                comp1Nodes.forEach(node => {
                  if (node.x !== undefined && node.y !== undefined) {
                    node.vx = (node.vx || 0) - normalizedDx * repulsionStrength;
                    node.vy = (node.vy || 0) - normalizedDy * repulsionStrength;
                  }
                });
                
                // Push comp2 nodes away from comp1 center
                comp2Nodes.forEach(node => {
                  if (node.x !== undefined && node.y !== undefined) {
                    node.vx = (node.vx || 0) + normalizedDx * repulsionStrength;
                    node.vy = (node.vy || 0) + normalizedDy * repulsionStrength;
                  }
                });
              }
            }
          }
        });
      } else { // Single component
        simulation.force("center", d3.forceCenter(0, 0).strength(0.05));
        simulation.force("radial-0", d3.forceRadial<Node>(
          (d) => (d.level * scaledSingleCompRadialLevelMultiplier) + scaledSingleCompRadialBaseOffset, 0, 0)
          .strength(0.95));
      }
    }
    
    if (graphData.nodes.length > 0 && processedLinks.filter(l => l.type === 'parent-child').length > 0) {
       simulation.force("siblingDistribution", createSiblingDistributionForce(graphData.nodes, processedLinks, 0.7, scaledSiblingDistForceIdealLinkDistance, finalRootNodeIds));
       
       // Add hierarchical force to ensure children are farther from root than parents
       simulation.force("hierarchical", createHierarchicalForce(graphData.nodes, processedLinks, 0.8, scaledParentChildLinkDist * 0.8, finalRootNodeIds));
    }

    simulationRef.current = simulation;

    // Create link elements
    const linkElements = g.append("g").attr("stroke", "#999").attr("stroke-opacity", 0.6)
      .selectAll<SVGLineElement, Link>("line")
      .data(processedLinks)
      .join("line")
      .attr("stroke-width", (d: Link) => d.type === "parent-child" ? 2 : 1)
      .attr("stroke-dasharray", (d: Link) => d.type === "friend" ? "5,5" : null)
      .attr("marker-start", (d: Link) => d.type === "parent-child" ? "url(#triangle-default)" : null);
    linkSelectionRef.current = linkElements;

    // Create marker definitions
    const defs = svg.append("defs");
    
    defs.append("marker")
      .attr("id", "triangle-default")
      .attr("viewBox", "0 -2.025 16 4.05")
      .attr("refX", 0)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 16)
      .attr("markerHeight", 4.05)
      .append("path")
      .attr("d", "M0,-2.025L16,0L0,2.025Z")
      .attr("fill", "#999");

    defs.append("marker")
      .attr("id", "triangle-purple")
      .attr("viewBox", "0 -2.025 16 4.05")
      .attr("refX", 0)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 16)
      .attr("markerHeight", 4.05)
      .append("path")
      .attr("d", "M0,-2.025L16,0L0,2.025Z")
      .attr("fill", "purple");

    // Create node elements
    const nodeElements = g
      .append("g")
      .selectAll<SVGGElement, Node>(".node")
      .data(graphData.nodes)
      .join("g")
      .attr("class", "node")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (event, d: Node) => {
          d.fx = d.x ?? 0;
          d.fy = d.y ?? 0;
        })
        .on("drag", (event, draggedNode: Node) => {
          draggedNode.fx = event.x;
          draggedNode.fy = event.y;
        
          const repulsionThreshold = scaledCollideRadius * 2;
        
          graphData.nodes.forEach(otherNode => {
            if (otherNode.id === draggedNode.id || otherNode.fx !== null) return;
        
            const dx = (otherNode.x || 0) - (draggedNode.fx as number);
            const dy = (otherNode.y || 0) - (draggedNode.fy as number);
            let distance = Math.sqrt(dx * dx + dy * dy);
        
            if (distance < repulsionThreshold) {
              const overlap = repulsionThreshold - distance;
              if (distance === 0) {
                distance = 0.1;
                const randomAngle = Math.random() * 2 * Math.PI;
                otherNode.x = (otherNode.x || 0) + Math.cos(randomAngle) * 0.1;
                otherNode.y = (otherNode.y || 0) + Math.sin(randomAngle) * 0.1;
              }
              
              const moveX = (dx / distance) * overlap * 0.6;
              const moveY = (dy / distance) * overlap * 0.6;
        
              otherNode.x = (otherNode.x || 0) + moveX;
              otherNode.y = (otherNode.y || 0) + moveY;
            }
          });
        })
        .on("end", (event, d: Node) => {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          d.fx = null; 
          d.fy = null; 
          // Save force layout positions after dragging
          onForcePositionsSave(graphData.nodes);
        })
      )
      .on("click", (event, d_clk: Node) => { onNodeClick(d_clk, event); })
      .on("dblclick", (event, d_dblclk: Node) => { onNodeDoubleClick(d_dblclk, event); })
      .on("pointerover", function(event, hovered_d: Node) {
        event.stopPropagation();
        if (enableHoverEffects) {
          if (hoveredNodeId !== hovered_d.id) {
            onHoveredNodeChange(hovered_d.id);
          }
        }
      })
      .on("pointerout", function(event, d_out: Node) {
        event.stopPropagation();
        if (enableHoverEffects && !isZooming) {
          onHoveredNodeChange(null);
        }
      });
    nodeSelectionRef.current = nodeElements as any;

    nodeElements.append("circle").attr("r", 11).attr("class", "node-base")
                 .attr("fill", (d_node: Node) => finalRootNodeIds.has(d_node.id) ? "white" : "transparent");
    nodeElements.append("circle").attr("r", 8).attr("fill", (d_node: Node) => d_node.color || "#999");
    
    // Add text elements
    const textElements = nodeElements.append("text")
      .attr("dx", 0).attr("dy", 20).attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-family", "sans-serif")
      .each(function(d: Node) {
        const styles = parseMarkdownAndApplyStyles(d.name, d.textStyle);
        d3.select(this)
          .text(styles.text)
          .attr("font-size", `${styles.fontSize}px`)
          .style("font-weight", styles.fontWeight)
          .style("font-style", styles.fontStyle)
          .style("text-decoration", styles.textDecoration);
      });
    textSelectionRef.current = textElements as any;

    // Mouse tracking for hover effects during zoom
    const findNodeUnderMouse = (event: any, transform: d3.ZoomTransform): string | null => {
      if (!svgRef.current || !graphData.nodes || !event) return null;
      
      // Validate that we have a valid event and SVG element
      try {
        const pointer = d3.pointer(event, svgRef.current);
        const [mouseX, mouseY] = pointer;
        
        // Check if coordinates are finite numbers
        if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY)) {
          return null;
        }
        
        let bestMatch: string | null = null;
        let minDistanceSq = Infinity;

        const baseNodeSVGInteractRadius = 11;

        graphData.nodes.forEach(node => {
          if (node.x === undefined || node.y === undefined) return;
          
          const [screenX, screenY] = transform.apply([node.x, node.y]);
          const effectiveScreenHitRadius = baseNodeSVGInteractRadius * transform.k;
          
          const dx = mouseX - screenX;
          const dy = mouseY - screenY;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < effectiveScreenHitRadius * effectiveScreenHitRadius) {
            if (distSq < minDistanceSq) {
               minDistanceSq = distSq;
               bestMatch = node.id;
            }
          }
        });
        return bestMatch;
      } catch (error) {
        // If pointer calculation fails, return null
        return null;
      }
    };

    // Add zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4])
      .on("start", (event) => {
        // Handle zoom start if needed
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        let nodeUnderMouse = null;
        if(enableHoverEffects) {
            nodeUnderMouse = findNodeUnderMouse(event.sourceEvent || event, event.transform);
        }
        if (hoveredNodeId !== nodeUnderMouse) {
            onHoveredNodeChange(nodeUnderMouse);
        }
        updateVisualStyles(nodeUnderMouse, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current as any, nodeSelectionRef.current as any, finalRootNodeIds);
      })
      .on("end", (event) => {
        let nodeUnderMouse = null;
        if(enableHoverEffects) {
            nodeUnderMouse = findNodeUnderMouse(event.sourceEvent || event, event.transform);
        }
        if (hoveredNodeId !== nodeUnderMouse) {
            onHoveredNodeChange(nodeUnderMouse);
        }
        updateVisualStyles(nodeUnderMouse, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current as any, nodeSelectionRef.current as any, finalRootNodeIds);
      });
      
    svg.call(zoomBehavior).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2));
    svg.on("click", (event: MouseEvent) => {
        if (event.target === svg.node() && hoveredNodeId !== null) {
            onHoveredNodeChange(null);
        }
        onBackgroundClick();
    }, true);

    updateVisualStyles(hoveredNodeId, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current as any, nodeSelectionRef.current as any, finalRootNodeIds);

    simulation.alpha(0.5).restart();

    // Simulation tick handler
    simulation.on("tick", () => {
      // Update link positions
      linkElements
        .attr("x1", (d) => (typeof d.source === "string" ? 0 : (d.source as Node).x || 0))
        .attr("y1", (d) => (typeof d.source === "string" ? 0 : (d.source as Node).y || 0))
        .attr("x2", (d) => (typeof d.target === "string" ? 0 : (d.target as Node).x || 0))
        .attr("y2", (d) => (typeof d.target === "string" ? 0 : (d.target as Node).y || 0))

      // Update node positions
      nodeElements.attr("transform", (d: Node) => `translate(${d.x || 0},${d.y || 0})`)
    });

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth
        const newHeight = containerRef.current.clientHeight
        svg.attr("width", newWidth).attr("height", newHeight)
        if (simulationRef.current) {
            const updatedNumComponents = components.length;
            if (updatedNumComponents > 1) {
                const effectiveInterGraphDivisorResize = Math.max(1, interGraphCompactness);
                const interGraphSpacingDivisor = effectiveInterGraphDivisorResize * 1.5;
                const minComponentSeparation = 300; // Same as in main setup
                const updatedComponentAnchorRadius = Math.max(
                  minComponentSeparation,
                  (Math.min(newWidth, newHeight) / interGraphSpacingDivisor) * (Math.log(updatedNumComponents + 1) || 1)
                );
                const updatedComponentAnchors = components.map((_, k) => {
                    const angle = (2 * Math.PI / updatedNumComponents) * k;
                    return {
                        x: updatedComponentAnchorRadius * Math.cos(angle),
                        y: updatedComponentAnchorRadius * Math.sin(angle),
                    };
                });

                components.forEach((_componentNodes, k) => {
                    const anchorX = updatedComponentAnchors[k].x;
                    const anchorY = updatedComponentAnchors[k].y;
                    simulationRef.current!.force<d3.ForceX<Node>>(`anchorX-${k}`)?.x(anchorX);
                    simulationRef.current!.force<d3.ForceY<Node>>(`anchorY-${k}`)?.y(anchorY);
                    simulationRef.current!.force<d3.ForceRadial<Node>>(`radial-${k}`)?.x(anchorX).y(anchorY); 
                });
            }
           simulationRef.current.alpha(0.3).restart();
        }
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      simulation.stop()
    }
  }, [graphData, intraGraphCompactness, interGraphCompactness, enableHoverEffects]);

  // Hover effects for force mode
  useEffect(() => {
    const tempSvgNode = d3.select(svgRef.current).node();
    
    const currentComponents = findConnectedComponents(graphData.nodes, graphData.links);
    const currentPotentialRootNodeIds = new Set<string>();
    
    // Use the same approach as in main Force View rendering
    currentComponents.forEach((comp, idx) => {
      // Build tree structure for this component (same as Tree View)
      const nodeMap = new Map<string, any>();
      comp.forEach(node => {
        nodeMap.set(node.id, {
          id: node.id,
          node: node,
          children: [],
          parent: undefined,
          isRoot: false
        });
      });
      
      // Build parent-child relationships
      graphData.links.forEach(link => {
        if (link.type === 'parent-child') {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          const sourceTreeNode = nodeMap.get(sourceId);
          const targetTreeNode = nodeMap.get(targetId);
          
          if (sourceTreeNode && targetTreeNode) {
            sourceTreeNode.children.push(targetTreeNode);
            targetTreeNode.parent = sourceTreeNode;
          }
        }
      });
      
      // Find nodes without parents
      const compPotentialRoots = Array.from(nodeMap.values()).filter(treeNode => !treeNode.parent);
      
      // If no clear root, pick the node with minimum level
      if (compPotentialRoots.length === 0 && comp.length > 0) {
        const minLevel = Math.min(...comp.map(n => n.level));
        const candidateNodes = comp.filter(n => n.level === minLevel);
        if (candidateNodes.length > 0) {
          const rootTreeNode = nodeMap.get(candidateNodes[0].id);
          if (rootTreeNode) {
            compPotentialRoots.push(rootTreeNode);
          }
        }
      }
      
      // Use identifyTrueRoots to get the real roots
      const trueRoots = identifyTrueRoots(compPotentialRoots, nodeMap, graphData.links, comp) as any[];
      trueRoots.filter(n => n.isRoot).forEach(root => currentPotentialRootNodeIds.add(root.id));
    });
    

    
    // The root IDs are already correctly identified above
    const currentFinalRootNodeIds = currentPotentialRootNodeIds;

    updateVisualStyles(
      hoveredNodeId, 
      enableHoverEffects, 
      graphData, 
      intraGraphCompactness, 
      tempSvgNode, 
      linkSelectionRef.current, 
      textSelectionRef.current as any, 
      nodeSelectionRef.current as any, 
      currentFinalRootNodeIds
    );
  }, [hoveredNodeId, enableHoverEffects, graphData, intraGraphCompactness]);

  return null; // This component only handles D3 rendering
}
