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
    { id: "root", name: "Main Concept", level: 0, color: "#38bdf8" },
    { id: "child1", name: "Sub-concept 1", level: 1, color: "#f59e42" },
    { id: "child2", name: "Sub-concept 2", level: 1, color: "#10b981" },
  ],
  links: [
    { source: "root", target: "child1", type: "parent-child" },
    { source: "root", target: "child2", type: "parent-child" },
    { source: "child1", target: "child2", type: "friend" },
  ],
}

const nodePositions = [
  { x: 200, y: 80 },
  { x: 100, y: 220 },
  { x: 300, y: 220 },
];

export default function MindMap({ initialGraphDataFromFolder, initialNodeId, mapId }: MindMapProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [count, setCount] = useState(0);
  const [graphData, setGraphData] = useState<GraphData>(initialGraphDataFromFolder || initialData);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Debug: Log State
  useEffect(() => {
    console.log("[DEBUG] MindMap State - Nodes:", graphData.nodes);
    console.log("[DEBUG] MindMap State - Links:", graphData.links);
  }, [graphData]);

  useEffect(() => {
    if (!svgRef.current) {
      console.error("[DEBUG] SVG-Ref ist null!");
      return;
    }
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    try {
      // Debug: Log D3-Setup
      console.log("[DEBUG] Starte D3-Force-Simulation mit Drag & Drop und Zoom/Pan");
      const nodes = graphData.nodes.map(n => ({ ...n }));
      const links = graphData.links.map(l => ({ ...l }));
      console.log("[DEBUG] D3-Nodes:", nodes);
      console.log("[DEBUG] D3-Links:", links);

      // Draw groups for layering
      const g = svg.append("g");
      const linkGroup = g.append("g").attr("class", "links");
      const nodeGroup = g.append("g").attr("class", "nodes");
      const labelGroup = g.append("g").attr("class", "labels");

      // Draw links
      const link = linkGroup.selectAll("line")
        .data(links)
        .enter()
        .append("line")
        .attr("stroke", d => d.type === "friend" ? "#a21caf" : "#64748b")
        .attr("stroke-width", 4)
        .attr("stroke-dasharray", d => d.type === "friend" ? "6,6" : null);

      // Draw nodes
      const node = nodeGroup.selectAll("circle")
        .data(nodes)
        .enter()
        .append("circle")
        .attr("r", 40)
        .attr("fill", d => d.color || "#38bdf8")
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 4)
        .call(
          d3.drag<SVGCircleElement, Node>()
            .on("start", function (event, d) {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", function (event, d) {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", function (event, d) {
              if (!event.active) simulation.alphaTarget(0);
          d.fx = null; 
          d.fy = null; 
        })
        );

      // Draw labels
      const label = labelGroup.selectAll("text")
        .data(nodes)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#1e293b")
        .attr("font-size", 18)
        .attr("font-weight", "bold")
        .text(d => d.name);

      // D3 Force Simulation
      const simulation = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, any>(links).id((d: any) => d.id).distance(120))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(200, 150))
        .force("collide", d3.forceCollide().radius(43))
        .on("tick", () => {
          link
            .attr("x1", d => ((d.source as Node).x ?? 0))
            .attr("y1", d => ((d.source as Node).y ?? 0))
            .attr("x2", d => ((d.target as Node).x ?? 0))
            .attr("y2", d => ((d.target as Node).y ?? 0));
          node
            .attr("cx", d => (d.x ?? 0))
            .attr("cy", d => (d.y ?? 0));
          label
            .attr("x", d => (d.x ?? 0))
            .attr("y", d => ((d.y ?? 0) + 6));
        });

      // Zoom & Pan
      svg.call(
        d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 2])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
          })
      );

      // Debug: Check SVG in DOM
      setTimeout(() => {
        const svgElem = svgRef.current;
        if (svgElem) {
          console.log("[DEBUG] SVG im DOM:", svgElem);
          console.log("[DEBUG] SVG ChildElementCount:", svgElem.childElementCount);
      } else {
          console.error("[DEBUG] SVG-Ref nach Rendern immer noch null!");
        }
      }, 100);

      return () => { simulation.stop(); };
    } catch (err) {
      console.error("[DEBUG] Fehler im D3-Setup:", err);
    }
  }, [graphData]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <h2 style={{ color: '#1e293b', fontSize: 32, fontWeight: 'bold', marginBottom: 24 }}>MindMap DEBUG</h2>
      <div style={{ marginBottom: 24 }}>
        <Button onClick={() => setCount(count + 1)}>
          Test-Button (geklickt: {count}x)
        </Button>
              </div>
      <div style={{ marginBottom: 24 }}>
        <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm">
          {showSettings ? "Close Settings" : "Settings"}
        </Button>
      </div>
      {showSettings && (
        <div style={{ background: '#e0e7ef', padding: 24, borderRadius: 12, boxShadow: '0 2px 8px #0001', position: 'absolute', top: 80, right: 40, zIndex: 10 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Settings-Panel (Platzhalter)</div>
          <div>Hier könnten Einstellungen stehen.</div>
        </div>
      )}
      <svg
        ref={svgRef}
        width={400}
        height={300}
        style={{ background: '#cbd5e1', borderRadius: 16, border: '2px solid #64748b', marginTop: 32 }}
      />
    </div>
  );
}


