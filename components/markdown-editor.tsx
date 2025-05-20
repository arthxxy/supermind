"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronUp, ChevronDown } from "lucide-react"

interface Relationship {
  type: "parent" | "child" | "friend"
  targetId: string
  targetName: string
}

interface Node {
  id: string
  name: string
  level: number
  content?: string
}

interface MarkdownEditorProps {
  node: Node
  relationships: Relationship[]
  allNodes: Node[]
  onContentChange: (content: string) => void
  onAddRelationship: (command: string, targetName: string) => void
  onUpdateRelationship: (oldType: string, newCommand: string, targetName: string) => void
  onNameChange: (newName: string) => void
  onClose: () => void
  onDeleteRelationship: (type: string, targetName: string) => void
}

export function MarkdownEditor({
  node,
  relationships,
  allNodes,
  onContentChange,
  onAddRelationship,
  onUpdateRelationship,
  onNameChange,
  onClose,
  onDeleteRelationship,
}: MarkdownEditorProps) {
  const [isExistingRelationshipsVisible, setIsExistingRelationshipsVisible] = useState(false)
  const [content, setContent] = useState(node.content || "")
  const [newRelation, setNewRelation] = useState("")
  const [nodeName, setNodeName] = useState(node.name)
  const newRelationInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setContent(node.content || "")
    setNodeName(node.name)
    if (newRelationInputRef.current) {
      newRelationInputRef.current.focus()
    }
  }, [node])

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    onContentChange(newContent)
  }

  const handleNameChange = (newName: string) => {
    setNodeName(newName)
    onNameChange(newName)
  }

  const handleNewRelation = () => {
    const command = newRelation.charAt(0)
    const name = newRelation.slice(1).trim()

    if ((command === ">" || command === "<" || command === "=") && name) {
      onAddRelationship(command, name)
      setNewRelation("")
    }
  }

  const handleRelationshipUpdate = (oldType: string, index: number, newValue: string) => {
    const command = newValue.charAt(0)
    const name = newValue.slice(1).trim()
    
    if (newValue === "") {
      onDeleteRelationship(oldType, relationships[index].targetName)
    } else if ((command === ">" || command === "<" || command === "=") && name) {
      onUpdateRelationship(oldType, command, name)
    }
  }

  const getRelationshipSymbol = (type: string) => {
    switch (type) {
      case "child": return ">"
      case "parent": return "<"
      case "friend": return "="
      default: return ""
    }
  }

  // Filter recommendations for relationship input
  const command = newRelation.charAt(0)
  const namePart = newRelation.slice(1).trim().toLowerCase()
  const showRecommendations = (command === '>' || command === '<' || command === '=') && namePart.length > 0
  const recommendations = showRecommendations
    ? allNodes
        .filter(n => n.name.toLowerCase().includes(namePart))
        .slice(0, 7)
    : []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 rounded-lg shadow-lg w-full max-w-2xl border border-zinc-700 flex flex-col">
        <div className="p-4 flex items-center justify-between border-b border-zinc-700">
          <Input
            value={nodeName}
            onChange={(e) => handleNameChange(e.target.value)}
            className="text-lg font-semibold text-white bg-transparent border-0 hover:bg-zinc-800 focus:bg-zinc-800 flex-grow"
          />
          <div className="flex gap-2 items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExistingRelationshipsVisible(!isExistingRelationshipsVisible)}
              className="text-white hover:text-white hover:bg-zinc-800 p-1.5"
            >
              {isExistingRelationshipsVisible ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="text-white hover:text-white hover:bg-zinc-800 p-1.5"
            >
              ✕
            </Button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2 flex-grow overflow-y-auto">
          <div className="relative">
            <Input
              ref={newRelationInputRef}
              autoFocus
              value={newRelation}
              onChange={(e) => setNewRelation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleNewRelation()
                }
              }}
              placeholder="Type >, <, or = followed by note name"
              className="bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 rounded-md px-3 h-10 w-full"
            />
            {showRecommendations && recommendations.length > 0 && (
              <div className="absolute z-20 bg-zinc-900 border border-zinc-700 rounded shadow max-h-48 overflow-y-auto w-full mt-1">
                {recommendations.map((n) => (
                  <div
                    key={n.id}
                    className="px-3 py-1.5 cursor-pointer hover:bg-zinc-700 text-white text-sm"
                    onMouseDown={() => {
                      setNewRelation(command + n.name)
                      onAddRelationship(command, n.name)
                      setNewRelation("")
                    }}
                  >
                    {n.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isExistingRelationshipsVisible && (
            <div className="border border-zinc-700 rounded-md bg-zinc-800 overflow-hidden max-h-40 overflow-y-auto">
              {relationships.length > 0 ? (
                relationships.map((rel, index) => (
                  <Input
                    key={`${rel.type}-${rel.targetId}-${index}`}
                    defaultValue={`${getRelationshipSymbol(rel.type)}${rel.targetName}`}
                    onChange={(e) => handleRelationshipUpdate(rel.type, index, e.target.value)}
                    className="bg-transparent border-0 border-b border-zinc-700 last:border-b-0 text-white text-sm h-9 px-3 hover:bg-zinc-700 rounded-none focus:ring-0"
                  />
                ))
              ) : (
                <p className="text-zinc-400 text-sm px-3 py-2">No relationships yet.</p>
              )}
            </div>
          )}

          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write your note content here..."
            className="min-h-[200px] flex-grow bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 rounded-md"
          />
        </div>
      </div>
    </div>
  )
} 