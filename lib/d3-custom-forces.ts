import * as d3 from 'd3';
import type { Node, Link } from './types'; // Import Node and Link types from lib/types.ts

// Custom force for distributing sibling nodes
export function createSiblingDistributionForce(
  initialNodes: Node[],
  initialLinks: Link[],
  strengthVal: number,
  idealLinkDistanceVal: number
): d3.Force<Node, Link> {
  let nodes: Node[];
  let links: Link[]; // All links
  let parentChildLinks: Link[]; // Filtered parent-child links
  let nodesMap: Map<string, Node>;
  let strength = strengthVal;
  let idealLinkDistance = idealLinkDistanceVal;

  function force(alpha: number) {
    if (!nodes || !parentChildLinks || !nodesMap) return;

    const childrenByParent = new Map<string, Node[]>();
    parentChildLinks.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
      const targetNode = typeof link.target === 'string' ? nodesMap.get(link.target) : link.target as Node;
      if (targetNode) {
        if (!childrenByParent.has(sourceId)) {
          childrenByParent.set(sourceId, []);
        }
        childrenByParent.get(sourceId)!.push(targetNode);
      }
    });

    childrenByParent.forEach((children, parentId) => {
      const parentNode = nodesMap.get(parentId);
      if (!parentNode || children.length <= 1 || parentNode.x === undefined || parentNode.y === undefined) {
        return;
      }

      const angleStep = (2 * Math.PI) / children.length;

      children.forEach((child, i) => {
        if (child.x === undefined || child.y === undefined) {
          child.x = parentNode.x! + (Math.random() - 0.5) * 0.1; // Small random offset
          child.y = parentNode.y! + (Math.random() - 0.5) * 0.1; // Small random offset
        }

        const targetX = parentNode.x! + idealLinkDistance * Math.cos(i * angleStep);
        const targetY = parentNode.y! + idealLinkDistance * Math.sin(i * angleStep);

        child.vx = (child.vx || 0) + (targetX - child.x!) * strength * alpha;
        child.vy = (child.vy || 0) + (targetY - child.y!) * strength * alpha;
      });
    });
  }

  force.initialize = (_nodes: Node[], random?: () => number) => {
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
  };

  force.strength = function(_strength?: number) {
    if (_strength === undefined) return strength;
    strength = _strength;
    return force;
  };

  force.links = function(_links?: Link[]) {
    if (_links === undefined) return links;
    links = _links;
    parentChildLinks = links.filter(link => link.type === 'parent-child');
    return force;
  };

  force.nodes = function(_nodes?: Node[]) {
    if (_nodes === undefined) return nodes;
    nodes = _nodes;
    nodesMap = new Map(nodes.map(n => [n.id, n]));
    return force;
  };

  force.distance = function(_distance?: number) {
    if (_distance === undefined) return idealLinkDistance;
    idealLinkDistance = _distance;
    return force;
  };

  links = initialLinks;
  parentChildLinks = initialLinks.filter(link => link.type === 'parent-child');
  if (initialNodes) {
    nodes = initialNodes;
    nodesMap = new Map(initialNodes.map(n => [n.id, n]));
  }

  return force;
} 