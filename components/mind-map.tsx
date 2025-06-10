"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { NodeToolbar } from "@/components/node-toolbar"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { MarkdownEditor } from "@/components/markdown-editor"
import { findConnectedComponents, recalculateLevelsInComponent } from "@/lib/graph-utils"
import { createSiblingDistributionForce } from "@/lib/d3-custom-forces"
import type { Node, Link, GraphData, Relationship } from "@/lib/types"

// Constants for text visibility based on effective font size
const BASE_SVG_FONT_SIZE = 12; // The actual font size set on SVG <text> elements
const FULLY_OPAQUE_EFFECTIVE_SIZE = 10;   // Effective px size. Above this: Opacity 1
const INVISIBLE_EFFECTIVE_SIZE = 7;        // Effective px size. Below this: Opacity 0.
const OTHER_NODE_TEXT_OPACITY_ON_HOVER = 0.2; // New constant for dimmed text

// Props for the MindMap component
interface MindMapProps {
  initialGraphDataFromFolder?: GraphData; // Optional prop for folder-generated data
  initialNodeId?: string | null; // Add this prop
  mapId?: string; // Add this prop (or ensure it's there if it was planned)
  // We can add other props here if needed, e.g., a key to force re-render on data change
}

// Initial data for the mindmap (default)
const initialData: GraphData = {
  nodes: [
    { id: "root", name: "Main Concept", level: 0, color: "#ff6b6b" },
    { id: "child1", name: "Sub-concept 1", level: 1, color: "#48dbfb" },
    { id: "child2", name: "Sub-concept 2", level: 1, color: "#48dbfb" },
    { id: "child3", name: "Sub-concept 3", level: 1, color: "#48dbfb" },
    { id: "grandchild1", name: "Detail 1.1", level: 2, color: "#1dd1a1" },
    { id: "grandchild2", name: "Detail 1.2", level: 2, color: "#1dd1a1" },
    { id: "grandchild3", name: "Detail 2.1", level: 2, color: "#1dd1a1" },
    { id: "grandchild4", name: "Detail 3.1", level: 2, color: "#1dd1a1" },
  ],
  links: [
    { source: "root", target: "child1", type: "parent-child" },
    { source: "root", target: "child2", type: "parent-child" },
    { source: "root", target: "child3", type: "parent-child" },
    { source: "child1", target: "grandchild1", type: "parent-child" },
    { source: "child1", target: "grandchild2", type: "parent-child" },
    { source: "child2", target: "grandchild3", type: "parent-child" },
    { source: "child3", target: "grandchild4", type: "parent-child" },
    { source: "grandchild1", target: "grandchild3", type: "friend" },
    { source: "child1", target: "child2", type: "friend" },
  ],
}

