"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRef, ChangeEvent, useState } from "react";
import MindMap from "@/components/mind-map";

interface MindMapNode {
  id: string;
  name: string;
  level: number;
  color?: string;
  content?: string;
}

interface MindMapLink {
  source: string;
  target: string;
  type: "parent-child" | "friend";
}

interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: Record<string, FileNode>;
  content?: string;
}

const MAX_FILE_SIZE_FOR_FULL_READ = 5 * 1024 * 1024; // 5MB
const PREVIEW_CHUNK_SIZE = 64 * 1024; // 64KB

export default function OverviewPage() {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [mindMapData, setMindMapData] = useState<{ nodes: MindMapNode[], links: MindMapLink[] } | null>(null);

  const colors = ["#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57", "#54a0ff", "#ff9ff3", "#70a1ff"];

  const convertFileNodeToMindMapRecursive = (
    fileNode: FileNode,
    parentId: string | null,
    currentLevel: number,
    nodes: MindMapNode[],
    links: MindMapLink[]
  ) => {
    const nodeId = fileNode.path || `node-${Date.now()}-${Math.random()}`;

    nodes.push({
      id: nodeId,
      name: fileNode.name,
      level: currentLevel,
      color: fileNode.type === "folder" ? colors[currentLevel % colors.length] : "#ced6e0",
      content: fileNode.content,
    });

    if (parentId) {
      links.push({
        source: parentId,
        target: nodeId,
        type: "parent-child",
      });
    }

    if (fileNode.type === "folder" && fileNode.children) {
      for (const childName in fileNode.children) {
        convertFileNodeToMindMapRecursive(
          fileNode.children[childName],
          nodeId,
          currentLevel + 1,
          nodes,
          links
        );
      }
    }
  };

  const handleFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputFiles = event.target.files;
    if (!inputFiles || inputFiles.length === 0) {
      setMindMapData(null);
      if (folderInputRef.current) folderInputRef.current.value = ""; // Clear input
      return;
    }

    const rootFileStructure: FileNode = { name: "root_dir_for_processing", type: "folder", path: "", children: {} };
    const fileNodeMapByPath: Map<string, FileNode> = new Map(); // Map to quickly access nodes by path

    // Pass 1: Build structure and populate fileNodeMapByPath
    for (const inputFile of inputFiles) {
      const pathParts = inputFile.webkitRelativePath.split('/').filter(p => p);
      let currentParentChildrenMap = rootFileStructure.children!;
      let currentCumulativePath = "";

      for (let j = 0; j < pathParts.length; j++) {
        const partName = pathParts[j];
        currentCumulativePath = j === 0 ? partName : `${currentCumulativePath}/${partName}`;
        const isLastSegmentOfThisFile = j === pathParts.length - 1;

        if (!currentParentChildrenMap[partName]) {
          // This part of the path hasn't been seen before at this level. Create it.
          const newNode: FileNode = {
            name: partName,
            type: isLastSegmentOfThisFile ? "file" : "folder",
            path: currentCumulativePath,
            children: isLastSegmentOfThisFile ? undefined : {},
          };
          currentParentChildrenMap[partName] = newNode;
          fileNodeMapByPath.set(currentCumulativePath, newNode);
        } else {
          // This part_name exists. It might have been created as a 'file' by a shorter path.
          // If current path is longer (i.e., this is not the last segment), this existing node must be a 'folder'.
          if (!isLastSegmentOfThisFile && currentParentChildrenMap[partName].type === "file") {
            currentParentChildrenMap[partName].type = "folder";
            currentParentChildrenMap[partName].children = currentParentChildrenMap[partName].children || {}; // Ensure children object
          }
          // If it already existed, it should already be in the map from its first creation, or its path is now being extended.
          // We ensure the map has the latest state if type changed.
          fileNodeMapByPath.set(currentCumulativePath, currentParentChildrenMap[partName]);
        }
        
        // For descent: if it's not the last segment, we need to go deeper into a folder.
        if (!isLastSegmentOfThisFile) {
          const currentNode = currentParentChildrenMap[partName];
          // Ensure it's treated as a folder for descent.
          if (currentNode.type === "file") { 
            console.warn(`Path conflict: ${currentNode.path} was file, now needs to be folder.`);
            currentNode.type = "folder";
            currentNode.children = currentNode.children || {}; 
          }
          currentNode.children = currentNode.children || {}; // Double-ensure children for folder
          currentParentChildrenMap = currentNode.children!;
        }
      }
    }

    // Pass 2: Read file contents and update FileNode objects via the map
    const fileReadPromises: Promise<void>[] = [];
    for (const inputFile of inputFiles) {
      const filePath = inputFile.webkitRelativePath.split('/').filter(p => p).join('/');
      const nodeToUpdate = fileNodeMapByPath.get(filePath);

      // Only process files that are part of the recognized structure and are actual files
      if (!nodeToUpdate || nodeToUpdate.type !== "file") {
        continue;
      }

      if (inputFile.size === 0) { // Handle empty files explicitly
        nodeToUpdate.content = ""; // Or "-- Empty File --" or leave undefined
        continue; // No need to use FileReader for empty files
      }
      
      const promise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          let fileContent = e.target?.result as string;
          if (inputFile.size > MAX_FILE_SIZE_FOR_FULL_READ) {
            // Content is already from the slice, just append the notice
            const originalSizeMB = (inputFile.size / (1024 * 1024)).toFixed(2);
            const previewSizeKB = (PREVIEW_CHUNK_SIZE / 1024).toFixed(0);
            fileContent += `\n\n--- (Content truncated. Original file size: ${originalSizeMB} MB. Showing first ${previewSizeKB} KB) ---`;
          }
          nodeToUpdate.content = fileContent;
          resolve();
        };
        reader.onerror = (e) => {
          console.error("Error reading file/blob:", inputFile.name, e);
          nodeToUpdate.content = "--- Error reading file content ---";
          resolve(); 
        };

        if (inputFile.size > MAX_FILE_SIZE_FOR_FULL_READ) {
          const blobSlice = inputFile.slice(0, PREVIEW_CHUNK_SIZE);
          reader.readAsText(blobSlice);
        } else {
          reader.readAsText(inputFile);
        }
      });
      fileReadPromises.push(promise);
    }

    try {
      await Promise.all(fileReadPromises);
    } catch (error) { 
      // This catch block should ideally not be hit if individual promises always resolve.
      console.error("Unexpected error during Promise.all for file reads:", error);
    }
    
    const firstFilePathParts = inputFiles[0].webkitRelativePath.split('/').filter(p => p);
    const selectedFolderName = firstFilePathParts.length > 0 ? firstFilePathParts[0] : null;
    const actualRootFromFileNode = selectedFolderName ? rootFileStructure.children?.[selectedFolderName] : null;

    if (actualRootFromFileNode) {
      const newNodes: MindMapNode[] = [];
      const newLinks: MindMapLink[] = [];
      convertFileNodeToMindMapRecursive(actualRootFromFileNode, null, 0, newNodes, newLinks);
      
      console.log("Generated MindMap Nodes:", newNodes.length > 0 ? newNodes : "Empty - check conversion or source structure");
      console.log("Generated MindMap Links:", newLinks.length > 0 ? newLinks : "Empty");
      
      if (newNodes.length === 0 && actualRootFromFileNode) {
          console.warn("Conversion to MindMap nodes resulted in an empty node list, but a root FileNode existed. This might indicate an issue with recursive conversion or the structure of the root node.", actualRootFromFileNode);
      }

      setMindMapData({ nodes: newNodes, links: newLinks });
    } else {
      console.error("Failed to determine root folder node. Selected folder name was:", selectedFolderName, "Processed root structure was:", rootFileStructure);
      setMindMapData(null);
      alert("Could not process the selected folder. Ensure it's not empty or contains a recognizable structure. Check console for details.");
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = ""; // Clear the file input
    }
  };

  const handleImportFolderClick = () => {
    folderInputRef.current?.click();
  };

  if (mindMapData) {
    const graphDataForMindMap = { 
        nodes: mindMapData.nodes.map(n => ({...n as any})),
        links: mindMapData.links.map(l => ({...l as any}))
    };
    return (
      <main className="w-screen h-screen min-h-0 min-w-0 overflow-hidden">
        <MindMap initialGraphDataFromFolder={graphDataForMindMap} />
        <Button 
          onClick={() => setMindMapData(null)} 
          className="absolute top-4 left-4 z-20 bg-slate-700 hover:bg-slate-600 text-white"
          size="sm"
        >
          Back to Overview
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
          Supermind
        </h1>
        <p className="text-xl text-slate-300 max-w-md mx-auto">
          Organize your thoughts, unleash your creativity.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link href="/mindmap/new" passHref>
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-transform transform hover:scale-105 w-full sm:w-auto"
            >
              Create new Mindmap
            </Button>
          </Link>
          <Button
            size="lg"
            variant="default"
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-transform transform hover:scale-105 w-full sm:w-auto"
            onClick={() => alert("Quick Note functionality coming soon!")}
          >
            Quick Note
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-purple-500 text-purple-400 hover:bg-purple-700 hover:text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-transform transform hover:scale-105 w-full sm:w-auto"
            onClick={handleImportFolderClick}
          >
            Import Folder as Mindmap
          </Button>
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderInputChange}
            style={{ display: "none" }}
            // @ts-ignore - webkitdirectory is non-standard but widely supported for directory selection
            webkitdirectory=""
            directory=""
            multiple
          />
        </div>
      </div>
    </main>
  );
}