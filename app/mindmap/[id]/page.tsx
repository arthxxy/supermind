"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import MindMap from "@/components/mind-map"

interface PageProps {
  params: {
    id: string
  }
}

export default function MindMapPage({ params }: PageProps) {
  const searchParams = useSearchParams()
  const nodeId = searchParams.get("nodeId")
  
  useEffect(() => {
    if (nodeId) {
      // TODO: Implement zoom to node functionality
      console.log("Should zoom to node:", nodeId)
    }
  }, [nodeId])

  return (
    <main className="w-screen h-screen min-h-0 min-w-0 overflow-hidden">
      <MindMap initialNodeId={nodeId} mapId={params.id} />
    </main>
  )
} 