export default function MindMap({ initialGraphDataFromFolder, initialNodeId, mapId }: MindMapProps) {
  const [graphData, setGraphData] = useState<GraphData>(
    initialGraphDataFromFolder || initialData // Prioritize folder data if available
  )
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 })
  const [intraGraphCompactness, setIntraGraphCompactness] = useState<number>(5); // Default 5 (range 0-10)
  const [interGraphCompactness, setInterGraphCompactness] = useState<number>(10); // Default 10 (very close for inter-graph)
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [enableHoverEffects, setEnableHoverEffects] = useState<boolean>(true); // On by default
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isZooming, setIsZooming] = useState<boolean>(false); // Re-add isZooming state
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null)

  // Refs for D3 selections - using 'any' for the last generic type argument as a workaround for complex D3 types
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, Node, SVGGElement, any> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, Link, SVGGElement, any> | null>(null);
  const textSelectionRef = useRef<d3.Selection<SVGTextElement, Node, SVGGElement, any> | null>(null);

  // Calculate an internal scaling factor based on intraGraphCompactness
  const normalizedIntraGCompact = intraGraphCompactness / 10; // Normalize 0-10 to 0-1
  const MAX_INTERNAL_SCALE = 2.0; // Corresponds to intraGraphCompactness = 0 (wide)
  const MIN_INTERNAL_SCALE = 0.5; // Corresponds to intraGraphCompactness = 10 (compact)
  const internalScale = MAX_INTERNAL_SCALE - normalizedIntraGCompact * (MAX_INTERNAL_SCALE - MIN_INTERNAL_SCALE);

  // Adjusted base values for stronger hierarchy
  const baseParentChildLinkDist = 60 * internalScale; // Adjusted slightly
  const baseFriendLinkDist = 100 * internalScale;
  const baseMultiCompRadialLevelMultiplier = 100 * internalScale; // Reverted from 130
  const baseMultiCompRadialBaseOffset = 20 * internalScale;
  const baseSingleCompRadialLevelMultiplier = 110 * internalScale; // Reverted from 140
  const baseSingleCompRadialBaseOffset = 30 * internalScale;
  const baseManyBodyStrength = -600 * internalScale;
  const baseCollideRadius = 25 * internalScale; // Slightly smaller to allow tighter packing if hierarchy dictates
  const baseSiblingDistForceIdealLinkDistance = 60 * internalScale;

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
  const fixedHighlightedFontSize = 16; // For hovered text

  // Load initial node if initialNodeId is provided
  useEffect(() => {
    if (initialNodeId) {
      const nodeToSelect = graphData.nodes.find((n: Node) => n.id === initialNodeId);
      if (nodeToSelect) {
        setSelectedNode(nodeToSelect);
        // Optionally, also set it as editing node or trigger other actions
      }
    }
  }, [initialNodeId, graphData.nodes]);

  // Effect to update graphData if initialGraphDataFromFolder changes
  useEffect(() => {
    if (initialGraphDataFromFolder) {
      setGraphData(initialGraphDataFromFolder);
      // Reset other states as well if a new graph is loaded
      setSelectedNode(null);
      setEditingNode(null);
      // Potentially re-initialize or stop/restart simulation if it's already running
      if (simulationRef.current) {
        simulationRef.current.stop();
        // The main useEffect that sets up D3 will re-run due to graphData change
      }
    }
  }, [initialGraphDataFromFolder]);

  // Function to get node relationships
  const getNodeRelationships = (nodeId: string): Relationship[] => {
    const relationships: Relationship[] = []
    
    for (const link of graphData.links) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id
      const sourceNode = graphData.nodes.find(n => n.id === sourceId)
      const targetNode = graphData.nodes.find(n => n.id === targetId)
      
      if (!sourceNode || !targetNode) continue

      if (sourceId === nodeId) {
        relationships.push({
          type: link.type === 'parent-child' ? 'child' : 'friend',
          targetId: targetId,
          targetName: targetNode.name
        } as Relationship)
      } else if (targetId === nodeId) {
        relationships.push({
          type: link.type === 'parent-child' ? 'parent' : 'friend',
          targetId: sourceId,
          targetName: sourceNode.name
        } as Relationship)
      }
    }

    return relationships
  }

  // Function to add a new node
  const addNode = (parentId: string, nodeName: string) => {
    const newNodeId = `node-${Date.now()}`
    const parentNode = graphData.nodes.find((node: Node) => node.id === parentId)

    const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"]

    if (!parentNode) {
      // Add as a new root node (level 0, no link)
      const newNode: Node = {
        id: newNodeId,
        name: nodeName,
        level: 0,
        color: colors[0],
      }
      setGraphData((prev: GraphData) => ({
        nodes: [...prev.nodes, newNode],
        links: [...prev.links],
      }))
      return
    }

    const newLevel = parentNode.level + 1

    const newNode: Node = {
      id: newNodeId,
      name: nodeName,
      level: newLevel,
      color: colors[newLevel % colors.length],
    }

    const newLink: Link = {
      source: parentId,
      target: newNodeId,
      type: "parent-child"
    }

    setGraphData((prev: GraphData) => ({
      nodes: [...prev.nodes, newNode],
      links: [...prev.links, newLink],
    }))
  }

  // Function to delete a node
  const deleteNode = (nodeId: string) => {
    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes.filter((node: Node) => node.id !== nodeId),
      links: prev.links.filter(
        (link: Link) =>
          (typeof link.source === "string" ? link.source !== nodeId : (link.source as Node).id !== nodeId) &&
          (typeof link.target === "string" ? link.target !== nodeId : (link.target as Node).id !== nodeId),
      ),
    }))
    setSelectedNode(null)
    setEditingNode(null)
  }

  // Function to add a relationship (simplified/reverted)
  const addRelationship = (sourceId: string, command: string, targetName: string) => {
    const sourceNode = graphData.nodes.find((node: Node) => node.id === sourceId);
    let targetNode = graphData.nodes.find((node: Node) => node.name === targetName);

    if (!sourceNode) return;

    let newNodes = [...graphData.nodes];
    let newLinks = [...graphData.links];
    let createdNewNode = false;
    let newTargetNodeId = targetNode?.id;

    if (!targetNode) {
      newTargetNodeId = `node-${Date.now()}`;
      const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"];
      // Tentative level for new node, will be corrected by recalculateLevelsInComponent
      let newLevel = sourceNode.level;
      if (command === '>') newLevel = sourceNode.level + 1;
      else if (command === '<') newLevel = Math.max(0, sourceNode.level - 1);
      
      const newNodeToAdd: Node = {
        id: newTargetNodeId,
        name: targetName,
        level: Math.max(0, newLevel), // Initial rough level
        color: colors[Math.max(0, newLevel) % colors.length],
      };
      newNodes.push(newNodeToAdd);
      targetNode = newNodeToAdd; // Use the newly created node object
      createdNewNode = true;
    }

    const newLink: Link = {
      source: command === '<' ? newTargetNodeId! : sourceId,
      target: command === '<' ? sourceId : newTargetNodeId!,
      type: command === '=' ? "friend" : "parent-child"
    };
    newLinks.push(newLink);

    // If a parent-child link was added, or a new node that will form one, recalculate levels for the component.
    if (newLink.type === 'parent-child' || createdNewNode) {
      // Find all components with the current set of nodes and the new link temporarily added for component finding
      const tempLinksForComponentFinding = [...graphData.links, newLink];
      const allComponents = findConnectedComponents(newNodes, tempLinksForComponentFinding);
      
      const affectedNodeIds = new Set<string>([sourceId, newTargetNodeId!]);
      let targetComponentNodeIds: Set<string> | null = null;

      for (const comp of allComponents) {
        const compIds = new Set(comp.map((n: Node) => n.id));
        if (compIds.has(sourceId) || compIds.has(newTargetNodeId!)) {
          targetComponentNodeIds = compIds;
          break;
        }
      }

      if (targetComponentNodeIds) {
        const newLevelsMap = recalculateLevelsInComponent(targetComponentNodeIds, newNodes, newLinks);
        newNodes = newNodes.map((n: Node) => {
          if (newLevelsMap.has(n.id)) {
            const newLvl = newLevelsMap.get(n.id)!;
            return { 
              ...n, 
              level: newLvl,
              color: n.color // Keep color for now, or re-assign based on newLvl if desired
            };
          }
          return n;
        });
      }
    }

    setGraphData({
      nodes: newNodes,
      links: newLinks
    });
  };

  // Function to update a relationship
  const updateRelationship = (nodeId: string, oldType: string, newCommand: string, targetName: string) => {
    const oldRelationships = getNodeRelationships(nodeId)
    const oldRelationship = oldRelationships.find((r: Relationship) => 
      r.type === oldType && 
      graphData.nodes.find((n: Node) => n.id === r.targetId)?.name === targetName
    )

    if (!oldRelationship) return

    // Remove old link
    setGraphData((prev: GraphData) => ({
      ...prev,
      links: prev.links.filter((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id
        return !(
          (sourceId === nodeId && targetId === oldRelationship.targetId) ||
          (targetId === nodeId && sourceId === oldRelationship.targetId)
        )
      })
    }))

    // Add new link
    const targetNode = graphData.nodes.find((n: Node) => n.id === oldRelationship.targetId)
    if (!targetNode) return

    const newLink: Link = {
      source: newCommand === '<' ? targetNode.id : nodeId,
      target: newCommand === '<' ? nodeId : targetNode.id,
      type: newCommand === '=' ? "friend" : "parent-child"
    }

    setGraphData((prev: GraphData) => ({
      ...prev,
      links: [...prev.links, newLink]
    }))
  }

  // Function to delete a relationship (link) from a node
  const deleteRelationship = (nodeId: string, relType: string, targetName: string) => {
    setGraphData((prev: GraphData) => {
      // Find the target node by name
      const targetNode = prev.nodes.find((n: Node) => n.name === targetName)
      if (!targetNode) return prev
      // Remove the link that matches the relationship
      const filteredLinks = prev.links.filter((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id
        if (relType === 'child') {
          return !(sourceId === nodeId && targetId === targetNode.id && link.type === 'parent-child')
        } else if (relType === 'parent') {
          return !(sourceId === targetNode.id && targetId === nodeId && link.type === 'parent-child')
        } else if (relType === 'friend') {
          // Friend links are bidirectional
          return !(((sourceId === nodeId && targetId === targetNode.id) || (sourceId === targetNode.id && targetId === nodeId)) && link.type === 'friend')
        }
        return true
      })
      return { ...prev, links: filteredLinks }
    })
  }

  // Update node content
  const updateNodeContent = (nodeId: string, content: string) => {
    setGraphData((prev: GraphData) => ({
      ...prev,
      nodes: prev.nodes.map((node: Node) =>
        node.id === nodeId ? { ...node, content } : node
      ),
    }));
    // If the editing node is the one being updated, reflect changes immediately if needed
    if (editingNode && editingNode.id === nodeId) {
        setEditingNode(prev => prev ? { ...prev, content } : null);
    }
  };

  // Update node name and all references
  const updateNodeName = (nodeId: string, newName: string) => {
    setGraphData((prev: GraphData) => {
      // Store current positions of all nodes
      const nodePositions = new Map(
        prev.nodes.map(node => [node.id, { x: node.x || 0, y: node.y || 0, fx: node.fx, fy: node.fy }])
      );

      // Update the node itself first
      const updatedNodes = prev.nodes.map((node: Node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            name: newName,
            // Preserve position
            x: nodePositions.get(node.id)?.x,
            y: nodePositions.get(node.id)?.y,
            fx: nodePositions.get(node.id)?.fx,
            fy: nodePositions.get(node.id)?.fy
          };
        }
        // Preserve positions of other nodes
        return {
          ...node,
          x: nodePositions.get(node.id)?.x,
          y: nodePositions.get(node.id)?.y,
          fx: nodePositions.get(node.id)?.fx,
          fy: nodePositions.get(node.id)?.fy
        };
      });

      // Update links while preserving their structure
      const updatedLinks = prev.links.map((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        
        const sourceNode = updatedNodes.find((n: Node) => n.id === sourceId);
        const targetNode = updatedNodes.find((n: Node) => n.id === targetId);

        if (!sourceNode || !targetNode) return link;

        return {
          ...link,
          source: sourceNode,
          target: targetNode,
          type: link.type
        };
      });

      // Update simulation with preserved positions
      if (simulationRef.current) {
        // Stop any ongoing simulation
        simulationRef.current.stop();
        
        // Update nodes and links
        simulationRef.current.nodes(updatedNodes);
        simulationRef.current.force("link", d3.forceLink<Node, Link>(updatedLinks)
          .id((d) => d.id)
          .distance((link) => link.type === "friend" ? 100 : 60)
          .strength((link) => link.type === "friend" ? 0.1 : 0.7)
        );

        // Restart with a very low alpha to minimize movement
        simulationRef.current.alpha(0.1).restart();
      }

      return {
        nodes: updatedNodes,
        links: updatedLinks
      };
    });
  };

  // Handle node click
  const handleNodeClick = (node: Node, event: MouseEvent) => {
    event.stopPropagation()
    setSelectedNode(node)

    // Calculate position for the toolbar
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setToolbarPosition({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }
  }

  // Handle node double click
  const handleNodeDoubleClick = (node: Node, event: MouseEvent) => {
    event.stopPropagation()
    setEditingNode(node)
    setSelectedNode(null)
  }

  // Handle background click to deselect
  const handleBackgroundClick = () => {
    setSelectedNode(null)
  }

  // Main D3 setup effect
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg.append("g");

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
            source: sourceNode, // Explicitly use the node object from the current graphData.nodes
            target: targetNode  // Explicitly use the node object from the current graphData.nodes
        };
    }).filter(l => l !== null) as Link[];

    const components = findConnectedComponents(graphData.nodes, processedLinks);
    const nodeToComponentIndex = new Map<string, number>();
    const potentialRootNodeIds = new Set<string>();
    components.forEach((comp, idx) => {
      let minLevel = Infinity;
      comp.forEach(node => {
        nodeToComponentIndex.set(node.id, idx);
        if (node.level < minLevel) minLevel = node.level;
      });
      comp.forEach(node => { if (node.level === minLevel) potentialRootNodeIds.add(node.id); });
    });

    const finalRootNodeIds = new Set<string>();
    potentialRootNodeIds.forEach(nodeId => {
      let isTrueDisplayRoot = true;
      for (const link of processedLinks) {
        const linkTarget = link.target as Node;
        const linkSource = link.source as Node;

        if (linkTarget.id === nodeId && link.type === 'parent-child') {
          if (potentialRootNodeIds.has(linkSource.id) && linkSource.level === linkTarget.level) {
            isTrueDisplayRoot = false;
            break;
          }
        }
      }
      if (isTrueDisplayRoot) finalRootNodeIds.add(nodeId);
    });

    const simulation = d3
      .forceSimulation<Node, Link>(graphData.nodes) 
      .force(
        "link",
        d3.forceLink<Node, Link>(processedLinks)
          .id((d) => d.id)
          .distance((link) => (link.type === "friend" ? scaledFriendLinkDist : scaledParentChildLinkDist))
          .strength((link) => (link.type === "friend" ? 0.2 : 0.9))
      )
      .force("charge", d3.forceManyBody().strength(scaledManyBodyStrength))
      .force("collide", d3.forceCollide().radius(scaledCollideRadius).strength(1));

    if (components.length > 0) {
      if (components.length > 1) {
        const numComponents = components.length;
        const effectiveInterGraphDivisor = Math.max(1, interGraphCompactness);
        const interGraphSpacingDivisor = effectiveInterGraphDivisor * 2;
        const componentAnchorRadius = (Math.min(width, height) / interGraphSpacingDivisor) * (Math.log(numComponents + 1) || 1);
        const componentAnchors = components.map((_, i) => {
          const angle = (2 * Math.PI / components.length) * i;
          return { x: componentAnchorRadius * Math.cos(angle), y: componentAnchorRadius * Math.sin(angle) };
        });

        components.forEach((_componentNodes, i) => {
          const anchorX = componentAnchors[i].x;
          const anchorY = componentAnchors[i].y;
          simulation.force(`anchorX-${i}`, d3.forceX<Node>(anchorX).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.08 : 0));
          simulation.force(`anchorY-${i}`, d3.forceY<Node>(anchorY).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.08 : 0));
          simulation.force(`radial-${i}`, d3.forceRadial<Node>(
            (d) => (d.level * scaledMultiCompRadialLevelMultiplier) + scaledMultiCompRadialBaseOffset,
            anchorX, anchorY
          ).strength(d => nodeToComponentIndex.get(d.id) === i ? 0.95 : 0));
        });
      } else { // Single component
        simulation.force("center", d3.forceCenter(0, 0).strength(0.05));
        simulation.force("radial-0", d3.forceRadial<Node>(
          (d) => (d.level * scaledSingleCompRadialLevelMultiplier) + scaledSingleCompRadialBaseOffset, 0, 0)
          .strength(0.95));
      }
    }
    
    if (graphData.nodes.length > 0 && processedLinks.filter(l => l.type === 'parent-child').length > 0) {
       simulation.force("siblingDistribution", createSiblingDistributionForce(graphData.nodes, processedLinks, 0.7, scaledSiblingDistForceIdealLinkDistance));
    }

    simulationRef.current = simulation;

    const linkElements = g.append("g").attr("stroke", "#999").attr("stroke-opacity", 0.6)
      .selectAll<SVGLineElement, Link>("line")
      .data(processedLinks)
      .join("line")
      .attr("stroke-width", (d: Link) => d.type === "parent-child" ? 2 : 1)
      .attr("stroke-dasharray", (d: Link) => d.type === "friend" ? "5,5" : null)
      .attr("marker-start", (d: Link) => d.type === "parent-child" ? "url(#triangle-default)" : null);
    linkSelectionRef.current = linkElements;

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
              
              const pushX = (dx / distance) * overlap * 0.5;
              const pushY = (dy / distance) * overlap * 0.5;
        
              otherNode.x = (otherNode.x || 0) + pushX;
              otherNode.y = (otherNode.y || 0) + pushY;
            }
          });
        })
        .on("end", (event, d: Node) => {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          d.fx = null; 
          d.fy = null; 
        })
      )
      .on("click", (event, d_clk: Node) => { handleNodeClick(d_clk, event); })
      .on("dblclick", (event, d_dblclk: Node) => { handleNodeDoubleClick(d_dblclk, event); })
      .on("pointerover", function(event, hovered_d: Node) {
        event.stopPropagation();
        if (enableHoverEffects) {
          if (hoveredNodeId !== hovered_d.id) {
            setHoveredNodeId(hovered_d.id);
          }
        }
      })
      .on("pointerout", function(event, d_out: Node) {
        event.stopPropagation();
        if (enableHoverEffects && !isZooming) {
          setHoveredNodeId(null);
        }
      });
    nodeSelectionRef.current = nodeElements;

    nodeElements.append("circle").attr("r", 11).attr("class", "node-base")
                 .attr("fill", (d_node: Node) => finalRootNodeIds.has(d_node.id) ? "white" : "transparent");
    nodeElements.append("circle").attr("r", 8).attr("fill", (d_node: Node) => d_node.color || "#999");
    
    const textElements = nodeElements.append("text")
      .attr("dx", 0).attr("dy", 20).attr("text-anchor", "middle")
      .text((d: Node) => d.name).attr("fill", "white")
      .attr("font-family", "sans-serif")
      .attr("font-size", `${BASE_SVG_FONT_SIZE}px`);
    textSelectionRef.current = textElements;

    const findNodeUnderMouse = (event: any, transform: d3.ZoomTransform): string | null => {
      if (!svgRef.current || !graphData.nodes) return null;
      const [mouseX, mouseY] = d3.pointer(event, svgRef.current);
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
    };

    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4])
      .on("start", (event) => {
        setIsZooming(true);
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        let nodeUnderMouse = null;
        if(enableHoverEffects) {
            nodeUnderMouse = findNodeUnderMouse(event.sourceEvent || event, event.transform);
        }
        if (hoveredNodeId !== nodeUnderMouse) {
            setHoveredNodeId(nodeUnderMouse);
        }
        _updateVisualStyles(nodeUnderMouse, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current, nodeSelectionRef.current, finalRootNodeIds);
      })
      .on("end", (event) => {
        setIsZooming(false);
        let nodeUnderMouse = null;
        if(enableHoverEffects) {
            nodeUnderMouse = findNodeUnderMouse(event.sourceEvent || event, event.transform);
        }
        if (hoveredNodeId !== nodeUnderMouse) {
            setHoveredNodeId(nodeUnderMouse);
        }
        _updateVisualStyles(nodeUnderMouse, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current, nodeSelectionRef.current, finalRootNodeIds);
      });
      
    svg.call(zoomBehavior).call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, height / 2));
    svg.on("click", (event: MouseEvent) => {
        if (event.target === svg.node() && hoveredNodeId !== null) {
            setHoveredNodeId(null);
        }
        handleBackgroundClick();
    }, true);

    _updateVisualStyles(hoveredNodeId, enableHoverEffects, graphData, intraGraphCompactness, svg.node(), linkSelectionRef.current, textSelectionRef.current, nodeSelectionRef.current, finalRootNodeIds);

    simulation.alpha(0.5).restart();

    simulation.on("tick", () => {
      linkElements
        .attr("x1", (d) => (typeof d.source === "string" ? 0 : (d.source as Node).x || 0))
        .attr("y1", (d) => (typeof d.source === "string" ? 0 : (d.source as Node).y || 0))
        .attr("x2", (d) => (typeof d.target === "string" ? 0 : (d.target as Node).x || 0))
        .attr("y2", (d) => (typeof d.target === "string" ? 0 : (d.target as Node).y || 0))

      nodeElements.attr("transform", (d: Node) => `translate(${d.x || 0},${d.y || 0})`)

      // New: Enforce hierarchical distance rule
      const componentCenters = new Map<number, { x: number; y: number }>();
      if (components.length > 1) {
        components.forEach((_, i) => {
          // Use the anchor points calculated for multi-component layout
          const anchorXForce = simulationRef.current?.force<d3.ForceX<Node>>(`anchorX-${i}`);
          const anchorYForce = simulationRef.current?.force<d3.ForceY<Node>>(`anchorY-${i}`);
          if (anchorXForce && anchorYForce) {
            // @ts-ignore // D3 types might not directly expose x() and y() for all force types
            componentCenters.set(i, { x: anchorXForce.x(), y: anchorYForce.y() });
          }
        });
      } else {
        // Single component, center is (0,0) due to forceCenter
        if (components.length === 1) componentCenters.set(0, { x: 0, y: 0 });
      }

      processedLinks.forEach(link => {
        if (link.type === "parent-child") {
          const parent = link.source as Node;
          const child = link.target as Node;

          if (!parent.x || !parent.y || !child.x || !child.y) return; // Skip if positions are not defined
          
          const componentIndex = nodeToComponentIndex.get(parent.id);
          if (componentIndex === undefined) return;

          const center = componentCenters.get(componentIndex);
          if (!center) return;

          const distParentSq = (parent.x - center.x) ** 2 + (parent.y - center.y) ** 2;
          const distChildSq = (child.x - center.x) ** 2 + (child.y - center.y) ** 2;

          if (distChildSq <= distParentSq) {
            const vecX = child.x - parent.x;
            const vecY = child.y - parent.y;
            const vecMag = Math.sqrt(vecX ** 2 + vecY ** 2);
            const slightPushFactor = 1.05; // Push child slightly further than parent
            const parentDist = Math.sqrt(distParentSq);

            if (vecMag > 0.001) { // Avoid division by zero if parent and child are at the same spot
                const desiredChildDist = parentDist * slightPushFactor;
                // Calculate child's new position relative to the center
                const dirToParentX = parent.x - center.x;
                const dirToParentY = parent.y - center.y;
                const dirToParentMag = Math.sqrt(dirToParentX**2 + dirToParentY**2);

                if (dirToParentMag > 0.001) {
                    // Position child along the line from center through parent, but further out
                    const newChildX = center.x + (dirToParentX / dirToParentMag) * desiredChildDist;
                    const newChildY = center.y + (dirToParentY / dirToParentMag) * desiredChildDist;
                    
                    // Nudge child slightly further along parent-child vector as well for stability
                    const nudgeFactor = 0.1; // Small nudge
                    child.x = newChildX + (vecX / vecMag) * nudgeFactor;
                    child.y = newChildY + (vecY / vecMag) * nudgeFactor;

                } else {
                    // Parent is at the center, push child out along parent-child vector
                    child.x = parent.x + (vecX / vecMag) * (parentDist * slightPushFactor - parentDist + 5); // Ensure it's further
                    child.y = parent.y + (vecY / vecMag) * (parentDist * slightPushFactor - parentDist + 5);
                }
            } else {
                 // Parent and child are at the same spot, push child away from parent slightly
                 // This case should ideally be handled by collide force, but as a fallback:
                 child.x = parent.x + (Math.random() - 0.5) * 5; 
                 child.y = parent.y + (Math.random() - 0.5) * 5; 
            }
            // If node positions are fixed (fx, fy), this direct manipulation might conflict.
            // Consider only applying if fx/fy are not set, or unsetting them.
             child.fx = null; child.fy = null; // Ensure forces can continue to act on it after adjustment
          }
        }
      });
    })

    const handleResize = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth
        const newHeight = containerRef.current.clientHeight
        svg.attr("width", newWidth).attr("height", newHeight)
        if (simulationRef.current) {
            const updatedNumComponents = components.length;
            if (updatedNumComponents > 1) {
                const effectiveInterGraphDivisorResize = Math.max(1, interGraphCompactness);
                const updatedComponentAnchorRadius = (Math.min(newWidth, newHeight) / effectiveInterGraphDivisorResize) * (Math.log(updatedNumComponents + 1) || 1);
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

  // This useEffect is still valuable for when hoveredNodeId is set by non-zoom pointer events
  useEffect(() => {
    const tempSvgNode = d3.select(svgRef.current).node();
    
    const currentComponents = findConnectedComponents(graphData.nodes, graphData.links);
    const currentPotentialRootNodeIds = new Set<string>();
    currentComponents.forEach((comp) => {
      let minLevel = Infinity;
      comp.forEach(node => { if (node.level < minLevel) minLevel = node.level; });
      comp.forEach(node => { if (node.level === minLevel) currentPotentialRootNodeIds.add(node.id); });
    });
    const currentFinalRootNodeIds = new Set<string>();
    currentPotentialRootNodeIds.forEach(nodeId => {
      let isTrueRoot = true;
      for (const link_data of graphData.links) {
        const linkTargetId = typeof link_data.target === 'string' ? link_data.target : (link_data.target as Node).id;
        const linkSourceId = typeof link_data.source === 'string' ? link_data.source : (link_data.source as Node).id;
        if (linkTargetId === nodeId && link_data.type === 'parent-child' && currentPotentialRootNodeIds.has(linkSourceId)) {
          isTrueRoot = false; break;
        }
      }
      if (isTrueRoot) currentFinalRootNodeIds.add(nodeId);
    });

    _updateVisualStyles(
      hoveredNodeId, 
      enableHoverEffects, 
      graphData, 
      intraGraphCompactness, 
      tempSvgNode, 
      linkSelectionRef.current, 
      textSelectionRef.current, 
      nodeSelectionRef.current, 
      currentFinalRootNodeIds
    );
  }, [hoveredNodeId, enableHoverEffects, graphData, intraGraphCompactness]);

  const _updateVisualStyles = (
    currentHoverId: string | null,
    isHoverEnabled: boolean,
    currentGraphData: GraphData, 
    currentIntraGraphCompactness: number, 
    svgNode: SVGSVGElement | null,
    linksSel: d3.Selection<SVGLineElement, Link, SVGGElement, any> | null,
    textsSel: d3.Selection<SVGTextElement, Node, SVGGElement, any> | null,
    nodesSel: d3.Selection<SVGGElement, Node, SVGGElement, any> | null,
    finalRootIds: Set<string>
  ) => {
    if (svgNode) {
        const currentZoomScale = d3.zoomTransform(svgNode).k.toFixed(2);
        console.log(`_updateVisualStyles called. Hovered ID: ${currentHoverId}, Zoom Scale: ${currentZoomScale}`);
    } else {
        console.log(`_updateVisualStyles called. Hovered ID: ${currentHoverId}, SVGNode not available for scale.`);
    }

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

    textsSel.attr("font-size", (d_text: Node) => 
        (isHoverEnabled && currentHoverId && directlyConnectedToHovered.has(d_text.id)) ? `${fixedHighlightedFontSize}px` : `${BASE_SVG_FONT_SIZE}px`
      )
      .style("opacity", (d_text: Node) => {
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
  };

  // Save mind map to JSON file
  const saveMindMapToFile = () => {
    const dataStr = JSON.stringify(graphData, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mindmap.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Load mind map from JSON file
  const loadMindMapFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        // Re-link source/target from string IDs to node objects
        const nodes = parsed.nodes
        const nodeMap = new Map(nodes.map((n: any) => [n.id, n]))
        const links = parsed.links.map((link: any) => ({
          ...link,
          source: nodeMap.get(typeof link.source === 'string' ? link.source : link.source.id),
          target: nodeMap.get(typeof link.target === 'string' ? link.target : link.target.id),
        }))
        setGraphData({ nodes, links })
        alert('Mind map loaded!')
      } catch (e) {
        alert('Failed to load mind map.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} width="100%" height="100%" />

      {selectedNode && (
        <NodeToolbar
          node={selectedNode}
          position={toolbarPosition}
          onDelete={() => deleteNode(selectedNode.id)}
          nodes={graphData.nodes.filter((n) => n.id !== selectedNode.id)}
        />
      )}

      {editingNode && (
        <MarkdownEditor
          node={editingNode}
          relationships={getNodeRelationships(editingNode.id)}
          allNodes={graphData.nodes.filter(n => n.id !== editingNode.id)}
          onContentChange={(content) => updateNodeContent(editingNode.id, content)}
          onAddRelationship={(command, targetName) => addRelationship(editingNode.id, command, targetName)}
          onUpdateRelationship={(oldType, newCommand, targetName) => 
            updateRelationship(editingNode.id, oldType, newCommand, targetName)
          }
          onNameChange={(newName) => updateNodeName(editingNode.id, newName)}
          onClose={() => setEditingNode(null)}
          onDeleteRelationship={(type, targetName) => deleteRelationship(editingNode.id, type, targetName)}
        />
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        {showSettings && (
          <div 
            className="bg-gray-800 p-4 rounded-lg shadow-xl mb-2 w-64"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside panel
          >
            <div>
              <label htmlFor="intraGraphCompactness" className="block text-sm font-medium text-gray-300 mb-1">
                Intra-Graph Compactness (Node Spacing)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  id="intraGraphCompactness"
                  name="intraGraphCompactness"
                  min="0"
                  max="10"
                  step="0.1"
                  value={intraGraphCompactness} 
                  onChange={(e) => setIntraGraphCompactness(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm text-gray-400 w-8 text-right">{intraGraphCompactness.toFixed(1)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                0 = very wide, 10 = very compact nodes.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
              <label className="flex items-center justify-between text-sm font-medium text-gray-300">
                <span>Enable Hover Effects</span>
                <input
                  type="checkbox"
                  checked={enableHoverEffects}
                  onChange={(e) => setEnableHoverEffects(e.target.checked)}
                  className="form-checkbox h-5 w-5 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-600"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Highlight node and its connections on hover/touch.
              </p>
            </div>
          </div>
        )}
        <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm">
          {showSettings ? "Close Settings" : "Settings"}
        </Button>
        <Button onClick={saveMindMapToFile} variant="outline" size="sm">
          Save to File
        </Button>
        <label className="w-full">
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={loadMindMapFromFile} />
          <Button asChild variant="outline" size="sm">
            <span>Load from File</span>
          </Button>
        </label>
        <Button onClick={() => addNode("root", "New Root Node")} variant="outline" size="sm">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Root Node
        </Button>
      </div>
    </div>
  )
}


