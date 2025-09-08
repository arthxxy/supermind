import { useState, useEffect, useCallback } from 'react';
import type { Node, Link, GraphData } from '@/lib/types';

const NODE_COLORS = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"];

interface MindMapDataReturn {
  graphData: GraphData;
  setGraphData: React.Dispatch<React.SetStateAction<GraphData>>;
  selectedNode: Node | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<Node | null>>;
  editingNode: Node | null;
  setEditingNode: React.Dispatch<React.SetStateAction<Node | null>>;
  toolbarPosition: { x: number; y: number };
  setToolbarPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  addNode: (parentId: string, nodeName: string) => void;
  deleteNode: (nodeId: string) => void;
  addRelationship: (sourceId: string, command: string, targetName: string) => void;
  updateRelationship: (nodeId: string, oldType: string, newCommand: string, targetName: string) => void;
  deleteRelationship: (nodeId: string, relType: string, targetName: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeName: (nodeId: string, newName: string) => void;
}

export function useMindMapData(
  initialGraphData: GraphData, 
  initialNodeId?: string | null
): MindMapDataReturn {
  const [graphData, setGraphData] = useState<GraphData>(initialGraphData);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });

  // Load initial node if initialNodeId is provided
  useEffect(() => {
    if (initialNodeId) {
      const nodeToSelect = graphData.nodes.find((n: Node) => n.id === initialNodeId);
      if (nodeToSelect) {
        setSelectedNode(nodeToSelect);
      }
    }
  }, [initialNodeId, graphData.nodes]);

  // Effect to update graphData if initialGraphData changes
  useEffect(() => {
    setGraphData(initialGraphData);
    setSelectedNode(null);
    setEditingNode(null);
  }, [initialGraphData]);

  const addNode = useCallback((parentId: string, nodeName: string) => {
    const newNodeId = `node-${Date.now()}`;
    const parentNode = graphData.nodes.find((node: Node) => node.id === parentId);

    if (!parentNode) {
      // Add as a new root node (level 0, no link)
      const newNode: Node = {
        id: newNodeId,
        name: nodeName,
        level: 0,
        color: NODE_COLORS[0],
      };
      setGraphData((prev: GraphData) => ({
        nodes: [...prev.nodes, newNode],
        links: [...prev.links],
      }));
      return;
    }

    const newLevel = parentNode.level + 1;
    const newNode: Node = {
      id: newNodeId,
      name: nodeName,
      level: newLevel,
      color: NODE_COLORS[newLevel % NODE_COLORS.length],
    };

    const newLink: Link = {
      source: parentId,
      target: newNodeId,
      type: "parent-child"
    };

    setGraphData((prev: GraphData) => ({
      nodes: [...prev.nodes, newNode],
      links: [...prev.links, newLink],
    }));
  }, [graphData.nodes, setGraphData]);

  const deleteNode = useCallback((nodeId: string) => {
    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes.filter((node: Node) => node.id !== nodeId),
      links: prev.links.filter((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return sourceId !== nodeId && targetId !== nodeId;
      }),
    }));
    setSelectedNode(null);
    setEditingNode(null);
  }, [setGraphData, setSelectedNode, setEditingNode]);

  const addRelationship = useCallback((sourceId: string, command: string, targetName: string) => {
    // Find existing node with targetName or create new one
    let targetNode = graphData.nodes.find((node: Node) => node.name === targetName);
    
    if (!targetNode) {
      // Create new node
      const newNodeId = `node-${Date.now()}`;
      targetNode = {
        id: newNodeId,
        name: targetName,
        level: 0, // Default level, will be recalculated
        color: NODE_COLORS[0],
      };
      
      setGraphData((prev: GraphData) => ({
        nodes: [...prev.nodes, targetNode!],
        links: [...prev.links],
      }));
    }

    const newLink: Link = {
      source: command === '<' ? targetNode.id : sourceId,
      target: command === '<' ? sourceId : targetNode.id,
      type: command === "friend" ? "friend" : "parent-child"
    };

    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes,
      links: [...prev.links, newLink],
    }));
  }, [graphData.nodes, setGraphData]);

  const updateRelationship = useCallback((nodeId: string, oldType: string, newCommand: string, targetName: string) => {
    setGraphData((prev: GraphData) => {
      // Find the target node
      const targetNode = prev.nodes.find(n => n.name === targetName);
      if (!targetNode) return prev;

      // Remove the old link
      const filteredLinks = prev.links.filter((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        
        return !((sourceId === nodeId && targetId === targetNode.id) ||
                 (targetId === nodeId && sourceId === targetNode.id));
      });

      // Add the new link with correct direction
      const newLink: Link = {
        source: newCommand === '<' ? targetNode.id : nodeId,
        target: newCommand === '<' ? nodeId : targetNode.id,
        type: (newCommand === "friend" ? "friend" : "parent-child") as "parent-child" | "friend"
      };

      return {
        nodes: prev.nodes,
        links: [...filteredLinks, newLink],
      };
    });
  }, [setGraphData]);

  const deleteRelationship = useCallback((nodeId: string, relType: string, targetName: string) => {
    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes,
      links: prev.links.filter((link: Link) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        
        const sourceNode = graphData.nodes.find(n => n.id === sourceId);
        const targetNode = graphData.nodes.find(n => n.id === targetId);
        
        if (!sourceNode || !targetNode) return true;
        
        // Don't delete if this is not the relationship we want to delete
        if ((sourceId === nodeId && targetNode.name === targetName) ||
            (targetId === nodeId && sourceNode.name === targetName)) {
          return false; // Remove this link
        }
        
        return true; // Keep this link
      }),
    }));
  }, [graphData.nodes, setGraphData]);

  const updateNodeContent = useCallback((nodeId: string, content: string) => {
    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes.map((node: Node) => 
        node.id === nodeId ? { ...node, content } : node
      ),
      links: prev.links,
    }));
  }, [setGraphData]);

  const updateNodeName = useCallback((nodeId: string, newName: string) => {
    setGraphData((prev: GraphData) => ({
      nodes: prev.nodes.map((node: Node) => 
        node.id === nodeId ? { ...node, name: newName } : node
      ),
      links: prev.links,
    }));
  }, [setGraphData]);

  return {
    graphData,
    setGraphData,
    selectedNode,
    setSelectedNode,
    editingNode,
    setEditingNode,
    toolbarPosition,
    setToolbarPosition,
    addNode,
    deleteNode,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    updateNodeContent,
    updateNodeName,
  };
} 