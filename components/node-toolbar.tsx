"use client"

import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface Node {
  id: string
  name: string
  level: number
  color?: string
  x?: number
  y?: number
}

interface NodeToolbarProps {
  node: Node
  position: { x: number; y: number }
  onDelete: () => void
  nodes: Node[]
}

export function NodeToolbar({
  node,
  position,
  onDelete,
  nodes,
}: NodeToolbarProps) {
  return (
    <div
      className="absolute bg-white shadow-lg rounded-lg p-3 z-10 flex flex-col gap-2 min-w-[100px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%) translateY(-10px)",
      }}
    >
      <div className="text-sm font-medium mb-1">
        {node.name}
      </div>

      <Button size="sm" variant="destructive" onClick={onDelete} className="flex-1">
        <Trash2 size={14} className="mr-1" /> Delete
      </Button>
    </div>
  )
}
