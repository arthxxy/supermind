import { useState, useCallback } from 'react';
import type { Node } from '@/lib/types';
import type { ViewPositions, TreeNode } from '@/components/views/shared-types';

export function useViewPositions() {
  const [viewPositions, setViewPositions] = useState<ViewPositions>({
    force: new Map(),
    tree: new Map(),
    savedCompactness: undefined
  });

  // Save current positions to view-specific storage
  const saveForcePositions = useCallback((nodes: Node[]) => {
    const forcePositions = new Map<string, { x: number; y: number; fx?: number | null; fy?: number | null }>();
    nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        forcePositions.set(node.id, {
          x: node.x,
          y: node.y,
          fx: node.fx || null,
          fy: node.fy || null
        });
      }
    });
    setViewPositions(prev => ({ ...prev, force: forcePositions }));
  }, []);

  const saveTreePositions = useCallback((treeNodes: TreeNode[], intraGraphCompactness: number, interGraphCompactness: number) => {
    const treePositions = new Map<string, { x: number; y: number }>();
    treeNodes.forEach(treeNode => {
      if (treeNode.x !== undefined && treeNode.y !== undefined) {
        treePositions.set(treeNode.id, {
          x: treeNode.x,
          y: treeNode.y
        });
      }
    });
    setViewPositions(prev => ({ 
      ...prev, 
      tree: treePositions,
      savedCompactness: {
        intraGraph: intraGraphCompactness,
        interGraph: interGraphCompactness
      }
    }));
  }, []);

  // Restore positions from view-specific storage
  const restoreForcePositions = useCallback((nodes: Node[]) => {
    const savedPositions = viewPositions.force;
    nodes.forEach(node => {
      const saved = savedPositions.get(node.id);
      if (saved) {
        node.x = saved.x;
        node.y = saved.y;
        node.fx = saved.fx;
        node.fy = saved.fy;
      }
    });
  }, [viewPositions.force]);

  const restoreTreePositions = useCallback((treeNodes: TreeNode[]) => {
    const savedPositions = viewPositions.tree;
    treeNodes.forEach(treeNode => {
      const saved = savedPositions.get(treeNode.id);
      if (saved) {
        treeNode.x = saved.x;
        treeNode.y = saved.y;
      }
    });
  }, [viewPositions.tree]);

  // Check if compactness values have changed since last save
  const hasCompactnessChanged = useCallback((intraGraphCompactness: number, interGraphCompactness: number) => {
    const saved = viewPositions.savedCompactness;
    if (!saved) return false; // No saved compactness, so no change
    return saved.intraGraph !== intraGraphCompactness || saved.interGraph !== interGraphCompactness;
  }, [viewPositions.savedCompactness]);

  // Clear tree positions when compactness changes
  const clearTreePositions = useCallback(() => {
    setViewPositions(prev => ({ 
      ...prev, 
      tree: new Map(),
      savedCompactness: undefined
    }));
  }, []);

  // Import tree positions from JSON (supports exact Tree View replay including duplicates)
  const importTreePositions = useCallback((raw: any) => {
    try {
      const treePositions = new Map<string, { x: number; y: number }>();
      if (Array.isArray(raw)) {
        raw.forEach((entry: any) => {
          if (entry && typeof entry.id === 'string' && typeof entry.x === 'number' && typeof entry.y === 'number') {
            treePositions.set(entry.id, { x: entry.x, y: entry.y });
          }
        });
      } else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((id: string) => {
          const p = raw[id];
          if (p && typeof p.x === 'number' && typeof p.y === 'number') {
            treePositions.set(id, { x: p.x, y: p.y });
          }
        });
      }
      if (treePositions.size > 0) {
        setViewPositions(prev => ({ ...prev, tree: treePositions }));
      }
    } catch {}
  }, []);

  return {
    viewPositions,
    saveForcePositions,
    saveTreePositions,
    restoreForcePositions,
    restoreTreePositions,
    hasCompactnessChanged,
    clearTreePositions,
    importTreePositions,
  };
}


