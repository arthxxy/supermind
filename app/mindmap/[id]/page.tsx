"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import MindMapTree from "@/components/mind-map-tree"

// @ts-ignore
export default function MindMapPage({ params }: { params: { id: string } }): JSX.Element {
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
      <MindMapTree initialNodeId={nodeId} mapId={params.id} />
    </main>
  )
} 