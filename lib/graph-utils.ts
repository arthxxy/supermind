import * as d3 from 'd3';
import type { Node, Link, GraphData } from './types';

// Helper function to find connected components (subgraphs)
export function findConnectedComponents(nodes: Node[], links: Link[]): Node[][] {
  const visited = new Set<string>();
  const components: Node[][] = [];
  const adj = new Map<string, string[]>();

  nodes.forEach(node => adj.set(node.id, []));
  links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
    // Add adjacency for all link types (parent-child and friend)
    if (adj.has(sourceId)) adj.get(sourceId)!.push(targetId);
    if (adj.has(targetId)) adj.get(targetId)!.push(sourceId);
  });

  function dfs(nodeId: string, currentComponent: Node[]) {
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      currentComponent.push(node);
    }
    adj.get(nodeId)?.forEach(neighborId => {
      if (!visited.has(neighborId)) {
        dfs(neighborId, currentComponent);
      }
    });
  }

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const currentComponent: Node[] = [];
      dfs(node.id, currentComponent);
      if (currentComponent.length > 0) {
        components.push(currentComponent);
      }
    }
  });

  return components;
}

// Helper function to recalculate levels within a component
export function recalculateLevelsInComponent(
  componentNodeIds: Set<string>,
  allNodes: Node[],
  allLinks: Link[]
): Map<string, number> {
  const newLevels = new Map<string, number>();
  const nodesInComponent = allNodes.filter(n => componentNodeIds.has(n.id));
  const linksInOrToComponent = allLinks.filter(l => {
    const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
    const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
    return componentNodeIds.has(sourceId) || componentNodeIds.has(targetId);
  });

  const adj = new Map<string, string[]>();
  const childrenMap = new Map<string, string[]>();
  const friendsMap = new Map<string, string[]>();
  nodesInComponent.forEach(n => {
    adj.set(n.id, []);
    childrenMap.set(n.id, []);
    friendsMap.set(n.id, []);
  });

  const componentRoots = new Set<string>(nodesInComponent.map(n => n.id));

  linksInOrToComponent.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
    
    if (link.type === 'parent-child') {
      if (componentNodeIds.has(sourceId) && componentNodeIds.has(targetId)) {
        adj.get(targetId)?.push(sourceId);
        childrenMap.get(sourceId)?.push(targetId);
        componentRoots.delete(targetId);
      }
    } else if (link.type === 'friend') {
      if (componentNodeIds.has(sourceId) && componentNodeIds.has(targetId)) {
        friendsMap.get(sourceId)?.push(targetId);
        friendsMap.get(targetId)?.push(sourceId);
      }
    }
  });

  const queue: { nodeId: string; level: number }[] = [];
  componentRoots.forEach(rootId => {
    queue.push({ nodeId: rootId, level: 0 });
    newLevels.set(rootId, 0);
  });

  let head = 0;
  while (head < queue.length) {
    const { nodeId, level } = queue[head++];
    childrenMap.get(nodeId)?.forEach(childId => {
      if (componentNodeIds.has(childId) && !newLevels.has(childId)) {
        newLevels.set(childId, level + 1);
        queue.push({ nodeId: childId, level: level + 1 });
      }
    });
    
    // Process friends - they should maintain the same level
    friendsMap.get(nodeId)?.forEach(friendId => {
      if (componentNodeIds.has(friendId) && !newLevels.has(friendId)) {
        newLevels.set(friendId, level); // Friends are at the same level
        queue.push({ nodeId: friendId, level: level });
      }
    });
  }

  nodesInComponent.forEach(node => {
      if (!newLevels.has(node.id)) {
          newLevels.set(node.id, 0);
      }
  });

  return newLevels;
} 