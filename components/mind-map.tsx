"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
// @ts-ignore
import { PlusCircle } from "lucide-react"
import { NodeToolbar } from "@/components/node-toolbar"
import { MarkdownEditor } from "@/components/markdown-editor"
import { useViewPositions } from "@/hooks/use-view-positions"
import ForceView from "@/components/views/ForceView"
import TreeView from "@/components/views/TreeView"
import type { Node, Link, GraphData, Relationship } from "@/lib/types"
import type { ViewPositions } from "@/components/views/shared-types"

// Props for the MindMap component
interface MindMapProps {
  initialGraphDataFromFolder?: GraphData
  initialNodeId?: string | null
  mapId?: string
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
  console.log('[DEBUG] MindMap: Komponente wird gerendert!', { initialGraphDataFromFolder, initialNodeId, mapId });
  
  // Core state
  const [graphData, setGraphData] = useState<GraphData>(initialGraphDataFromFolder || initialData)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 })
  
  // View settings
  const [viewMode, setViewMode] = useState<'force' | 'tree'>('force')
  const [intraGraphCompactness, setIntraGraphCompactness] = useState<number>(5)
  const [interGraphCompactness, setInterGraphCompactness] = useState<number>(5)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [enableHoverEffects, setEnableHoverEffects] = useState<boolean>(true)
  const [duplicateNodeTransparency, setDuplicateNodeTransparency] = useState<number>(0.9) // 10% more transparent (90% opacity)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [isZooming, setIsZooming] = useState<boolean>(false)
  // Tree raw positioning toggle
  const [useTreeRawPositions, setUseTreeRawPositions] = useState<boolean>(false)


  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Position management
  const {
    viewPositions,
    saveForcePositions,
    saveTreePositions,
    restoreForcePositions,
    restoreTreePositions,
    hasCompactnessChanged,
    clearTreePositions,
  } = useViewPositions()

  // Load initial node if initialNodeId is provided
  useEffect(() => {
    if (initialNodeId) {
      const nodeToSelect = graphData.nodes.find((n: Node) => n.id === initialNodeId);
      if (nodeToSelect) {
        setSelectedNode(nodeToSelect);
      }
    }
  }, [initialNodeId, graphData.nodes]);

  // Effect to update graphData if initialGraphDataFromFolder changes
  useEffect(() => {
    if (initialGraphDataFromFolder) {
      setGraphData(initialGraphDataFromFolder);
      setSelectedNode(null);
      setEditingNode(null);
    }
  }, [initialGraphDataFromFolder]);

  // Clear tree positions when compactness settings change
  useEffect(() => {
    if (hasCompactnessChanged(intraGraphCompactness, interGraphCompactness)) {
      clearTreePositions();
    }
  }, [intraGraphCompactness, interGraphCompactness, hasCompactnessChanged, clearTreePositions]);

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

  // Function to add a relationship
  const addRelationship = (sourceId: string, command: string, targetName: string) => {
    if (!targetName || !command) return;
    
    // Find or create target node
    let targetNode = graphData.nodes.find(n => n.name.toLowerCase() === targetName.toLowerCase());
    
    if (!targetNode) {
      // Create new node
      const sourceNode = graphData.nodes.find(n => n.id === sourceId);
      const newNodeId = `node-${Date.now()}`;
      
      // Calculate level based on command
      let newLevel = sourceNode ? sourceNode.level : 0;
      if (command === '>') {
        newLevel = sourceNode ? sourceNode.level + 1 : 1; // Child is one level deeper
      } else if (command === '<') {
        newLevel = sourceNode ? Math.max(0, sourceNode.level - 1) : 0; // Parent is one level up
      }
      // For '=' (friend), keep the same level as source
      
      targetNode = {
        id: newNodeId,
        name: targetName,
        level: newLevel,
        color: "#48dbfb"
      };
      
      setGraphData(prev => ({
        ...prev,
        nodes: [...prev.nodes, targetNode!]
      }));
    }
    
    // Determine relationship type based on command symbol
    const relationshipType: 'parent-child' | 'friend' = command === '=' ? "friend" : "parent-child";
    
    // Check if relationship already exists
    const existingLink = graphData.links.find(link => {
      const sourceId_check = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId_check = typeof link.target === 'string' ? link.target : link.target.id;
      return (sourceId_check === sourceId && targetId_check === targetNode!.id) ||
             (sourceId_check === targetNode!.id && targetId_check === sourceId);
    });
    
    if (!existingLink) {
      // Add new link with correct direction based on command
      const newLink: Link = {
        source: command === '<' ? targetNode.id : sourceId,
        target: command === '<' ? sourceId : targetNode.id,
        type: relationshipType
      };
      
      setGraphData(prev => ({
        ...prev,
        links: [...prev.links, newLink]
      }));
    }
  }

  // Update node content
  const updateNodeContent = (nodeId: string, content: string) => {
    setGraphData((prev: GraphData) => ({
      ...prev,
      nodes: prev.nodes.map((node: Node) =>
        node.id === nodeId ? { ...node, content } : node
      ),
    }));
    if (editingNode && editingNode.id === nodeId) {
        setEditingNode(prev => prev ? { ...prev, content } : null);
    }
  };

  // Update node text style
  const updateNodeTextStyle = (nodeId: string, textStyle: Node['textStyle']) => {
    setGraphData((prev: GraphData) => ({
      ...prev,
      nodes: prev.nodes.map((node: Node) =>
        node.id === nodeId ? { ...node, textStyle } : node
      ),
    }));
    if (editingNode && editingNode.id === nodeId) {
        setEditingNode(prev => prev ? { ...prev, textStyle } : null);
    }
  };

  // Update node name
  const updateNodeName = (nodeId: string, newName: string) => {
    setGraphData((prev: GraphData) => ({
      ...prev,
      nodes: prev.nodes.map((node: Node) =>
        node.id === nodeId ? { ...node, name: newName } : node
      ),
    }));
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

      {/* Render the appropriate view */}
      {viewMode === 'force' ? (
        <ForceView
          graphData={graphData}
          selectedNode={selectedNode}
          editingNode={editingNode}
          hoveredNodeId={hoveredNodeId}
          enableHoverEffects={enableHoverEffects}
          intraGraphCompactness={intraGraphCompactness}
          interGraphCompactness={interGraphCompactness}
          isZooming={isZooming}
          containerRef={containerRef}
          svgRef={svgRef}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onHoveredNodeChange={setHoveredNodeId}
          onBackgroundClick={handleBackgroundClick}
          onPositionsSave={() => {}} // Not used in this interface
          savedPositions={viewPositions}
          onForcePositionsSave={saveForcePositions}
          onForcePositionsRestore={restoreForcePositions}
        />
      ) : (
        <TreeView
          graphData={graphData}
          selectedNode={selectedNode}
          editingNode={editingNode}
          hoveredNodeId={hoveredNodeId}
          enableHoverEffects={enableHoverEffects}
          intraGraphCompactness={intraGraphCompactness}
          interGraphCompactness={interGraphCompactness}
          duplicateNodeTransparency={duplicateNodeTransparency}
          isZooming={isZooming}
          containerRef={containerRef}
          svgRef={svgRef}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onHoveredNodeChange={setHoveredNodeId}
          onBackgroundClick={handleBackgroundClick}
          onPositionsSave={() => {}} // Not used in this interface
          savedPositions={viewPositions}
          onTreePositionsSave={(treeNodes) => saveTreePositions(treeNodes, intraGraphCompactness, interGraphCompactness)}
          onTreePositionsRestore={restoreTreePositions}
          useTreeRawPositions={useTreeRawPositions}
        />
      )}

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
          onTextStyleChange={(textStyle) => updateNodeTextStyle(editingNode.id, textStyle)}
        />
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        {showSettings && (
          <div 
            className="bg-gray-800 p-4 rounded-lg shadow-xl mb-2 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            {/* View Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                View Mode
              </label>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'force' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('force')}
                  className="flex-1"
                >
                  Force View
                </Button>
                <Button
                  variant={viewMode === 'tree' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('tree')}
                  className="flex-1"
                >
                  Tree View
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Switch between dynamic force layout and hierarchical tree structure.
              </p>
            </div>

            {/* Intra-Graph Compactness */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <label htmlFor="intraGraphCompactness" className="block text-sm font-medium text-gray-300 mb-1">
                Intra-Graph Compactness
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  id="intraGraphCompactness"
                  min="0"
                  max="10"
                  step="0.1"
                  value={intraGraphCompactness}
                  onChange={e => setIntraGraphCompactness(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm text-gray-400 w-8 text-right">{intraGraphCompactness.toFixed(1)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">0 = very wide, 10 = very compact.</p>
            </div>

            {/* Inter-Graph Compactness */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <label htmlFor="interGraphCompactness" className="block text-sm font-medium text-gray-300 mb-1">
                Inter-Graph Compactness
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  id="interGraphCompactness"
                  min="0"
                  max="10"
                  step="0.1"
                  value={interGraphCompactness}
                  onChange={e => setInterGraphCompactness(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm text-gray-400 w-8 text-right">{interGraphCompactness.toFixed(1)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">0 = very tight, 10 = very separated graphs.</p>
            </div>



            <div className="mt-4 pt-4 border-t border-gray-700">
              <label className="flex items-center justify-between text-sm font-medium text-gray-300">
                <span>Tree View: Use raw JSON positions</span>
                <input
                  type="checkbox"
                  checked={useTreeRawPositions}
                  onChange={(e) => setUseTreeRawPositions(e.target.checked)}
                  className="form-checkbox h-5 w-5 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-600"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, Tree View skips layout and uses x/y from the JSON file.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
              <label htmlFor="duplicateTransparency" className="block text-sm font-medium text-gray-300 mb-1">
                Duplicate Node Transparency
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  id="duplicateTransparency"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={duplicateNodeTransparency}
                  onChange={e => setDuplicateNodeTransparency(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm text-gray-400 w-12 text-right">{Math.round((1 - duplicateNodeTransparency) * 100)}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Transparency of nodes with duplicate names. 0% = opaque, 90% = very transparent.</p>
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


