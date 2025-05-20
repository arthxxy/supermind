"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import MindMap from "@/components/mind-map"

interface Node {
  id: string
  name: string
  level: number
  color: string
  content?: string
}

interface Link {
  source: string
  target: string
  type: "parent-child" | "friend"
}

interface GraphData {
  nodes: Node[]
  links: Link[]
}

const quickNoteData: GraphData = {
  nodes: [
    { 
      id: "root", 
      name: "Quick Note", 
      level: 0, 
      color: "#ff6b6b",
      content: "" 
    }
  ],
  links: []
}

const newMindMapData: GraphData = {
  nodes: [
    { 
      id: "root", 
      name: "Main Concept", 
      level: 0, 
      color: "#ff6b6b" 
    },
    { 
      id: "child1", 
      name: "Sub-concept 1", 
      level: 1, 
      color: "#48dbfb" 
    },
    { 
      id: "child2", 
      name: "Sub-concept 2", 
      level: 1, 
      color: "#48dbfb" 
    }
  ],
  links: [
    { source: "root", target: "child1", type: "parent-child" },
    { source: "root", target: "child2", type: "parent-child" }
  ]
}

export default function NewMindMapPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get("type")

  useEffect(() => {
    console.log("Page type:", type) // Debug log
  }, [type])

  const initialData = type === "quick-note" ? quickNoteData : newMindMapData

  return (
    <main className="w-screen h-screen min-h-0 min-w-0 overflow-hidden">
      <MindMap initialData={initialData} />
    </main>
  )
} 