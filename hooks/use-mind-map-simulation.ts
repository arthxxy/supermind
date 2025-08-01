import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import type { Node, Link, GraphData } from '@/lib/types';
import { findConnectedComponents } from '@/lib/graph-utils'; // For root node identification
import { createSiblingDistributionForce, createHierarchicalForce } from '@/lib/d3-custom-forces';

// Constants from mind-map.tsx that are relevant to simulation & visuals
const BASE_SVG_FONT_SIZE = 12;
const FULLY_OPAQUE_EFFECTIVE_SIZE = 10;
const INVISIBLE_EFFECTIVE_SIZE = 7;
const OTHER_NODE_TEXT_OPACITY_ON_HOVER = 0.2;
const FIXED_HIGHLIGHTED_FONT_SIZE = 16; // Example fixed font size for highlighted text

interface UseMindMapSimulationProps {
  graphData: GraphData;
  svgRef: React.RefObject<SVGSVGElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  intraGraphCompactness: number;
  interGraphCompactness: number;
  enableHoverEffects: boolean;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void; // To update hover state from within zoom/pointer events
  onNodeClick: (node: Node, event: MouseEvent) => void; // Pass event handlers from parent
  onNodeDoubleClick: (node: Node, event: MouseEvent) => void;
  onBackgroundClick: () => void;
}

interface D3Selections {
  nodeSelection: d3.Selection<SVGGElement, Node, SVGGElement, any> | null;
  linkSelection: d3.Selection<SVGLineElement, Link, SVGGElement, any> | null;
  textSelection: d3.Selection<SVGTextElement, Node, SVGGElement, any> | null;
}

