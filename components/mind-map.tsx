"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { NodeToolbar } from "@/components/node-toolbar"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { MarkdownEditor } from "@/components/markdown-editor"

// Constants for text visibility based on effective font size
const BASE_SVG_FONT_SIZE = 12; // The actual font size set on SVG <text> elements
const FULLY_OPAQUE_EFFECTIVE_SIZE = 10;   // Effective px size. Above this: Opacity 1
const INVISIBLE_EFFECTIVE_SIZE = 7;        // Effective px size. Below this: Opacity 0.

interface Relationship {
  type: "friend" | "child" | "parent";
  targetId: string;
  targetName: string;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  level: number;
  color?: string;
  content?: string;
  x?: number;
  y?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: "parent-child" | "friend";
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

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

export default function MindMap({ initialGraphDataFromFolder }: MindMapProps) {
  const [graphData, setGraphData] = useState<GraphData>(
    initialGraphDataFromFolder || initialData // Prioritize folder data if available
  )
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null)

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
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
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
    const parentNode = graphData.nodes.find((node) => node.id === parentId)

    const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"]

    if (!parentNode) {
      // Add as a new root node (level 0, no link)
      const newNode: Node = {
        id: newNodeId,
        name: nodeName,
        level: 0,
        color: colors[0],
      }
      setGraphData((prev) => ({
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

    setGraphData((prev) => ({
      nodes: [...prev.nodes, newNode],
      links: [...prev.links, newLink],
    }))
  }

  // Function to delete a node
  const deleteNode = (nodeId: string) => {
    setGraphData((prev) => ({
      nodes: prev.nodes.filter((node) => node.id !== nodeId),
      links: prev.links.filter(
        (link) =>
          (typeof link.source === "string" ? link.source !== nodeId : link.source.id !== nodeId) &&
          (typeof link.target === "string" ? link.target !== nodeId : link.target.id !== nodeId),
      ),
    }))
    setSelectedNode(null)
    setEditingNode(null)
  }

  // Function to add a relationship
  const addRelationship = (sourceId: string, command: string, targetName: string) => {
    const targetNode = graphData.nodes.find(node => node.name === targetName)
    if (!targetNode) {
      // Create new node if it doesn't exist
      const newNodeId = `node-${Date.now()}`
      const sourceNode = graphData.nodes.find(node => node.id === sourceId)
      if (!sourceNode) return

      const newLevel = command === '>' ? sourceNode.level + 1 : 
                      command === '<' ? sourceNode.level - 1 : 
                      sourceNode.level
      const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"]

      const newNode: Node = {
        id: newNodeId,
        name: targetName,
        level: Math.max(0, newLevel),
        color: colors[Math.max(0, newLevel) % colors.length],
      }

      const newLink: Link = {
        source: command === '<' ? newNodeId : sourceId,
        target: command === '<' ? sourceId : newNodeId,
        type: command === '=' ? "friend" : "parent-child"
      }

      setGraphData(prev => ({
        nodes: [...prev.nodes, newNode],
        links: [...prev.links, newLink]
      }))
    } else {
      // Add link between existing nodes
      const newLink: Link = {
        source: command === '<' ? targetNode.id : sourceId,
        target: command === '<' ? sourceId : targetNode.id,
        type: command === '=' ? "friend" : "parent-child"
      }

      setGraphData(prev => ({
        ...prev,
        links: [...prev.links, newLink]
      }))
    }
  }

  // Function to update a relationship
  const updateRelationship = (nodeId: string, oldType: string, newCommand: string, targetName: string) => {
    const oldRelationships = getNodeRelationships(nodeId)
    const oldRelationship = oldRelationships.find(r => 
      r.type === oldType && 
      graphData.nodes.find(n => n.id === r.targetId)?.name === targetName
    )

    if (!oldRelationship) return

    // Remove old link
    setGraphData(prev => ({
      ...prev,
      links: prev.links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id
        const targetId = typeof link.target === 'string' ? link.target : link.target.id
        return !(
          (sourceId === nodeId && targetId === oldRelationship.targetId) ||
          (targetId === nodeId && sourceId === oldRelationship.targetId)
        )
      })
    }))

    // Add new link
    const targetNode = graphData.nodes.find(n => n.id === oldRelationship.targetId)
    if (!targetNode) return

    const newLink: Link = {
      source: newCommand === '<' ? targetNode.id : nodeId,
      target: newCommand === '<' ? nodeId : targetNode.id,
      type: newCommand === '=' ? "friend" : "parent-child"
    }

    setGraphData(prev => ({
      ...prev,
      links: [...prev.links, newLink]
    }))
  }

  // Function to delete a relationship (link) from a node
  const deleteRelationship = (nodeId: string, relType: string, targetName: string) => {
    setGraphData(prev => {
      // Find the target node by name
      const targetNode = prev.nodes.find(n => n.name === targetName)
      if (!targetNode) return prev
      // Remove the link that matches the relationship
      const filteredLinks = prev.links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id
        const targetId = typeof link.target === 'string' ? link.target : link.target.id
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
    setGraphData((prev) => {
      // Store current positions of all nodes
      const nodePositions = new Map(
        prev.nodes.map(node => [node.id, { 
          x: node.x || 0, 
          y: node.y || 0, 
          fx: node.fx, 
          fy: node.fy 
        }])
      );

      // Update nodes while preserving positions
      const updatedNodes = prev.nodes.map(node => {
        const pos = nodePositions.get(node.id);
        return {
          ...node,
          content: node.id === nodeId ? content : node.content,
          // Preserve position for all nodes
          x: pos?.x,
          y: pos?.y,
          fx: pos?.fx,
          fy: pos?.fy
        };
      });

      // Preserve link structure
      const updatedLinks = prev.links.map(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        
        const sourceNode = updatedNodes.find(n => n.id === sourceId);
        const targetNode = updatedNodes.find(n => n.id === targetId);

        if (!sourceNode || !targetNode) return link;

        return {
          ...link,
          source: sourceNode,
          target: targetNode,
          type: link.type
        };
      });

      // Update simulation while preserving positions
      if (simulationRef.current) {
        // Stop any ongoing simulation
        simulationRef.current.stop();
        
        // Update nodes and links
        simulationRef.current.nodes(updatedNodes);
        simulationRef.current.force("link", d3.forceLink<Node, Link>(updatedLinks)
          .id((d) => d.id)
          .distance((link) => link.type === "friend" ? 100 : 60)
          .strength((link) => link.type === "friend" ? 0.1 : 0.8)
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

  // Update node name and all references
  const updateNodeName = (nodeId: string, newName: string) => {
    setGraphData((prev) => {
      // Store current positions of all nodes
      const nodePositions = new Map(
        prev.nodes.map(node => [node.id, { x: node.x || 0, y: node.y || 0, fx: node.fx, fy: node.fy }])
      );

      // Update the node itself first
      const updatedNodes = prev.nodes.map(node => {
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
      const updatedLinks = prev.links.map(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        
        const sourceNode = updatedNodes.find(n => n.id === sourceId);
        const targetNode = updatedNodes.find(n => n.id === targetId);

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
          .strength((link) => link.type === "friend" ? 0.1 : 0.8)
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

  // Initialize and update the D3 visualization
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight
    const svg = d3.select(svgRef.current)

    // Clear previous content
    svg.selectAll("*").remove() // Clear all, including defs from previous renders

    // No SVG filter needed for blurring anymore

    // Create the main group for the graph
    const g = svg.append("g")

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform) // Apply zoom to the main graph group

        const currentScale = event.transform.k;
        const effectiveFontSize = BASE_SVG_FONT_SIZE * currentScale;

        let targetOpacity = 1.0;

        if (effectiveFontSize >= FULLY_OPAQUE_EFFECTIVE_SIZE) {
          targetOpacity = 1.0;
        } else if (effectiveFontSize <= INVISIBLE_EFFECTIVE_SIZE) {
          targetOpacity = 0;
        } else {
          // Linearly interpolate opacity between INVISIBLE_EFFECTIVE_SIZE and FULLY_OPAQUE_EFFECTIVE_SIZE
          targetOpacity = d3.scaleLinear()
            .domain([INVISIBLE_EFFECTIVE_SIZE, FULLY_OPAQUE_EFFECTIVE_SIZE])
            .range([0, 1.0])
            .clamp(true)(effectiveFontSize);
        }

        // Apply opacity to all text labels
        g.selectAll<SVGTextElement, Node>(".node text")
          .style("opacity", targetOpacity)
          // .attr("filter", null); // Ensure no filter is applied if it was set previously by mistake
      })

    svg.call(zoom)
    svg.on("click", handleBackgroundClick)

    // Center the view initially
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    // Create the simulation
    const simulation = d3
      .forceSimulation<Node, Link>(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(graphData.links)
          .id((d) => d.id)
          .distance((link) => (link.type === "friend" ? 100 : 60))
          .strength((link) => (link.type === "friend" ? 0.1 : 0.8)),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(0, 0))
      .force("radial", d3.forceRadial<Node>((d) => 100 * d.level, 0, 0).strength(0.8))

    simulationRef.current = simulation

    // Create the links
    const link = g
      .append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke-width", (d) => (d.type === "parent-child" ? 2 : 1))
      .attr("stroke-dasharray", (d) => (d.type === "friend" ? "5,5" : null))

    // Add isosceles triangle for parent-child links (thinner version)
    svg
      .append("defs")
      .append("marker")
      .attr("id", "triangle")
      // viewBox: min-x, min-y, width, height. Path M0,-1.5 L16,0 L0,1.5Z.
      .attr("viewBox", "0 -1.5 16 3")
      // refX=0: Aligns marker's (0,0) (base of our path) with parent node center.
      .attr("refX", 0)
      .attr("refY", 0)
      // orient="auto": For marker-start, orients marker's +X axis along the line (parent to child).
      .attr("orient", "auto")
      // markerWidth/Height: Match viewBox for no scaling.
      .attr("markerWidth", 16)
      .attr("markerHeight", 3)
      .append("path")
      // Thinner isosceles triangle path: Base at x=0 (width 3), Tip at x=16.
      // Node (radius 8) covers x=0 to x=8. Visible tip from x=8 to x=16 (length 8).
      .attr("d", "M0,-1.5L16,0L0,1.5Z")
      .attr("fill", "#999")

    // Apply triangles to parent-child links
    link.filter((d) => d.type === "parent-child")
      .attr("marker-start", "url(#triangle)")

    // Create node groups
    const node = g
      .append("g")
      .selectAll<SVGGElement, Node>(".node")
      .data(graphData.nodes)
      .join("g")
      .attr("class", "node")
      .on("click", (event, d) => {
        handleNodeClick(d, event)
      })
      .on("dblclick", (event, d) => {
        handleNodeDoubleClick(d, event)
      })
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on("drag", (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as any
      )

    // Add circles to nodes
    node
      .append("circle")
      .attr("r", 8)
      .attr("fill", (d) => d.color || "#999")

    // Add text labels
    node
      .append("text")
      .attr("dx", 0)
      .attr("dy", 20)
      .attr("text-anchor", "middle")
      .text((d) => d.name)
      .attr("fill", "white")
      .attr("font-size", `${BASE_SVG_FONT_SIZE}px`) // Use constant here
      .attr("font-family", "sans-serif")

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (typeof d.source === "string" ? 0 : d.source.x || 0))
        .attr("y1", (d) => (typeof d.source === "string" ? 0 : d.source.y || 0))
        .attr("x2", (d) => (typeof d.target === "string" ? 0 : d.target.x || 0))
        .attr("y2", (d) => (typeof d.target === "string" ? 0 : d.target.y || 0))

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth
        const newHeight = containerRef.current.clientHeight
        svg.attr("width", newWidth).attr("height", newHeight)
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      simulation.stop()
    }
  }, [graphData])

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
