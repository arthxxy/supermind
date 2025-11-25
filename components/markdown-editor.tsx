"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { List } from "lucide-react"
import type { Node, Section, Relationship } from "@/lib/types"

// ---------- Heading detection patterns ----------
// Matches numbered headings like: # 1. Title, ## 1.1 Title, ### 2.3.1 Title
const NUMBERED_HEADING_REGEX = /^(#{1,6})\s+(\d+(?:\.\d+)*\.?)\s+(.+)$/

interface ParsedHeading {
  level: number           // 1-6 based on # count
  number: string          // "1.", "1.1", "2.3.1" etc.
  title: string           // The heading text
  fullLine: string        // Original markdown line
  lineIndex: number       // Line index in content
  isCollapsed: boolean
  id: string
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
  onSectionsChange?: (sections: Section[]) => void
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
  onSectionsChange,
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
  const [showSectionLevels, setShowSectionLevels] = useState<boolean>(false)
  const [sections, setSections] = useState<Section[]>(node.sections || [])
  // Use a Map to store collapsed state by heading number (stable identifier)
  const [collapsedHeadings, setCollapsedHeadings] = useState<Map<string, boolean>>(() => {
    // Initialize from node.sections
    const map = new Map<string, boolean>()
    if (node.sections) {
      node.sections.forEach(s => {
        if (s.isCollapsed) {
          map.set(s.id, true)
        }
      })
    }
    return map
  })
  const nameInputRef = useRef<HTMLInputElement>(null)
  const newRelationInputRef = useRef<HTMLInputElement>(null)
  const contentTextareaRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef<boolean>(false)

  // ---------- Helper functions ----------

  // Generate stable ID from heading number
  const getHeadingId = (number: string): string => {
    return `heading-${number.replace(/\./g, '-').replace(/-$/, '')}`
  }

  // Escape HTML special characters
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    let result = text
    result = result.replace(/&lt;/gi, '<')
    result = result.replace(/&gt;/gi, '>')
    result = result.replace(/&quot;/gi, '"')
    result = result.replace(/&#39;|&apos;/gi, "'")
    result = result.replace(/&nbsp;/gi, ' ')
    result = result.replace(/&amp;/gi, '&')
    return result
  }

  // ---------- Parsing functions ----------

  // Parse all numbered headings from markdown content
  const parseNumberedHeadings = useCallback((markdown: string): ParsedHeading[] => {
    const lines = markdown.split('\n')
    const headings: ParsedHeading[] = []

    lines.forEach((line, index) => {
      const match = line.match(NUMBERED_HEADING_REGEX)
      if (match) {
        const hashCount = match[1].length
        const number = match[2]
        const title = match[3].trim()
        const id = getHeadingId(number)

        headings.push({
          level: hashCount,
          number,
          title,
          fullLine: line,
          lineIndex: index,
          isCollapsed: collapsedHeadings.get(id) || false,
          id,
        })
      }
    })

    return headings
  }, [collapsedHeadings])

  // ---------- HTML rendering functions ----------

  // Convert basic markdown to HTML (for content within sections)
  const convertMarkdownToHtml = useCallback((text: string): string => {
    if (!text) return ''
    
    let html = escapeHtml(text)
    // Bold: **text** -> <strong>text</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic: _text_ -> <em>text</em>
    html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
    // Underline: __text__ -> <u>text</u>
    html = html.replace(/__([^_]+)__/g, '<u>$1</u>')
    // Strikethrough: ~~text~~ -> <s>text</s>
    html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>')
    // Line breaks
    html = html.replace(/\n/g, '<br>')
    
    return html
  }, [])

  // Render markdown content with proper structure
  // Each section gets an editable area after it for writing outside the section
  const renderMarkdownWithHeadings = useCallback((markdown: string): string => {
    if (!markdown || !markdown.trim()) {
      return '<div class="editable-block" contenteditable="true"><br></div>'
    }

    const lines = markdown.split('\n')
    const headings = parseNumberedHeadings(markdown)

    if (headings.length === 0) {
      // No numbered headings, render as normal markdown
      const html = convertMarkdownToHtml(markdown)
      return `<div class="editable-block" contenteditable="true">${html || '<br>'}</div>`
    }

    let html = ''

    // Content before first heading
    if (headings.length > 0 && headings[0].lineIndex > 0) {
      const beforeLines = lines.slice(0, headings[0].lineIndex)
      const beforeText = beforeLines.join('\n').trim()
      if (beforeText) {
        html += `<div class="editable-block before-section" contenteditable="true">${convertMarkdownToHtml(beforeText)}</div>`
      }
    }

    // Process each heading - only top-level ones first
    // Build a structure that properly nests subsections
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i]
      
      // Skip if this heading is a child of a previous heading (will be rendered as part of parent)
      let isChild = false
      for (let j = 0; j < i; j++) {
        const prevHeading = headings[j]
        if (heading.level > prevHeading.level) {
          // Check if there's no same-or-higher level heading between them
          let foundSameOrHigher = false
          for (let k = j + 1; k < i; k++) {
            if (headings[k].level <= prevHeading.level) {
              foundSameOrHigher = true
              break
            }
          }
          if (!foundSameOrHigher) {
            isChild = true
            break
          }
        }
      }
      
      if (isChild) continue // Skip children - they're rendered inside their parent
      
      // Find where this section ends (next same/higher level heading)
      const nextSameLevelOrHigherIdx = headings.findIndex((h, idx) => idx > i && h.level <= heading.level)
      const endLineIndex = nextSameLevelOrHigherIdx !== -1 ? headings[nextSameLevelOrHigherIdx].lineIndex : lines.length

      // Get content for this section
      const sectionContentLines = lines.slice(heading.lineIndex + 1, endLineIndex)
      
      // Separate own content from subsection content
      const ownContentLines: string[] = []
      let subsectionIdx = 0
      
      for (let lineIdx = 0; lineIdx < sectionContentLines.length; lineIdx++) {
        const line = sectionContentLines[lineIdx]
        const match = line.match(NUMBERED_HEADING_REGEX)
        if (match) {
          // Found a subsection - stop collecting own content
          break
        }
        ownContentLines.push(line)
        subsectionIdx = lineIdx + 1
      }

      const id = heading.id
      const isCollapsed = collapsedHeadings.get(id) || false
      const caretChar = isCollapsed ? '▶' : '▼'
      const contentDisplay = isCollapsed ? 'none' : 'block'
      const tagName = `h${heading.level}`

      // Build section HTML
      html += `
        <div class="heading-section" data-heading-id="${id}" data-heading-number="${escapeHtml(heading.number)}" data-level="${heading.level}" data-collapsed="${isCollapsed}">
          <div class="heading-header" style="display: flex; align-items: center; gap: 0.5rem; padding: 4px 0;">
            <button type="button" class="heading-toggle" data-heading-id="${id}" style="width: 20px; height: 20px; border: none; background: rgba(255,255,255,0.1); border-radius: 3px; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; font-size: 10px; transition: background 0.2s;">
              <span class="heading-caret">${caretChar}</span>
            </button>
            <${tagName} class="heading-title" style="margin: 0; flex: 1; font-weight: 600; display: inline;">
              <span class="heading-number" style="color: #a78bfa; margin-right: 0.3em;" contenteditable="false">${escapeHtml(heading.number)}</span>
              <span class="heading-text" contenteditable="true">${escapeHtml(heading.title)}</span>
            </${tagName}>
          </div>
          <div class="heading-content" data-heading-id="${id}" style="margin-left: 24px; margin-top: 4px; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.2); display: ${contentDisplay};">
            <div class="section-text editable-block" contenteditable="true">${ownContentLines.join('\n').trim() ? convertMarkdownToHtml(ownContentLines.join('\n').trim()) : '<br>'}</div>
          </div>
        </div>`

      // Add editable block AFTER this section for writing outside content
      // This appears at the same level as the section, not inside it
      html += `<div class="editable-block after-section" data-after-heading="${id}" contenteditable="true" style="min-height: 0.5em;"></div>`
    }

    // Final editable area at the end
    html += '<div class="editable-block final-block" contenteditable="true" style="min-height: 1em;"><br></div>'

    return html || '<div class="editable-block" contenteditable="true"><br></div>'
  }, [parseNumberedHeadings, convertMarkdownToHtml, collapsedHeadings])

  // ---------- HTML to Markdown conversion ----------

  // Convert a single HTML element's content to markdown (recursive)
  const elementToMarkdown = useCallback((element: Element | ChildNode): string => {
    let md = ''
    
    if (element.nodeType === window.Node.TEXT_NODE) {
      return element.textContent || ''
    }
    
    if (element.nodeType !== window.Node.ELEMENT_NODE) {
      return ''
    }
    
    const el = element as Element
    const tagName = el.tagName?.toLowerCase() || ''
    
    // Skip placeholder text
    if (el.classList?.contains('placeholder')) {
      return ''
    }
    
    // Handle specific tags
    if (tagName === 'br') {
      return '\n'
    } else if (tagName === 'strong' || tagName === 'b') {
      const inner = Array.from(el.childNodes).map(c => elementToMarkdown(c)).join('')
      return inner ? `**${inner}**` : ''
    } else if (tagName === 'em' || tagName === 'i') {
      const inner = Array.from(el.childNodes).map(c => elementToMarkdown(c)).join('')
      return inner ? `_${inner}_` : ''
    } else if (tagName === 'u') {
      const inner = Array.from(el.childNodes).map(c => elementToMarkdown(c)).join('')
      return inner ? `__${inner}__` : ''
    } else if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
      const inner = Array.from(el.childNodes).map(c => elementToMarkdown(c)).join('')
      return inner ? `~~${inner}~~` : ''
    } else if (el.classList?.contains('heading-section')) {
      // Process heading section completely
      return convertHeadingSectionToMarkdown(el)
    } else if (el.classList?.contains('heading-toggle') || el.classList?.contains('heading-caret')) {
      // Skip toggle buttons
      return ''
    } else if (el.classList?.contains('heading-number')) {
      // Skip - handled by parent
      return ''
    } else {
      // Process children
      el.childNodes.forEach(child => {
        md += elementToMarkdown(child)
      })
    }
    
    return md
  }, [])

  // Convert a heading section element to markdown
  const convertHeadingSectionToMarkdown = useCallback((section: Element): string => {
    const level = parseInt(section.getAttribute('data-level') || '1', 10)
    const hashes = '#'.repeat(level)
    
    const numberSpan = section.querySelector(':scope > .heading-header .heading-number')
    const textSpan = section.querySelector(':scope > .heading-header .heading-text')
    const contentDiv = section.querySelector(':scope > .heading-content')

    const number = numberSpan?.textContent?.trim() || ''
    const title = textSpan?.textContent?.trim() || ''
    
    let md = `${hashes} ${number} ${title}\n`
    
    if (contentDiv) {
      // Process all children of content div
      contentDiv.childNodes.forEach(child => {
        if (child.nodeType === window.Node.ELEMENT_NODE) {
          const childEl = child as Element
          
          if (childEl.classList?.contains('heading-section')) {
            // Nested heading - recurse
            md += convertHeadingSectionToMarkdown(childEl)
          } else if (childEl.classList?.contains('section-text') || childEl.classList?.contains('editable-block')) {
            // Regular text content
            const textMd = elementToMarkdown(childEl)
            const cleanText = textMd.trim()
            if (cleanText) {
              md += cleanText + '\n'
            }
          } else {
            const textMd = elementToMarkdown(childEl)
            const cleanText = textMd.trim()
            if (cleanText) {
              md += cleanText + '\n'
            }
          }
        } else if (child.nodeType === window.Node.TEXT_NODE) {
          const text = child.textContent?.trim()
          if (text) {
            md += text + '\n'
          }
        }
      })
    }
    
    return md
  }, [elementToMarkdown])

  const htmlToMarkdown = useCallback((html: string): string => {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    
    let md = ''
    
    // Process each top-level element
    tempDiv.childNodes.forEach(child => {
      if (child.nodeType === window.Node.ELEMENT_NODE) {
        const el = child as Element
        
        if (el.classList?.contains('heading-section')) {
          md += convertHeadingSectionToMarkdown(el)
        } else if (el.classList?.contains('editable-block') || 
                   el.classList?.contains('before-section') || 
                   el.classList?.contains('after-section') ||
                   el.classList?.contains('final-block') ||
                   el.classList?.contains('editor-content')) {
          const content = elementToMarkdown(el)
          const cleanContent = content.trim()
          if (cleanContent) {
            md += cleanContent + '\n'
          }
        } else {
          const content = elementToMarkdown(el)
          const cleanContent = content.trim()
          if (cleanContent) {
            md += cleanContent + '\n'
          }
        }
      } else if (child.nodeType === window.Node.TEXT_NODE) {
        const text = child.textContent?.trim()
        if (text) {
          md += text + '\n'
        }
      }
    })

    // Decode HTML entities
    md = decodeHtmlEntities(md)
    
    // Clean up multiple newlines
    md = md.replace(/\n{3,}/g, '\n\n')
    
    return md.trim()
  }, [convertHeadingSectionToMarkdown, elementToMarkdown])

  // ---------- Toggle heading collapse ----------

  // Find all child headings of a given heading (based on number hierarchy)
  const getChildHeadingIds = useCallback((headingNumber: string, headings: ParsedHeading[]): string[] => {
    const childIds: string[] = []
    const parentNum = headingNumber.replace(/\.$/, '') // Remove trailing dot
    
    for (const h of headings) {
      const hNum = h.number.replace(/\.$/, '')
      // A child heading starts with parent number followed by a dot
      if (hNum.startsWith(parentNum + '.')) {
        childIds.push(h.id)
      }
    }
    
    return childIds
  }, [])

  const toggleHeadingCollapse = useCallback((headingId: string) => {
    // Get all headings to find children
    const headings = parseNumberedHeadings(content)
    const targetHeading = headings.find(h => h.id === headingId)
    
    setCollapsedHeadings(prev => {
      const next = new Map(prev)
      const current = next.get(headingId) || false
      const newState = !current
      
      // Set the target heading's collapsed state
      next.set(headingId, newState)
      
      // If collapsing, also collapse all children
      if (newState && targetHeading) {
        const childIds = getChildHeadingIds(targetHeading.number, headings)
        for (const childId of childIds) {
          next.set(childId, true)
        }
      }
      
      return next
    })
  }, [content, parseNumberedHeadings, getChildHeadingIds])

  // ---------- Event handlers ----------

  const handleEditorClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement

    // Check for heading toggle button
    const toggleButton = target.closest('.heading-toggle') as HTMLElement | null
    if (toggleButton) {
      event.preventDefault()
      event.stopPropagation()
      const headingId = toggleButton.getAttribute('data-heading-id')
      if (headingId) {
        toggleHeadingCollapse(headingId)
      }
      return
    }
  }, [toggleHeadingCollapse])

  const handleEditorInput = useCallback(() => {
    if (!contentTextareaRef.current) return
    isInternalUpdate.current = true
    const html = contentTextareaRef.current.innerHTML
    const markdown = htmlToMarkdown(html)
    setContent(markdown)
    onContentChange(markdown)
  }, [htmlToMarkdown, onContentChange])

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    onContentChange(newContent)
  }, [onContentChange])

  const handleNameChange = useCallback((newName: string) => {
    setNodeName(newName)
    onNameChange(newName)
  }, [onNameChange])

  // ---------- Create new section/heading ----------

  const createSection = useCallback((level: number): void => {
    if (!contentTextareaRef.current) return
    
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    const hasSelection = selectedText.length > 0 && selection && selection.rangeCount > 0

    // Prompt for section number
    const existingHeadings = parseNumberedHeadings(content)
    const suggestedNumber = generateSectionNumber(level, existingHeadings)
    
    const sectionNumber = window.prompt('Abschnittsnummer eingeben:', suggestedNumber)
    if (!sectionNumber) return

    // If text is selected, use it as title (with option to change)
    // Only ask for title if no text is selected
    let sectionTitle: string | null
    if (selectedText) {
      sectionTitle = window.prompt('Abschnittstitel eingeben:', selectedText)
    } else {
      sectionTitle = window.prompt('Abschnittstitel eingeben:', 'Neuer Abschnitt')
    }
    if (!sectionTitle) return

    // Create markdown heading
    const hashes = '#'.repeat(level)
    const headingMarkdown = `${hashes} ${sectionNumber} ${sectionTitle}`

    if (hasSelection && selection) {
      // Replace selected text with the heading IN PLACE
      const range = selection.getRangeAt(0)
      
      // Check if selection is within the editor
      if (contentTextareaRef.current.contains(range.commonAncestorContainer)) {
        // Delete the selected text
        range.deleteContents()
        
        // Create a temporary element to hold the heading HTML
        const id = getHeadingId(sectionNumber)
        const tagName = `h${level}`
        
        // Create the heading structure
        const sectionDiv = document.createElement('div')
        sectionDiv.className = 'heading-section'
        sectionDiv.setAttribute('data-heading-id', id)
        sectionDiv.setAttribute('data-heading-number', sectionNumber)
        sectionDiv.setAttribute('data-level', String(level))
        sectionDiv.setAttribute('data-collapsed', 'false')
        
        sectionDiv.innerHTML = `
          <div class="heading-header" style="display: flex; align-items: center; gap: 0.5rem; padding: 4px 0;">
            <button type="button" class="heading-toggle" data-heading-id="${id}" style="width: 20px; height: 20px; border: none; background: rgba(255,255,255,0.1); border-radius: 3px; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; font-size: 10px; transition: background 0.2s;">
              <span class="heading-caret">▼</span>
            </button>
            <${tagName} class="heading-title" style="margin: 0; flex: 1; font-weight: 600; display: inline;">
              <span class="heading-number" style="color: #a78bfa; margin-right: 0.3em;" contenteditable="false">${escapeHtml(sectionNumber)}</span>
              <span class="heading-text" contenteditable="true">${escapeHtml(sectionTitle)}</span>
            </${tagName}>
          </div>
          <div class="heading-content" data-heading-id="${id}" style="margin-left: 24px; margin-top: 4px; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.2); display: block;">
            <div class="section-text editable-block" contenteditable="true"><br></div>
          </div>
        `
        
        // Insert the heading at cursor position
        range.insertNode(sectionDiv)
        
        // Add an after-section block
        const afterBlock = document.createElement('div')
        afterBlock.className = 'editable-block after-section'
        afterBlock.setAttribute('data-after-heading', id)
        afterBlock.setAttribute('contenteditable', 'true')
        afterBlock.style.minHeight = '0.5em'
        sectionDiv.after(afterBlock)
        
        // Sync back to markdown
        isInternalUpdate.current = true
        const html = contentTextareaRef.current.innerHTML
        const markdown = htmlToMarkdown(html)
        setContent(markdown)
        onContentChange(markdown)
      } else {
        // Selection not in editor, append at end
        const newContent = content + (content.endsWith('\n') ? '' : '\n') + headingMarkdown + '\n'
        setContent(newContent)
        onContentChange(newContent)
      }
    } else {
      // No selection, append at end
      const newContent = content + (content.endsWith('\n') ? '' : '\n') + headingMarkdown + '\n'
      setContent(newContent)
      onContentChange(newContent)
    }
    
    setShowSectionLevels(false)
  }, [content, parseNumberedHeadings, onContentChange, htmlToMarkdown])

  // Generate suggested section number based on existing headings
  const generateSectionNumber = (level: number, headings: ParsedHeading[]): string => {
    const sameLevelHeadings = headings.filter(h => h.level === level)
    
    if (level === 1) {
      return `${sameLevelHeadings.length + 1}.`
    }
    
    // Find parent level heading
    const parentLevel = level - 1
    const parentHeadings = headings.filter(h => h.level === parentLevel)
    const lastParent = parentHeadings[parentHeadings.length - 1]
    
    if (lastParent) {
      // Count siblings under this parent
      const parentNumber = lastParent.number.replace(/\.$/, '')
      const siblings = headings.filter(h => 
        h.level === level && h.number.startsWith(parentNumber + '.')
      )
      return `${parentNumber}.${siblings.length + 1}`
    }
    
    // Fallback
    return '1.' + '.1'.repeat(level - 1)
  }

  // ---------- Text formatting ----------

  const handleTextStyleChange = useCallback((updates?: Partial<Node['textStyle']>) => {
    if (!updates || !contentTextareaRef.current) return

    contentTextareaRef.current.focus()

    const exec = (cmd: string) => document.execCommand(cmd, false)

    if (Object.prototype.hasOwnProperty.call(updates, 'isBold')) exec('bold')
    if (Object.prototype.hasOwnProperty.call(updates, 'isItalic')) exec('italic')
    if (Object.prototype.hasOwnProperty.call(updates, 'isUnderline')) exec('underline')
    if (Object.prototype.hasOwnProperty.call(updates, 'isStrikethrough')) exec('strikeThrough')

    if (updates.fontSize !== undefined) {
      const newStyle = { ...textStyle, fontSize: updates.fontSize } as Required<NonNullable<Node['textStyle']>>
      setTextStyle(newStyle)
      onTextStyleChange?.(newStyle)
      contentTextareaRef.current.style.fontSize = `${updates.fontSize}px`
    }

    isInternalUpdate.current = true
    const html = contentTextareaRef.current.innerHTML
    const markdown = htmlToMarkdown(html)
    setContent(markdown)
    onContentChange(markdown)
  }, [textStyle, onTextStyleChange, htmlToMarkdown, onContentChange])

  // ---------- Relationship handling ----------

  const handleNewRelation = useCallback(() => {
    const command = newRelation.charAt(0)
    const name = newRelation.slice(1).trim()

    if ((command === '>' || command === '<' || command === '=') && name) {
      onAddRelationship(command, name)
      setNewRelation('')
    }
  }, [newRelation, onAddRelationship])

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    handleNewRelation()
  }, [handleNewRelation])

  const handleRelationshipUpdate = useCallback((oldType: string, index: number, newValue: string) => {
    const command = newValue.charAt(0)
    const name = newValue.slice(1).trim()

    if (newValue === '') {
      onDeleteRelationship(oldType, relationships[index].targetName)
    } else if ((command === '>' || command === '<' || command === '=') && name) {
      onUpdateRelationship(oldType, command, name)
    }
  }, [relationships, onDeleteRelationship, onUpdateRelationship])

  const getRelationshipSymbol = (type: string) => {
    switch (type) {
      case 'child': return '>'
      case 'parent': return '<'
      case 'friend': return '='
      default: return ''
    }
  }

  // ---------- Effects ----------

  // Initialize from node
  useEffect(() => {
    setContent(node.content || '')
    setNodeName(node.name)
    setTextStyle({
      fontSize: node.textStyle?.fontSize ?? 14,
      isBold: node.textStyle?.isBold ?? false,
      isItalic: node.textStyle?.isItalic ?? false,
      isUnderline: node.textStyle?.isUnderline ?? false,
      isStrikethrough: node.textStyle?.isStrikethrough ?? false,
    })
    
    // Restore collapsed state from saved sections
    if (node.sections) {
      const newCollapsed = new Map<string, boolean>()
      node.sections.forEach(s => {
        if (s.isCollapsed) {
          newCollapsed.set(s.id, true)
        }
      })
      setCollapsedHeadings(newCollapsed)
    }
  }, [node])

  // Render content when it changes or collapsed state changes
  useEffect(() => {
    if (!contentTextareaRef.current) return
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }

    const html = renderMarkdownWithHeadings(content)
    contentTextareaRef.current.innerHTML = html
  }, [content, renderMarkdownWithHeadings, collapsedHeadings])

  useEffect(() => {
    if (newRelationInputRef.current) {
      newRelationInputRef.current.focus()
    }
  }, [])

  // Close section level dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      const target = e.target as HTMLElement
      if (!target.closest('.section-dropdown')) {
        setShowSectionLevels(false)
      }
    }

    if (showSectionLevels) {
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [showSectionLevels])

  // Save sections changes to parent component
  useEffect(() => {
    // Convert parsed headings to Section format for persistence
    const headings = parseNumberedHeadings(content)
    const newSections: Section[] = headings.map(h => ({
      id: h.id,
      title: `${h.number} ${h.title}`,
      level: h.level,
      number: h.number,
      content: '',
      isCollapsed: collapsedHeadings.get(h.id) || false,
      subsections: []
    }))
    setSections(newSections)
    onSectionsChange?.(newSections)
  }, [content, collapsedHeadings, parseNumberedHeadings, onSectionsChange])

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
    <>
      <style jsx>{`
        .heading-section {
          border-radius: 4px;
          margin: 4px 0;
        }
        .heading-header:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
        .heading-toggle:hover {
          background: rgba(255, 255, 255, 0.2) !important;
        }
        .heading-content {
          transition: all 0.2s ease-in-out;
        }
        .heading-content:focus-within {
          border-left-color: rgba(167, 139, 250, 0.5) !important;
        }
        .editable-block {
          min-height: 0.5em;
          outline: none;
        }
        .editable-block:focus {
          background: rgba(255, 255, 255, 0.02);
        }
        .editable-block.after-section:empty::before {
          content: '';
        }
        .section-text {
          min-height: 1em;
          outline: none;
        }
        .placeholder {
          pointer-events: none;
        }
      `}</style>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="fixed inset-4 bg-zinc-900 rounded-lg shadow-2xl border border-zinc-700 flex flex-col overflow-hidden z-50 md:inset-8 lg:inset-12">
          <div className="flex flex-col p-4 border-b border-zinc-700 gap-2">
            <Input
              ref={nameInputRef}
              value={nodeName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 rounded-md px-3 h-10 w-full max-w-4xl"
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
                    e.preventDefault()
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
                    e.preventDefault()
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
                    e.preventDefault()
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
                    e.preventDefault()
                    handleTextStyleChange({ isStrikethrough: true })
                  }}
                  className="h-8 w-8 line-through"
                >
                  S
                </Button>
                <div className="relative section-dropdown">
                  <Button
                    size="sm"
                    variant="ghost"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowSectionLevels(!showSectionLevels)
                    }}
                    className="h-8 px-2 flex items-center gap-1"
                  >
                    <List className="w-4 h-4" />
                    Abschnitt
                  </Button>
                  {showSectionLevels && (
                    <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-30 p-2 flex flex-col gap-1 min-w-[140px]">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => createSection(1)}
                        className="justify-start text-xs"
                      >
                        # 1. (Ebene 1)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => createSection(2)}
                        className="justify-start text-xs"
                      >
                        ## 1.1 (Ebene 2)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => createSection(3)}
                        className="justify-start text-xs"
                      >
                        ### 1.1.1 (Ebene 3)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const customLevel = prompt('Ebene eingeben (1-6):', '4')
                          if (customLevel && !isNaN(parseInt(customLevel))) {
                            const level = Math.min(6, Math.max(1, parseInt(customLevel)))
                            createSection(level)
                          }
                        }}
                        className="justify-start text-xs"
                      >
                        Benutzerdefiniert...
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsExistingRelationshipsVisible(!isExistingRelationshipsVisible)}
                  className="text-zinc-400 hover:text-white"
                >
                  {isExistingRelationshipsVisible ? 'Hide' : 'Show'} Relationships
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
                  Close
                </Button>
              </div>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-2 flex-grow overflow-y-auto min-h-0">
            <div className="relative">
              <form onSubmit={handleFormSubmit}>
                <Input
                  ref={newRelationInputRef}
                  value={newRelation}
                  onChange={(e) => setNewRelation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleNewRelation()
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
                        setNewRelation(command + n.name)
                        onAddRelationship(command, n.name)
                        setNewRelation('')
                      }}
                    >
                      {n.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isExistingRelationshipsVisible && (
              <div className="border border-zinc-700 rounded-md bg-zinc-800 overflow-hidden max-h-40 overflow-y-auto flex-shrink-0">
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

            <div className={`flex gap-2 ${isExistingRelationshipsVisible ? 'flex-1 min-h-0' : 'flex-grow'}`}>
              <div className="flex-1 flex flex-col relative min-h-0">
                <div
                  ref={contentTextareaRef}
                  contentEditable
                  suppressContentEditableWarning
                  onClick={handleEditorClick}
                  onInput={handleEditorInput}
                  className="min-h-[200px] flex-1 bg-zinc-700 border border-zinc-600 text-white rounded-md p-3 overflow-auto focus:outline-none"
                  style={{ fontSize: `${textStyle.fontSize}px`, lineHeight: '1.5' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