export function useMindMapSimulation({
  graphData,
  svgRef,
  containerRef,
  intraGraphCompactness,
  interGraphCompactness,
  enableHoverEffects,
  hoveredNodeId,
  setHoveredNodeId,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
}: UseMindMapSimulationProps): D3Selections {
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, Node, SVGGElement, any> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, Link, SVGGElement, any> | null>(null);
  const textSelectionRef = useRef<d3.Selection<SVGTextElement, Node, SVGGElement, any> | null>(null);
  const [isZooming, setIsZooming] = useState<boolean>(false); // Internal to the hook now

  // _updateVisualStyles function will be defined here or called from here
  const _updateVisualStyles = useCallback(
    (currentHoverId: string | null, currentGraphData: GraphData, svgNode: SVGSVGElement | null) => {
      console.log("_updateVisualStyles called", { currentHoverId, svgNodeExists: !!svgNode });
      if (!svgNode || !linkSelectionRef.current || !textSelectionRef.current || !nodeSelectionRef.current) {
        console.log("Skipping _updateVisualStyles due to missing refs or svgNode");
        return;
      }

      const linksSel = linkSelectionRef.current;
      const textsSel = textSelectionRef.current;
      const nodesSel = nodeSelectionRef.current;

      const currentScale = d3.zoomTransform(svgNode).k;
      const effectiveFontSizeBase = BASE_SVG_FONT_SIZE * currentScale;

      let directlyConnectedToHovered = new Set<string>();
      if (enableHoverEffects && currentHoverId) {
        directlyConnectedToHovered.add(currentHoverId);
        currentGraphData.links.forEach(l => {
          const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          if (sourceId === currentHoverId) directlyConnectedToHovered.add(targetId);
          if (targetId === currentHoverId) directlyConnectedToHovered.add(sourceId);
        });
      }
      
      // Identify final root node IDs for styling (copied from mind-map.tsx useEffect)
      const currentComponents = findConnectedComponents(currentGraphData.nodes, currentGraphData.links);
      const currentPotentialRootNodeIds = new Set<string>();
      currentComponents.forEach((comp) => {
        let minLevel = Infinity;
        comp.forEach(node => { if (node.level < minLevel) minLevel = node.level; });
        comp.forEach(node => { if (node.level === minLevel) currentPotentialRootNodeIds.add(node.id); });
      });
      const finalRootIds = new Set<string>();
       currentPotentialRootNodeIds.forEach(nodeId => {
        let isTrueRoot = true;
        for (const link_data of currentGraphData.links) {
            const linkTargetId = typeof link_data.target === 'string' ? link_data.target : (link_data.target as Node).id;
            const linkSourceId = typeof link_data.source === 'string' ? link_data.source : (link_data.source as Node).id;
            if (linkTargetId === nodeId && link_data.type === 'parent-child' && currentPotentialRootNodeIds.has(linkSourceId)) {
                isTrueRoot = false; break;
            }
        }
        if (isTrueRoot) finalRootIds.add(nodeId);
      });

      nodesSel.selectAll<SVGCircleElement, Node>(".node-base")
        .attr("fill", d_node => finalRootIds.has(d_node.id) ? "white" : "transparent")
        .attr("stroke", d_node => (enableHoverEffects && d_node.id === currentHoverId) ? "rgba(200,200,255,0.7)" : null)
        .attr("stroke-width", d_node => (enableHoverEffects && d_node.id === currentHoverId) ? 2 : null);

      linksSel.attr("stroke", (d_link: Link) => {
          const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
          const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
          return (enableHoverEffects && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? "purple" : "#999";
        })
        .attr("stroke-width", (d_link: Link) => {
          const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
          const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
          return (enableHoverEffects && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? 3 : (d_link.type === "parent-child" ? 2 : 1);
        })
        .attr("marker-start", (d_link: Link) => {
          if (d_link.type !== "parent-child") return null;
          const sourceId = typeof d_link.source === 'string' ? d_link.source : (d_link.source as Node).id;
          const targetId = typeof d_link.target === 'string' ? d_link.target : (d_link.target as Node).id;
          return (enableHoverEffects && currentHoverId && (sourceId === currentHoverId || targetId === currentHoverId)) ? "url(#triangle-purple)" : "url(#triangle-default)";
        });

      textsSel.attr("font-size", (d_text: Node) => 
          (enableHoverEffects && currentHoverId && directlyConnectedToHovered.has(d_text.id)) ? `${FIXED_HIGHLIGHTED_FONT_SIZE}px` : `${BASE_SVG_FONT_SIZE}px`
        )
        .style("opacity", (d_text: Node) => {
          if (enableHoverEffects && currentHoverId) {
            return directlyConnectedToHovered.has(d_text.id) ? 1.0 : OTHER_NODE_TEXT_OPACITY_ON_HOVER;
          } else {
            if (effectiveFontSizeBase >= FULLY_OPAQUE_EFFECTIVE_SIZE) return 1.0;
            if (effectiveFontSizeBase <= INVISIBLE_EFFECTIVE_SIZE) return 0;
            return d3.scaleLinear().domain([INVISIBLE_EFFECTIVE_SIZE, FULLY_OPAQUE_EFFECTIVE_SIZE]).range([0, 1.0]).clamp(true)(effectiveFontSizeBase);
          }
        });
    },
    [enableHoverEffects] // Dependencies for _updateVisualStyles
  );

  const findNodeUnderMouse = useCallback((event: MouseEvent | TouchEvent | null, transform: d3.ZoomTransform): string | null => {
    if (!svgRef.current || !graphData.nodes || !event) return null;
    // Get mouse/touch coordinates relative to the SVG container
    const [pointerX, pointerY] = d3.pointer(event, svgRef.current);

    let bestMatch: string | null = null;
    let minDistanceSq = Infinity;
    const baseNodeSVGInteractRadius = 11; // Same as node base circle radius

    graphData.nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;
      
      const [screenX, screenY] = transform.apply([node.x, node.y]);
      const effectiveScreenHitRadius = baseNodeSVGInteractRadius * transform.k;
      
      const dx = pointerX - screenX;
      const dy = pointerY - screenY;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < effectiveScreenHitRadius * effectiveScreenHitRadius) {
        if (distSq < minDistanceSq) {
           minDistanceSq = distSq;
           bestMatch = node.id;
        }
      }
    });
    return bestMatch;
  }, [svgRef, graphData.nodes]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.content-group"); // Select existing or create if not present
    if (g.empty()) {
        svg.selectAll("*").remove(); // Clear SVG if g doesn't exist (first run or full reset)
        svg.append("g").attr("class", "content-group");
    }
    // Re-select g in case it was just created
    const finalG = svg.select<SVGGElement>("g.content-group");

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scaling factors and constants based on props (copied from mind-map.tsx)
    const normalizedIntraGCompact = intraGraphCompactness / 10;
    const MAX_INTERNAL_SCALE = 2.0;
    const MIN_INTERNAL_SCALE = 0.5;
    const internalScale = MAX_INTERNAL_SCALE - normalizedIntraGCompact * (MAX_INTERNAL_SCALE - MIN_INTERNAL_SCALE);
    const scaledParentChildLinkDist = (60 * internalScale);
    const scaledFriendLinkDist = (100 * internalScale);
    const scaledMultiCompRadialLevelMultiplier = (100 * internalScale);
    const scaledMultiCompRadialBaseOffset = (20 * internalScale);
    const scaledSingleCompRadialLevelMultiplier = (110 * internalScale);
    const scaledSingleCompRadialBaseOffset = (30 * internalScale);
    const scaledManyBodyStrength = (-700 * internalScale);
    const scaledCollideRadius = (25 * internalScale);
    const scaledSiblingDistForceIdealLinkDistance = (60 * internalScale);

    const currentNodesMap = new Map(graphData.nodes.map(n => [n.id, n]));
    const processedLinks = graphData.links.map(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        const sourceNodeFromMap = currentNodesMap.get(sourceId);
        const targetNodeFromMap = currentNodesMap.get(targetId);
        if (!sourceNodeFromMap || !targetNodeFromMap) {
            console.warn("Orphaned link detected, skipping link: ", l, "SourceID:", sourceId, "TargetID:", targetId);
            return null; 
        }
        return { ...l, source: sourceNodeFromMap, target: targetNodeFromMap };
    }).filter(l => l !== null) as Link[];
    console.log("Processed Links:", JSON.parse(JSON.stringify(processedLinks.map(l => ({...l, source: (l.source as Node).id, target: (l.target as Node).id }))))); // Log simplified links

    const components = findConnectedComponents(graphData.nodes, processedLinks);
    const nodeToComponentIndex = new Map<string, number>();
    const potentialRootNodeIds = new Set<string>();
    components.forEach((comp, idx) => {
      comp.forEach(node => nodeToComponentIndex.set(node.id, idx));
    });
    
    simulationRef.current = d3.forceSimulation<Node, Link>(graphData.nodes)
        .force("link", d3.forceLink<Node, Link>(processedLinks)
            .id(d => d.id)
            .distance(link => link.type === "friend" ? scaledFriendLinkDist : scaledParentChildLinkDist)
            .strength(link => link.type === "friend" ? 0.3 : 0.8)
        )
        .force("charge", d3.forceManyBody().strength(scaledManyBodyStrength))
        .force("collide", d3.forceCollide().radius(scaledCollideRadius).strength(1.0).iterations(2));

    // Store simulation reference on SVG element for access from other components
    if (svgRef.current) {
      (svgRef.current as any).__simulation = simulationRef.current;
    }

    // Component separation logic (copied and adapted)
    if (components.length > 0) {
        if (components.length > 1) {
            const numComponents = components.length;
            const effectiveInterGraphDivisor = Math.max(1, interGraphCompactness);
            const componentAnchorRadius = (Math.min(width, height) / (effectiveInterGraphDivisor * 2)) * (Math.log(numComponents + 1) || 1);
            const componentAnchors = components.map((_, i) => {
                const angle = (2 * Math.PI / components.length) * i;
                return { x: componentAnchorRadius * Math.cos(angle), y: componentAnchorRadius * Math.sin(angle) };
            });
            components.forEach((_compNodes, i) => {
                const anchorX = componentAnchors[i].x;
                const anchorY = componentAnchors[i].y;
                simulationRef.current?.force(`anchorX-${i}`, d3.forceX<Node>(anchorX).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.08 : 0));
                simulationRef.current?.force(`anchorY-${i}`, d3.forceY<Node>(anchorY).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.08 : 0));
                simulationRef.current?.force(`radial-${i}`, d3.forceRadial<Node>((d) => (d.level * scaledMultiCompRadialLevelMultiplier) + scaledMultiCompRadialBaseOffset, anchorX, anchorY).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.7 : 0));
            });
        } else {
            simulationRef.current?.force("center", d3.forceCenter(0, 0).strength(0.05));
            simulationRef.current?.force("radial-0", d3.forceRadial<Node>((d) => (d.level * scaledSingleCompRadialLevelMultiplier) + scaledSingleCompRadialBaseOffset, 0, 0).strength(0.7));
        }
    }
    
    // Add sibling distribution force to arrange siblings in a circle around their parent
    if (graphData.nodes.length > 0 && processedLinks.filter(l => l.type === 'parent-child').length > 0) {
        simulationRef.current?.force("siblingDistribution", createSiblingDistributionForce(graphData.nodes, processedLinks, 0.5, scaledSiblingDistForceIdealLinkDistance));
        
        // Add hierarchical force to ensure children are farther from root than parents
        // Increase strength to 1.0 for more pronounced hierarchical layout and increase distance multiplier
        simulationRef.current?.force("hierarchical", createHierarchicalForce(graphData.nodes, processedLinks, 1.0, scaledParentChildLinkDist * 1.2));
    }
    
    // Drawing elements (Links, Nodes, Text)
    linkSelectionRef.current = finalG.selectAll<SVGLineElement, Link>(".link")
        .data(processedLinks, (d: Link) => `${(d.source as Node).id}-${(d.target as Node).id}`)
        .join(
            enter => enter.append("line").attr("class", "link"),
            update => update,
            exit => exit.remove()
        )
        .attr("stroke-width", (d: Link) => d.type === "parent-child" ? 2 : 1)
        .attr("stroke-dasharray", (d: Link) => d.type === "friend" ? "5,5" : null)
        .attr("marker-start", (d: Link) => d.type === "parent-child" ? "url(#triangle-default)" : null);

    nodeSelectionRef.current = finalG.selectAll<SVGGElement, Node>(".node")
        .data(graphData.nodes, (d: Node) => d.id)
        .join(
            enter => {
                const gNode = enter.append("g").attr("class", "node");
                gNode.append("circle").attr("class", "node-base").attr("r", 11);
                gNode.append("circle").attr("class", "node-color").attr("r", 8);
                gNode.call(d3.drag<SVGGElement, Node>()
                    .on("start", (event, d_drag: Node) => { if (!event.active) simulationRef.current?.alphaTarget(0.3).restart(); d_drag.fx = d_drag.x; d_drag.fy = d_drag.y; })
                    .on("drag", (event, d_drag: Node) => { d_drag.fx = event.x; d_drag.fy = event.y; })
                    .on("end", (event, d_drag: Node) => { if (!event.active) simulationRef.current?.alphaTarget(0); d_drag.fx = null; d_drag.fy = null; })
                );
                gNode.on("click", (event, d_clk: Node) => onNodeClick(d_clk, event));
                gNode.on("dblclick", (event, d_dblclk: Node) => onNodeDoubleClick(d_dblclk, event));
                gNode.on("pointerover", (event, hovered_d: Node) => { event.stopPropagation(); if (enableHoverEffects && hoveredNodeId !== hovered_d.id) setHoveredNodeId(hovered_d.id); })
                gNode.on("pointerout", (event) => { event.stopPropagation(); if (enableHoverEffects && !isZooming) setHoveredNodeId(null); });
                return gNode;
            },
            update => update,
            exit => exit.remove()
        );
    nodeSelectionRef.current.select<SVGCircleElement>(".node-color").attr("fill", (d_node: Node) => d_node.color || "#999");

    textSelectionRef.current = nodeSelectionRef.current.selectAll<SVGTextElement, Node>(".node-text")
        .data(d => [d]) // Bind node data to text
        .join(
            enter => enter.append("text").attr("class", "node-text")
                        .attr("dx", 0).attr("dy", 20).attr("text-anchor", "middle")
                        .attr("fill", "white").attr("font-family", "sans-serif"),
            update => update,
            exit => exit.remove()
        )
        .text((d: Node) => d.name);
        
    // Defs for markers (should ideally be added once)
    if (svg.select("defs").empty()) {
        const defs = svg.append("defs");
        defs.append("marker").attr("id", "triangle-default").attr("viewBox", "0 -2.025 16 4.05")
            .attr("refX", 0).attr("refY", 0).attr("orient", "auto").attr("markerWidth", 16).attr("markerHeight", 4.05)
            .append("path").attr("d", "M0,-2.025L16,0L0,2.025Z").attr("fill", "#999");
        defs.append("marker").attr("id", "triangle-purple").attr("viewBox", "0 -2.025 16 4.05")
            .attr("refX", 0).attr("refY", 0).attr("orient", "auto").attr("markerWidth", 16).attr("markerHeight", 4.05)
            .append("path").attr("d", "M0,-2.025L16,0L0,2.025Z").attr("fill", "purple");
    }

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("start", () => setIsZooming(true))
        .on("zoom", (event) => {
            finalG.attr("transform", event.transform);
            
            // Only update hover effects if not actively zooming/panning (for performance)
            if (enableHoverEffects && event.sourceEvent && !event.sourceEvent.buttons) {
                let nodeUnderMouse = findNodeUnderMouse(event.sourceEvent, event.transform);
                if (hoveredNodeId !== nodeUnderMouse) setHoveredNodeId(nodeUnderMouse);
                _updateVisualStyles(nodeUnderMouse, graphData, svg.node());
            }
        })
        .on("end", (event) => {
            setIsZooming(false);
            if (enableHoverEffects && event.sourceEvent) {
                let nodeUnderMouse = findNodeUnderMouse(event.sourceEvent, event.transform);
                if (hoveredNodeId !== nodeUnderMouse) setHoveredNodeId(nodeUnderMouse);
                _updateVisualStyles(nodeUnderMouse, graphData, svg.node());
            }
        });

    svg.call(zoomBehavior).on("dblclick.zoom", null); // Disable double click zoom
    // Initial zoom transform (center the graph)
    const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2);
    svg.call(zoomBehavior.transform, initialTransform);
    finalG.attr("transform", initialTransform.toString()); // Apply to content group as well
    
    svg.on("click", (event: MouseEvent) => {
      if (event.target === svg.node()) onBackgroundClick();
    }, true);

    simulationRef.current.on("tick", () => {
      // Debug output to verify tick function execution
      console.log("SIMULATION TICK RUNNING", new Date().toISOString());
      
      // Reduce logging frequency for better performance
      if (Math.random() < 0.01) { // Only log ~1% of ticks
        if (!(nodeSelectionRef.current?.empty() && linkSelectionRef.current?.empty())) {
          console.log("Tick - Nodes selection size:", nodeSelectionRef.current?.size(), "Links selection size:", linkSelectionRef.current?.size());
        }
      }
      
      // Apply additional position constraints to prevent nodes from overlapping - optimized for performance
      const nodeRadius = scaledCollideRadius;
      const nodes = graphData.nodes;
      
      // Track if we need to reheat the simulation
      let needsReheat = false;
      let overlappingPairsCount = 0;
      
      // FIRST PRIORITY: Prevent nodes from overlapping with connection arrows (links)
      // Check ALL links for better results
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.x === undefined || node.y === undefined || node.fx !== null || node.fy !== null) continue;
        
        // Check all links - prioritize link-node overlap prevention
        for (let j = 0; j < processedLinks.length; j++) {
          const link = processedLinks[j];
          const sourceNode = link.source as Node;
          const targetNode = link.target as Node;
          
          // Skip if this node is part of the current link
          if (node.id === sourceNode.id || node.id === targetNode.id) continue;
          
          // Skip if source or target position is undefined
          if (sourceNode.x === undefined || sourceNode.y === undefined || 
              targetNode.x === undefined || targetNode.y === undefined) continue;
          
          // Calculate the distance from the node to the link line
          const x0 = node.x;
          const y0 = node.y;
          const x1 = sourceNode.x;
          const y1 = sourceNode.y;
          const x2 = targetNode.x;
          const y2 = targetNode.y;
          
          // Vector from source to target
          const vx = x2 - x1;
          const vy = y2 - y1;
          
          // Length of the link squared
          const lenSq = vx * vx + vy * vy;
          
          // If the link has no length, skip it
          if (lenSq === 0) continue;
          
          // Calculate projection of node position onto the link line
          // Extend the line segment slightly beyond source and target to catch near misses
          const t = Math.max(-0.1, Math.min(1.1, ((x0 - x1) * vx + (y0 - y1) * vy) / lenSq));
          
          // Calculate the closest point on the line
          const projX = x1 + t * vx;
          const projY = y1 + t * vy;
          
          // Vector from closest point to node
          const dx = x0 - projX;
          const dy = y0 - projY;
          
          // Distance squared from node to closest point
          const distSq = dx * dx + dy * dy;
          
          // Minimum distance to avoid overlap with the link
          // Using a slightly larger radius than the node radius to ensure no overlap
          const minLinkDistSq = nodeRadius * nodeRadius * 1.2;
          
          // If the node is too close to the link and the projection point is near or between source and target
          if (distSq < minLinkDistSq && t > -0.1 && t < 1.1) {
            // Calculate the distance
            const dist = Math.sqrt(distSq);
            const minDist = Math.sqrt(minLinkDistSq);
            
            // Calculate the overlap
            const overlap = minDist - dist;
            
            // Calculate the direction to move the node
            const moveX = (dx / dist) * overlap * 10.0; // Extremely strong force
            const moveY = (dy / dist) * overlap * 10.0;
            
            // Move the node away from the link
            node.x += moveX;
            node.y += moveY;
            
            // Debug output to verify code execution
            console.log("PREVENTING NODE-LINK OVERLAP!", {
              nodeId: node.id,
              linkSourceId: sourceNode.id,
              linkTargetId: targetNode.id,
              distance: dist,
              minDistance: minDist,
              overlap,
              moveX,
              moveY
            });
            
            // Track if we need to reheat the simulation - be more aggressive with link overlaps
            needsReheat = true; // Always reheat if there's any link overlap
            overlappingPairsCount += 2; // Count link overlaps more heavily than node overlaps
          }
        }
      }
      
      // SECOND PRIORITY: Enforce minimum distance between nodes - only for a subset of nodes
      // Only process a subset of nodes each tick for better performance with large graphs
      const nodesToProcess = Math.min(nodes.length, 100); // Process at most 100 nodes per tick
      const startIdx = Math.floor(Math.random() * Math.max(1, nodes.length - nodesToProcess));
      const endIdx = Math.min(startIdx + nodesToProcess, nodes.length);
      
      for (let i = startIdx; i < endIdx; i++) {
        const nodeA = nodes[i];
        if (nodeA.x === undefined || nodeA.y === undefined) continue;
        
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j];
          if (nodeB.x === undefined || nodeB.y === undefined) continue;
          
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distanceSquared = dx * dx + dy * dy;
          const minDistanceSquared = nodeRadius * nodeRadius * 4.84; // 2.2^2
          
          if (distanceSquared > 0 && distanceSquared < minDistanceSquared) {
            // Calculate the overlap and push nodes apart - using sqrt only when needed
            const distance = Math.sqrt(distanceSquared);
            const minDistance = nodeRadius * 2.2;
            const overlap = minDistance - distance;
            const moveX = (dx / distance) * overlap * 0.5;
            const moveY = (dy / distance) * overlap * 0.5;
            
            // Move nodes apart to prevent overlap
            if (!nodeA.fx) nodeA.x -= moveX;
            if (!nodeA.fy) nodeA.y -= moveY;
            if (!nodeB.fx) nodeB.x += moveX;
            if (!nodeB.fy) nodeB.y += moveY;
            
            // Track overlapping pairs to determine if we need to reheat
            overlappingPairsCount++;
            if (overlap > minDistance * 0.3) {
              needsReheat = true;
              overlappingPairsCount++;
            }
          }
        }
      }
      
      // If we have significant overlap, reheat the simulation
      if (needsReheat && simulationRef.current && simulationRef.current.alpha() < 0.4) {
        // Lower threshold for reheating with link overlaps
        if (overlappingPairsCount > 0) {
          console.log("Reheating simulation due to node-link overlap");
          simulationRef.current.alpha(Math.min(0.8, simulationRef.current.alpha() + 0.5));
        }
      }
      
      // Optimize link position updates by skipping error checking in production
      linkSelectionRef.current
        ?.attr("x1", (d: Link) => ((d.source as Node).x || 0))
        .attr("y1", (d: Link) => ((d.source as Node).y || 0))
        .attr("x2", (d: Link) => ((d.target as Node).x || 0))
        .attr("y2", (d: Link) => ((d.target as Node).y || 0));
      
      nodeSelectionRef.current?.attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    });

    _updateVisualStyles(hoveredNodeId, graphData, svg.node());
    
    // Optimize simulation parameters for better performance
    simulationRef.current
      .alpha(0.8)
      .alphaDecay(0.02) // Faster decay for quicker stabilization
      .velocityDecay(0.5) // Higher value to reduce oscillation and improve stability
      .alphaMin(0.001) // Lower minimum alpha for better stabilization
      .alphaTarget(0); // Ensure simulation eventually stops completely

    const handleResize = () => {
      if (containerRef.current && svgRef.current && simulationRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        d3.select(svgRef.current).attr("width", newWidth).attr("height", newHeight);

        // Update component anchors for multi-component layouts
        const components = findConnectedComponents(graphData.nodes, processedLinks); // Re-use processedLinks from outer scope
        const nodeToComponentIndex = new Map<string, number>();
        components.forEach((comp, idx) => comp.forEach(node => nodeToComponentIndex.set(node.id, idx)));

        if (components.length > 1) {
          const numComponents = components.length;
          const effectiveInterGraphDivisorResize = Math.max(1, interGraphCompactness);
          const updatedComponentAnchorRadius = (Math.min(newWidth, newHeight) / (effectiveInterGraphDivisorResize * 2)) * (Math.log(numComponents + 1) || 1);
          const updatedComponentAnchors = components.map((_, k) => {
            const angle = (2 * Math.PI / numComponents) * k;
            return { x: updatedComponentAnchorRadius * Math.cos(angle), y: updatedComponentAnchorRadius * Math.sin(angle) };
          });

          components.forEach((_componentNodes, k) => {
            const anchorX = updatedComponentAnchors[k].x;
            const anchorY = updatedComponentAnchors[k].y;
            simulationRef.current!.force<d3.ForceX<Node>>(`anchorX-${k}`)?.x(anchorX);
            simulationRef.current!.force<d3.ForceY<Node>>(`anchorY-${k}`)?.y(anchorY);
            simulationRef.current!.force<d3.ForceRadial<Node>>(`radial-${k}`)?.x(anchorX).y(anchorY);
          });
        } else if (components.length === 1) {
            // If it's a single component, ensure its centering/radial forces are aware of new center if needed
            // For now, forceCenter(0,0) is relative to the g element, which is transformed by zoom.
            // If canvas center needs to be passed to forceCenter, do it here.
        }
        simulationRef.current.alpha(0.3).restart();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      simulationRef.current?.stop();
    };
  },
  [
    graphData, intraGraphCompactness, interGraphCompactness, enableHoverEffects, 
    svgRef, containerRef, onNodeClick, onNodeDoubleClick, onBackgroundClick, 
    setHoveredNodeId, hoveredNodeId, _updateVisualStyles, findNodeUnderMouse // Add findNodeUnderMouse to dependencies
  ]);
  
  // Effect for hoveredNodeId changes not covered by zoom events (e.g. direct pointerover on nodes)
  useEffect(() => {
     _updateVisualStyles(hoveredNodeId, graphData, svgRef.current);
  }, [hoveredNodeId, graphData, svgRef, _updateVisualStyles]);

  return { 
    nodeSelection: nodeSelectionRef.current, 
    linkSelection: linkSelectionRef.current, 
    textSelection: textSelectionRef.current 
  };
} 