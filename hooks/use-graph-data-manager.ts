import { useState, useCallback } from 'react';
import type { Node, Link, GraphData, Relationship } from '@/lib/types';
import { findConnectedComponents, recalculateLevelsInComponent } from '@/lib/graph-utils';

export interface GraphDataManager {
  graphData: GraphData;
  setGraphData: React.Dispatch<React.SetStateAction<GraphData>>;
  addNode: (parentId: string, nodeName: string) => void;
  deleteNode: (nodeId: string) => void;
  addRelationship: (sourceId: string, command: string, targetName: string) => void;
  updateRelationship: (nodeId: string, oldType: string, newCommand: string, targetName: string) => void;
  deleteRelationship: (nodeId: string, relType: string, targetName: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeName: (nodeId: string, newName: string) => void;
  getNodeRelationships: (nodeId: string) => Relationship[];
}

export function useGraphDataManager(initialGraphData: GraphData): GraphDataManager {
  const [graphData, setGraphData] = useState<GraphData>(initialGraphData);

  const getNodeRelationships = useCallback((nodeId: string): Relationship[] => {
    const relationships: Relationship[] = [];
    for (const link of graphData.links) {
      const sourceNode = graphData.nodes.find(n => n.id === (typeof link.source === 'string' ? link.source : (link.source as Node).id));
      const targetNode = graphData.nodes.find(n => n.id === (typeof link.target === 'string' ? link.target : (link.target as Node).id));
      if (!sourceNode || !targetNode) continue;

      if (sourceNode.id === nodeId) {
        relationships.push({
          type: link.type === 'parent-child' ? 'child' : 'friend',
          targetId: targetNode.id,
          targetName: targetNode.name
        } as Relationship);
      } else if (targetNode.id === nodeId) {
        relationships.push({
          type: link.type === 'parent-child' ? 'parent' : 'friend',
          targetId: sourceNode.id,
          targetName: sourceNode.name
        } as Relationship);
      }
    }
    return relationships;
  }, [graphData]);

  const addNode = useCallback((parentId: string, nodeName: string) => {
    const newNodeId = `node-${Date.now()}`;
    const parentNode = graphData.nodes.find(node => node.id === parentId);
    const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"];
    let newNode: Node;

    if (!parentNode) {
      newNode = {
        id: newNodeId,
        name: nodeName,
        level: 0,
        color: colors[0],
      };
      setGraphData(prev => ({
        nodes: [...prev.nodes, newNode],
        links: prev.links, // No new link for a root node
      }));
    } else {
      const newLevel = parentNode.level + 1;
      newNode = {
        id: newNodeId,
        name: nodeName,
        level: newLevel,
        color: colors[newLevel % colors.length],
      };
      const newLink: Link = {
        source: parentId,
        target: newNodeId,
        type: "parent-child",
      };
      setGraphData(prev => ({
        nodes: [...prev.nodes, newNode],
        links: [...prev.links, newLink],
      }));
    }
  }, [graphData.nodes]); // Dependency on graphData.nodes for parentNode lookup

  const deleteNode = useCallback((nodeId: string) => {
    setGraphData(prev => ({
      nodes: prev.nodes.filter(node => node.id !== nodeId),
      links: prev.links.filter(
        link =>
          (typeof link.source === 'string' ? link.source !== nodeId : (link.source as Node).id !== nodeId) &&
          (typeof link.target === 'string' ? link.target !== nodeId : (link.target as Node).id !== nodeId)
      ),
    }));
  }, []);

  const addRelationship = useCallback((sourceId: string, command: string, targetName: string) => {
    setGraphData(prevGraphData => {
      const sourceNode = prevGraphData.nodes.find(node => node.id === sourceId);
      let targetNode = prevGraphData.nodes.find(node => node.name === targetName);
      if (!sourceNode) return prevGraphData;

      let newNodes = [...prevGraphData.nodes];
      let newLinks = [...prevGraphData.links];
      let createdNewNode = false;
      let newTargetNodeId = targetNode?.id;

      if (!targetNode) {
        newTargetNodeId = `node-${Date.now()}`;
        const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff"];
        let newLevel = sourceNode.level; // Default: same level as source for friends
        
        // Adjust level based on command
        if (command === '>') {
          newLevel = sourceNode.level + 1; // Child is one level deeper
        } else if (command === '<') {
          newLevel = Math.max(0, sourceNode.level - 1); // Parent is one level up
        } 
        // For '=' (friend), keep the same level as source

        const newNodeToAdd: Node = {
          id: newTargetNodeId,
          name: targetName,
          level: Math.max(0, newLevel),
          color: colors[Math.max(0, newLevel) % colors.length],
        };
        newNodes.push(newNodeToAdd);
        targetNode = newNodeToAdd;
        createdNewNode = true;
      }

      const newLink: Link = {
        source: command === '<' ? newTargetNodeId! : sourceId,
        target: command === '<' ? sourceId : newTargetNodeId!,
        type: command === '=' ? "friend" : "parent-child",
      };
      newLinks.push(newLink);

      // Always recalculate levels for new nodes, regardless of relationship type
      if (createdNewNode) {
        const tempLinksForComponentFinding = [...prevGraphData.links, newLink];
        const allComponents = findConnectedComponents(newNodes, tempLinksForComponentFinding);
        let targetComponentNodeIds: Set<string> | null = null;
        for (const comp of allComponents) {
          const compIds = new Set(comp.map(n => n.id));
          if (compIds.has(sourceId) || compIds.has(newTargetNodeId!)) {
            targetComponentNodeIds = compIds;
            break;
          }
        }
        if (targetComponentNodeIds) {
          const newLevelsMap = recalculateLevelsInComponent(targetComponentNodeIds, newNodes, newLinks);
          newNodes = newNodes.map(n => {
            if (newLevelsMap.has(n.id)) {
              const newLvl = newLevelsMap.get(n.id)!;
              return { ...n, level: newLvl };
            }
            return n;
          });
        }
      }
      return { nodes: newNodes, links: newLinks };
    });
  }, []);

  const updateRelationship = useCallback((nodeId: string, oldType: string, newCommand: string, targetName: string) => {
    setGraphData(prevGraphData => {
      const oldRelationships = getNodeRelationships(nodeId); // Needs to use prevGraphData
      const oldRelationship = oldRelationships.find(r =>
        r.type === oldType &&
        prevGraphData.nodes.find(n => n.id === r.targetId)?.name === targetName
      );
      if (!oldRelationship) return prevGraphData;

      let newLinks = prevGraphData.links.filter(link => {
        const sourceIdVal = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetIdVal = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        return !(
          (sourceIdVal === nodeId && targetIdVal === oldRelationship.targetId) ||
          (targetIdVal === nodeId && sourceIdVal === oldRelationship.targetId)
        );
      });

      const targetNodeObj = prevGraphData.nodes.find(n => n.id === oldRelationship.targetId);
      if (!targetNodeObj) return { ...prevGraphData, links: newLinks }; // Return with removed link if target not found

      const newLinkToAdd: Link = {
        source: newCommand === '<' ? targetNodeObj.id : nodeId,
        target: newCommand === '<' ? nodeId : targetNodeObj.id,
        type: newCommand === '=' ? "friend" : "parent-child",
      };
      newLinks.push(newLinkToAdd);
      
      // Always recalculate levels when changing relationship types
      let newNodes = [...prevGraphData.nodes];
      const tempLinksForComponentFinding = [...newLinks]; // Use the updated links
      const allComponents = findConnectedComponents(newNodes, tempLinksForComponentFinding);
      let targetComponentNodeIds: Set<string> | null = null;
      
      for (const comp of allComponents) {
        const compIds = new Set(comp.map(n => n.id));
        if (compIds.has(nodeId) || compIds.has(targetNodeObj.id)) {
          targetComponentNodeIds = compIds;
          break;
        }
      }
      
      if (targetComponentNodeIds) {
        const newLevelsMap = recalculateLevelsInComponent(targetComponentNodeIds, newNodes, newLinks);
        newNodes = newNodes.map(n => {
          if (newLevelsMap.has(n.id)) {
            const newLvl = newLevelsMap.get(n.id)!;
            return { ...n, level: newLvl };
          }
          return n;
        });
      }
      
      return { nodes: newNodes, links: newLinks };
    });
  }, [getNodeRelationships]); // Added getNodeRelationships to dependencies

  const deleteRelationship = useCallback((nodeId: string, relType: string, targetName: string) => {
    setGraphData(prev => {
      const targetNode = prev.nodes.find(n => n.name === targetName);
      if (!targetNode) return prev;
      const filteredLinks = prev.links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
        if (relType === 'child') {
          return !(sourceId === nodeId && targetId === targetNode.id && link.type === 'parent-child');
        }
        if (relType === 'parent') {
          return !(sourceId === targetNode.id && targetId === nodeId && link.type === 'parent-child');
        }
        if (relType === 'friend') {
          return !(((sourceId === nodeId && targetId === targetNode.id) || (sourceId === targetNode.id && targetId === nodeId)) && link.type === 'friend');
        }
        return true;
      });
      return { ...prev, links: filteredLinks };
    });
  }, []);

  const updateNodeContent = useCallback((nodeId: string, content: string) => {
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, content } : node
      ),
    }));
  }, []);

  const updateNodeName = useCallback((nodeId: string, newName: string) => {
    // This function in mind-map.tsx also handled updating simulation nodes and links.
    // For now, this hook will only update the graphData state.
    // The simulation update will need to be handled in the main component or useMindMapSimulation hook.
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === nodeId ? { ...node, name: newName } : node
      ),
      // Links are not directly changed by name update, but their references in D3 might need update if source/target objects are recreated.
    }));
  }, []);

  return {
    graphData,
    setGraphData,
    addNode,
    deleteNode,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    updateNodeContent,
    updateNodeName,
    getNodeRelationships,
  };
} 