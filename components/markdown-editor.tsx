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
  textStyle?: {
    fontSize?: number;
    isBold?: boolean;
    isItalic?: boolean;
    isUnderline?: boolean;
    isStrikethrough?: boolean;
  };
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
  onTextStyleChange?: (textStyle: Node['textStyle']) => void
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
  onTextStyleChange,
}: MarkdownEditorProps) {
  const [isExistingRelationshipsVisible, setIsExistingRelationshipsVisible] = useState(false)
  const [content, setContent] = useState(node.content || "")
  const [newRelation, setNewRelation] = useState("")
  const [nodeName, setNodeName] = useState(node.name)
  const [textStyle, setTextStyle] = useState<Required<NonNullable<Node['textStyle']>>>({
    fontSize: node.textStyle?.fontSize ?? 14,
    isBold: node.textStyle?.isBold ?? false,
    isItalic: node.textStyle?.isItalic ?? false,
    isUnderline: node.textStyle?.isUnderline ?? false,
    isStrikethrough: node.textStyle?.isStrikethrough ?? false,
  })
  const [selectionStart, setSelectionStart] = useState<number>(0)
  const [selectionEnd, setSelectionEnd] = useState<number>(0)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const newRelationInputRef = useRef<HTMLInputElement>(null)
  const contentTextareaRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef<boolean>(false) // Flag to prevent cursor jumping

  // Funktion zum Speichern der Cursor-Position
  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && contentTextareaRef.current) {
      const range = selection.getRangeAt(0)
      const preCaretRange = range.cloneRange()
      preCaretRange.selectNodeContents(contentTextareaRef.current)
      preCaretRange.setEnd(range.startContainer, range.startOffset)
      return {
        start: preCaretRange.toString().length,
        end: preCaretRange.toString().length + range.toString().length
      }
    }
    return null
  }

  // Funktion zum Wiederherstellen der Cursor-Position
  const restoreSelection = (savedSelection: { start: number; end: number }) => {
    if (!contentTextareaRef.current) return
    
    const selection = window.getSelection()
    if (!selection) return
    
    const range = document.createRange()
    let charIndex = 0
    let nodeStack: ChildNode[] = [contentTextareaRef.current as ChildNode]
    let node: ChildNode | undefined
    let foundStart = false
    let foundEnd = false

    while (!foundEnd && (node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + (node.textContent?.length || 0)
        if (!foundStart && savedSelection.start >= charIndex && savedSelection.start <= nextCharIndex) {
          range.setStart(node, savedSelection.start - charIndex)
          foundStart = true
        }
        if (foundStart && savedSelection.end >= charIndex && savedSelection.end <= nextCharIndex) {
          range.setEnd(node, savedSelection.end - charIndex)
          foundEnd = true
        }
        charIndex = nextCharIndex
      } else {
        let i = node.childNodes.length
        while (i--) {
          nodeStack.push(node.childNodes[i])
        }
      }
    }

    if (foundStart) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  // Funktion zum Analysieren des Texts und Extrahieren der Formatierung
  const analyzeTextFormatting = (text: string): Required<NonNullable<Node['textStyle']>> => {
    return {
      fontSize: textStyle?.fontSize ?? 14,
      isBold: text.includes('**'),
      isItalic: text.includes('_') && !text.includes('__'),
      isUnderline: text.includes('__'),
      isStrikethrough: text.includes('~~'),
    }
  }

  // Funktion zum Rendern von Markdown zu HTML
  const renderMarkdown = (text: string): string => {
    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Convert line breaks
      .replace(/\n/g, '<br>')
      // Bold: **text** -> <strong>text</strong>
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic: _text_ -> <em>text</em>
      .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
      // Underline: __text__ -> <u>text</u>
      .replace(/__([^_]+)__/g, '<u>$1</u>')
      // Strikethrough: ~~text~~ -> <s>text</s>
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    
    return html
  }

  useEffect(() => {
    setContent(node.content || "")
    setNodeName(node.name)
    
    // Analysiere den Namen für Markdown-Formatierung und kombiniere mit textStyle
    const analyzedStyle = analyzeTextFormatting(node.name)
    const combinedStyle = {
      fontSize: node.textStyle?.fontSize ?? 14,
      isBold: node.textStyle?.isBold ?? analyzedStyle.isBold,
      isItalic: node.textStyle?.isItalic ?? analyzedStyle.isItalic,
      isUnderline: node.textStyle?.isUnderline ?? analyzedStyle.isUnderline,
      isStrikethrough: node.textStyle?.isStrikethrough ?? analyzedStyle.isStrikethrough,
    }
    setTextStyle(combinedStyle)
  }, [node])

  // Wenn sich der Markdown-Inhalt ändert (z. B. beim Öffnen eines bestehenden Nodes),
  // rendere ihn als HTML im contentEditable-Div.
  useEffect(() => {
    if (contentTextareaRef.current && !isInternalUpdate.current) {
      const currentHtml = contentTextareaRef.current.innerHTML;
      const desiredHtml = renderMarkdown(content);
      if (currentHtml !== desiredHtml) {
        // Speichere Cursor-Position vor dem Update
        const savedSelection = saveSelection();
        
        contentTextareaRef.current.innerHTML = desiredHtml || '<span class="text-zinc-400 italic">Write your note content here...</span>';
        
        // Stelle Cursor-Position wieder her nach dem Update
        if (savedSelection) {
          // Verwende setTimeout, um sicherzustellen, dass das DOM aktualisiert wurde
          setTimeout(() => {
            restoreSelection(savedSelection);
          }, 0);
        }
      }
    }
    // Reset das interne Update Flag
    isInternalUpdate.current = false;
  }, [content]);

  useEffect(() => {
    if (newRelationInputRef.current) {
      newRelationInputRef.current.focus()
    }
  }, [])

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    onContentChange(newContent)
  }

  const handleNameChange = (newName: string) => {
    setNodeName(newName)
    onNameChange(newName)
  }

  const handleSelectionChange = () => {
    if (nameInputRef.current) {
      const start = nameInputRef.current.selectionStart ?? 0
      const end = nameInputRef.current.selectionEnd ?? 0
      setSelectionStart(start)
      setSelectionEnd(end)
    }
  }

  const handleTextStyleChange = (updates?: Partial<Node['textStyle']>) => {
    if (!updates || !contentTextareaRef.current) return;

    // Speichere Cursor-Position vor Änderungen
    const savedSelection = saveSelection();

    // Focus auf die Editierfläche setzen
    contentTextareaRef.current.focus();

    const exec = (cmd: string) => document.execCommand(cmd, false);

    if (Object.prototype.hasOwnProperty.call(updates, 'isBold')) exec('bold');
    if (Object.prototype.hasOwnProperty.call(updates, 'isItalic')) exec('italic');
    if (Object.prototype.hasOwnProperty.call(updates, 'isUnderline')) exec('underline');
    if (Object.prototype.hasOwnProperty.call(updates, 'isStrikethrough')) exec('strikeThrough');

    // Fontgröße – nur Editor-State, kein execCommand (Browser nutzt 1-7). Wir stellen div-Style um.
    if (updates.fontSize !== undefined) {
      const newStyle = { ...textStyle, fontSize: updates.fontSize } as Required<NonNullable<Node['textStyle']>>;
      setTextStyle(newStyle);
      onTextStyleChange?.(newStyle);
      contentTextareaRef.current.style.fontSize = `${updates.fontSize}px`;
    }

    // Nach der Änderung HTML -> Markdown synchronisieren
    isInternalUpdate.current = true; // Markiere als internes Update
    const html = contentTextareaRef.current.innerHTML;
    const markdown = htmlToMarkdown(html);
    handleContentChange(markdown);

    // Stelle Cursor-Position wieder her
    if (savedSelection) {
      setTimeout(() => {
        restoreSelection(savedSelection);
      }, 0);
    }
  }



  const handleNewRelation = () => {
    const command = newRelation.charAt(0)
    const name = newRelation.slice(1).trim()

    if ((command === ">" || command === "<" || command === "=") && name) {
      onAddRelationship(command, name)
      setNewRelation("")
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission
    handleNewRelation();
  };

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="fixed inset-4 bg-zinc-900 rounded-lg shadow-2xl border border-zinc-700 flex flex-col overflow-hidden z-50 md:inset-8 lg:inset-12">
        <div className="flex flex-col p-4 border-b border-zinc-700 gap-2">
          <Input
            ref={nameInputRef}
            value={nodeName}
            onChange={(e) => handleNameChange(e.target.value)}
            onSelect={handleSelectionChange}
            onMouseUp={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 rounded-md px-3 h-10 w-64"
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="8"
                max="32"
                value={textStyle.fontSize}
                onChange={(e) => {
                  const newSize = parseInt(e.target.value)
                  if (!isNaN(newSize) && newSize >= 8 && newSize <= 32) {
                    handleTextStyleChange({ fontSize: newSize })
                  }
                }}
                className="w-16 bg-zinc-800 border-zinc-700 text-white"
              />
              <Button
                size="icon"
                variant="ghost"
                onMouseDown={(e) => {
                  e.preventDefault() // Verhindert, dass der Focus verloren geht
                  handleTextStyleChange({ isBold: true })
                }}
                className="h-8 w-8 font-bold"
              >
                B
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onMouseDown={(e) => {
                  e.preventDefault() // Verhindert, dass der Focus verloren geht
                  handleTextStyleChange({ isItalic: true })
                }}
                className="h-8 w-8 italic"
              >
                I
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onMouseDown={(e) => {
                  e.preventDefault() // Verhindert, dass der Focus verloren geht
                  handleTextStyleChange({ isUnderline: true })
                }}
                className="h-8 w-8 underline"
              >
                U
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onMouseDown={(e) => {
                  e.preventDefault() // Verhindert, dass der Focus verloren geht
                  handleTextStyleChange({ isStrikethrough: true })
                }}
                className="h-8 w-8 line-through"
              >
                S
              </Button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExistingRelationshipsVisible(!isExistingRelationshipsVisible)}
                className="text-zinc-400 hover:text-white"
              >
                {isExistingRelationshipsVisible ? "Hide" : "Show"} Relationships
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
                Close
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2 flex-grow overflow-y-auto">
          <div className="relative">
            <form onSubmit={handleFormSubmit}>
              <Input
                ref={newRelationInputRef}
                value={newRelation}
                onChange={(e) => setNewRelation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleNewRelation();
                  }
                }}
                placeholder="Type >, <, or = followed by note name"
                className="bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-400 rounded-md px-3 h-10 w-full"
              />
              <button type="submit" style={{ display: 'none' }} aria-hidden="true" />
            </form>
            {showRecommendations && recommendations.length > 0 && (
              <div className="absolute z-20 bg-zinc-900 border border-zinc-700 rounded shadow max-h-48 overflow-y-auto w-full mt-1">
                {recommendations.map((n) => (
                  <div
                    key={n.id}
                    className="px-3 py-1.5 cursor-pointer hover:bg-zinc-700 text-white text-sm"
                    onMouseDown={() => {
                      setNewRelation(command + n.name);
                      onAddRelationship(command, n.name);
                      setNewRelation("");
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

          <div className="flex gap-2 flex-grow">
            <div className="flex-1 flex flex-col relative">
              {/* Editable preview */}
              <div
                ref={contentTextareaRef as any}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  if (!contentTextareaRef.current) return;
                  // Setze Flag, dass dies ein internes Update ist
                  isInternalUpdate.current = true;
                  const html = contentTextareaRef.current.innerHTML;
                  const markdown = htmlToMarkdown(html);
                  handleContentChange(markdown);
                }}
                className="min-h-[200px] flex-grow bg-zinc-700 border border-zinc-600 text-white rounded-md p-3 overflow-auto focus:outline-none"
                style={{ fontSize: `${textStyle.fontSize}px`, lineHeight: '1.5' }}
              >
                {/* initial content will be set via useEffect */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 

// ---------- helper functions (outside component) ----------

function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<br\s*\/?>(\s*)/gi, '\n');
  md = md.replace(/&nbsp;/gi, ' ');
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '_$1_');
  md = md.replace(/<i>(.*?)<\/i>/gi, '_$1_');
  md = md.replace(/<u>(.*?)<\/u>/gi, '__$1__');
  md = md.replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~');
  md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');
  // Handle inline styled spans
  md = md.replace(/<span[^>]*style="[^"]*font-weight:\s*bold[^">]*"[^>]*>(.*?)<\/span>/gi, '**$1**');
  md = md.replace(/<span[^>]*style="[^"]*font-style:\s*italic[^">]*"[^>]*>(.*?)<\/span>/gi, '_$1_');
  md = md.replace(/<span[^>]*style="[^"]*text-decoration:\s*underline[^">]*"[^>]*>(.*?)<\/span>/gi, '__$1__');
  md = md.replace(/<span[^>]*style="[^"]*text-decoration:\s*line-through[^">]*"[^>]*>(.*?)<\/span>/gi, '~~$1~~');
  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');
  return md;
} 