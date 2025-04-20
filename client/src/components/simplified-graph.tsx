import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { Bookmark } from '@shared/schema';

// Node types for the force-directed graph
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  group: number;
  bookmarkId?: string;
  type: "bookmark" | "related" | "domain" | "tag"; 
  url?: string;
}

// Link types for connections between nodes
interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  type: "tag" | "domain" | "related" | "content";
}

// Component state
interface GraphState {
  selectedNodeId: string | null;
  focusedNodeIds: Set<string>;
  isFiltered: boolean;
}

// Component props
interface SimplifiedGraphProps {
  bookmarks: Bookmark[];
  insightLevel: number;
  onNodeClick: (bookmarkId: string) => void;
}

export function SimplifiedGraph({ bookmarks, insightLevel, onNodeClick }: SimplifiedGraphProps): JSX.Element {
  // References for D3 elements
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // References for simulation and zoom
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // Internal graph state
  const [graphState, setGraphState] = useState<GraphState>({
    selectedNodeId: null,
    focusedNodeIds: new Set<string>(),
    isFiltered: false
  });
  
  // Extract domain from URL for grouping
  const getDomain = useCallback((url: string): string => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return "unknown";
    }
  }, []);
  
  // Generate graph data from bookmarks
  const generateGraphData = useCallback((
    bookmarks: Bookmark[], 
    insightLevel: number
  ): { nodes: GraphNode[], links: GraphLink[] } => {
    // Maps to track unique nodes and prevent duplicates
    const nodeMap = new Map<string, GraphNode>();
    const domainMap = new Map<string, string>();
    const tagMap = new Map<string, string>();
    
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // First pass: Create bookmark nodes and domain nodes
    bookmarks.forEach((bookmark) => {
      // Add bookmark node
      const bookmarkNode: GraphNode = {
        id: bookmark.id,
        name: bookmark.title,
        group: 1,
        bookmarkId: bookmark.id,
        type: "bookmark"
      };
      
      nodes.push(bookmarkNode);
      nodeMap.set(bookmark.id, bookmarkNode);
      
      // Extract and add domain node if not already present
      const domain = getDomain(bookmark.url);
      const domainId = `domain-${domain}`;
      
      if (!domainMap.has(domain)) {
        const domainNode: GraphNode = {
          id: domainId,
          name: domain,
          group: 2,
          type: "domain"
        };
        
        nodes.push(domainNode);
        nodeMap.set(domainId, domainNode);
        domainMap.set(domain, domainId);
      }
      
      // Connect bookmark to its domain
      links.push({
        id: `link-domain-${bookmark.id}`,
        source: bookmark.id,
        target: domainId,
        value: 2,
        type: "domain"
      });
      
      // Add tag nodes and connections
      const allTags = [
        ...(bookmark.user_tags || []),
        ...(bookmark.system_tags || [])
      ];
      
      // Use Set to remove duplicates from tags
      const uniqueTags = [...new Set(allTags)];
      
      uniqueTags.forEach(tag => {
        const tagId = `tag-${tag}`;
        
        // Add tag node if not already present
        if (!tagMap.has(tag)) {
          const tagNode: GraphNode = {
            id: tagId,
            name: tag,
            group: 3,
            type: "tag"
          };
          
          nodes.push(tagNode);
          nodeMap.set(tagId, tagNode);
          tagMap.set(tag, tagId);
        }
        
        // Connect bookmark to tag
        links.push({
          id: `link-tag-${bookmark.id}-${tagId}`,
          source: bookmark.id,
          target: tagId,
          value: 1,
          type: "tag"
        });
      });
      
      // Add related content links if available and insight level is high enough
      if (insightLevel >= 2 && bookmark.insights?.related_links) {
        bookmark.insights.related_links.forEach((relatedUrl, index) => {
          // Only include some related links to avoid cluttering
          if (index < 2) {
            const relatedId = `related-${bookmark.id}-${index}`;
            
            // Create a related node
            const relatedNode: GraphNode = {
              id: relatedId,
              name: relatedUrl.substring(0, 30) + '...',
              group: 4,
              type: "related",
              url: relatedUrl
            };
            
            nodes.push(relatedNode);
            
            // Connect bookmark to related content
            links.push({
              id: `link-related-${bookmark.id}-${index}`,
              source: bookmark.id,
              target: relatedId,
              value: 2,
              type: "related"
            });
          }
        });
      }
    });
    
    // Create bookmark-to-bookmark links based on common tags and domains
    for (let i = 0; i < bookmarks.length; i++) {
      for (let j = i + 1; j < bookmarks.length; j++) {
        const bookmarkA = bookmarks[i];
        const bookmarkB = bookmarks[j];
        
        // Connect by common domain
        const domainA = getDomain(bookmarkA.url);
        const domainB = getDomain(bookmarkB.url);
        
        if (domainA === domainB) {
          links.push({
            id: `link-domain-${bookmarkA.id}-${bookmarkB.id}`,
            source: bookmarkA.id,
            target: bookmarkB.id,
            value: 2,
            type: "domain"
          });
        }
        
        // Connect by common tags
        const tagsA = [...new Set([...(bookmarkA.user_tags || []), ...(bookmarkA.system_tags || [])])];
        const tagsB = [...new Set([...(bookmarkB.user_tags || []), ...(bookmarkB.system_tags || [])])];
        
        const commonTags = tagsA.filter(tag => tagsB.includes(tag));
        
        if (commonTags.length > 0) {
          links.push({
            id: `link-tags-${bookmarkA.id}-${bookmarkB.id}`,
            source: bookmarkA.id,
            target: bookmarkB.id,
            value: Math.min(1 + commonTags.length, 5), // Cap at 5 for line thickness
            type: "tag"
          });
        }
      }
    }
    
    return { nodes, links };
  }, [getDomain]);
  
  // Center and zoom the graph (simplified)
  const centerGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Apply default zoom/center
    const svg = d3.select(svgRef.current);
    svg.transition()
      .duration(750)
      .call(zoomRef.current.transform, 
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(0.8)
          .translate(-width / 2, -height / 2)
      );
  }, []);
  
  // Apply filtering when focusing on specific nodes
  const applyNodeFiltering = useCallback((focusedIds: Set<string>) => {
    if (!svgRef.current || !focusedIds || focusedIds.size === 0) return;
    
    const svg = d3.select(svgRef.current);
    
    // Simple opacity adjustment for nodes
    svg.selectAll(".node")
      .style("opacity", (d: any) => focusedIds.has(d.id) ? 1 : 0.1);
    
    // Simple opacity adjustment for links
    svg.selectAll("line.link")
      .style("opacity", (l: any) => {
        const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
        const targetId = typeof l.target === 'string' ? l.target : l.target.id;
        return (focusedIds.has(sourceId) && focusedIds.has(targetId)) ? 0.8 : 0.1;
      });
  }, []);
  
  // Get connected nodes for a given node ID
  const getConnectedNodeIds = useCallback((nodeId: string): Set<string> => {
    if (!simulationRef.current) return new Set([nodeId]);
    
    const connectedIds = new Set<string>([nodeId]);
    const links = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    
    if (!links || !links.links) return connectedIds;
    
    // Find connected nodes based on links
    links.links().forEach((link: any) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      
      if (sourceId === nodeId) connectedIds.add(targetId);
      if (targetId === nodeId) connectedIds.add(sourceId);
    });
    
    return connectedIds;
  }, []);
  
  // Find a node by bookmark ID
  const findNodeByBookmarkId = useCallback((bookmarkId: string): GraphNode | undefined => {
    if (!simulationRef.current) return undefined;
    
    return simulationRef.current.nodes().find((n: any) => 
      n.type === "bookmark" && n.bookmarkId === bookmarkId
    );
  }, []);
  
  // Select a node and update filtering
  const selectNode = useCallback((nodeId: string, isolateView: boolean = true) => {
    if (!simulationRef.current) return;
    
    const node = simulationRef.current.nodes().find((n: any) => n.id === nodeId);
    if (!node) return;
    
    setGraphState(prev => ({
      ...prev,
      selectedNodeId: nodeId,
      focusedNodeIds: isolateView ? getConnectedNodeIds(nodeId) : prev.focusedNodeIds,
      isFiltered: isolateView
    }));
    
    if (isolateView) {
      const connectedIds = getConnectedNodeIds(nodeId);
      applyNodeFiltering(connectedIds);
      console.log(`Isolated view to show node ${nodeId} and ${connectedIds.size - 1} connected nodes`);
    }
    
    // Highlight the selected node
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      
      // Reset all nodes to default size
      svg.selectAll(".node circle")
        .attr("r", (d: any) => {
          switch (d.type) {
            case "bookmark": return 8;
            case "related": return 6;
            case "domain": return 7;
            case "tag": return 5;
            default: return 6;
          }
        });
      
      // Highlight the selected node
      svg.select(`#node-${nodeId} circle`)
        .attr("r", 12);
    }
  }, [getConnectedNodeIds, applyNodeFiltering]);
  
  // Select a bookmark by ID
  const selectBookmarkById = useCallback((bookmarkId: string, isolateView: boolean = true) => {
    const node = findNodeByBookmarkId(bookmarkId);
    
    if (node) {
      console.log(`Selecting bookmark: ${bookmarkId}, node: ${node.id}`);
      selectNode(node.id, isolateView);
    }
  }, [findNodeByBookmarkId, selectNode]);
  
  // Reset the graph filtering
  const resetFilter = useCallback(() => {
    if (!svgRef.current) return;
    console.log("Resetting graph filters");
    
    const svg = d3.select(svgRef.current);
    
    // Reset visual state
    svg.selectAll(".node").style("opacity", 1);
    svg.selectAll("line.link").style("opacity", 0.6);
    
    // Reset node sizes
    svg.selectAll(".node circle")
      .attr("r", (d: any) => {
        switch (d.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7;
          case "tag": return 5;
          default: return 6;
        }
      });
    
    // Reset state
    setGraphState({
      selectedNodeId: null,
      focusedNodeIds: new Set<string>(),
      isFiltered: false
    });
  }, []);
  
  // Initialize D3 visualization
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || bookmarks.length === 0) return;
    
    // Clear any existing graph
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    // Graph dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Set up zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        svg.select("g.zoom-container").attr("transform", event.transform);
      });
    
    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;
    
    // Create container for graph elements
    const zoomContainer = svg.append("g").attr("class", "zoom-container");
    const linkGroup = zoomContainer.append("g").attr("class", "links");
    const nodeGroup = zoomContainer.append("g").attr("class", "nodes");
    
    // Generate nodes and links
    const { nodes, links } = generateGraphData(bookmarks, insightLevel);
    
    // Create simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("charge", d3.forceManyBody().strength(-300))
      .force("link", d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(100))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(15));
    
    simulationRef.current = simulation;
    
    // Create links
    const link = linkGroup.selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", (link: any) => {
        switch (link.type) {
          case "tag": return "#9333ea";
          case "domain": return "#10b981";
          case "related": return "#f97316";
          case "content": return "#3b82f6";
          default: return "#6b7280";
        }
      })
      .attr("stroke-width", (link: any) => Math.sqrt(link.value))
      .attr("stroke-opacity", 0.6);
    
    // Create nodes
    const node = nodeGroup
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", (d: any) => `node node-${d.type}`)
      .attr("id", (d: any) => `node-${d.id}`)
      .style("cursor", "pointer")
      .on("click", function(event: any, d: any) {
        event.stopPropagation();
        
        selectNode(d.id, true);
        
        if (d.bookmarkId) {
          onNodeClick(d.bookmarkId);
        }
      })
      .on("mouseover", function(event: any, d: any) {
        if (graphState.isFiltered) return;
        
        // Highlight connected nodes on hover
        const connectedIds = getConnectedNodeIds(d.id);
        
        nodeGroup.selectAll(".node")
          .style("opacity", (n: any) => connectedIds.has(n.id) ? 1 : 0.3);
        
        linkGroup.selectAll("line")
          .style("opacity", (l: any) => {
            const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
            const targetId = typeof l.target === 'string' ? l.target : l.target.id;
            return connectedIds.has(sourceId) && connectedIds.has(targetId) ? 0.9 : 0.1;
          });
      })
      .on("mouseout", function() {
        if (graphState.isFiltered) return;
        
        // Reset highlights
        nodeGroup.selectAll(".node").style("opacity", 1);
        linkGroup.selectAll("line").style("opacity", 0.6);
      });
    
    // Add circles to node groups
    node.append("circle")
      .attr("r", (d: any) => {
        switch (d.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7;
          case "tag": return 5;
          default: return 6;
        }
      })
      .attr("fill", (d: any) => {
        switch (d.type) {
          case "bookmark": return "#3b82f6";
          case "related": return "#f97316";
          case "domain": return "#10b981";
          case "tag": return "#9333ea";
          default: return "#6b7280";
        }
      })
      .attr("stroke", (d: any) => {
        switch (d.type) {
          case "bookmark": return "#1d4ed8";
          case "related": return "#ea580c";
          case "domain": return "#059669";
          case "tag": return "#7e22ce";
          default: return "#4b5563";
        }
      })
      .attr("stroke-width", (d: any) => d.type === "bookmark" ? 2 : 1.5);
    
    // Add labels
    node.append("text")
      .attr("dy", 4)
      .attr("dx", 12)
      .text((d: any) => d.name)
      .attr("font-size", "12px")
      .attr("fill", "#374151")
      .style("pointer-events", "none");
    
    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      
      node
        .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`);
    });
    
    // Center the graph initially
    centerGraph();
    
    // Click on the background to reset filtering
    svg.on("click", (event) => {
      if (event.target === svgRef.current) {
        resetFilter();
      }
    });
  }, [bookmarks, insightLevel, centerGraph, generateGraphData, getConnectedNodeIds, onNodeClick, resetFilter, selectNode, graphState.isFiltered]);
  
  // Initialize the graph when bookmarks change
  useEffect(() => {
    initializeGraph();
  }, [bookmarks, insightLevel, initializeGraph]);
  
  // Listen for custom events to select nodes
  useEffect(() => {
    const handleSelectNode = (event: CustomEvent) => {
      const { nodeId, isolateView } = event.detail;
      if (nodeId) {
        selectNode(nodeId, isolateView);
      }
    };
    
    document.addEventListener('selectGraphNode', handleSelectNode as EventListener);
    
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode as EventListener);
    };
  }, [selectNode]);
  
  // Select bookmark when prop changes
  useEffect(() => {
    const handleExternalBookmarkSelect = (bookmarkId: string | null) => {
      if (!bookmarkId) {
        resetFilter();
        return;
      }
      
      selectBookmarkById(bookmarkId, true);
    };
    
    // Check if there's a current selection
    const isBookmarkSelected = graphState.selectedNodeId !== null && 
      graphState.selectedNodeId.includes("bookmark");
    
    // Respond to prop changes
    const selectedBookmark = bookmarks.find(b => 
      findNodeByBookmarkId(b.id) && 
      graphState.selectedNodeId === b.id
    );
    
    if (selectedBookmark && !isBookmarkSelected) {
      handleExternalBookmarkSelect(selectedBookmark.id);
    }
  }, [graphState.selectedNodeId, bookmarks, findNodeByBookmarkId, resetFilter, selectBookmarkById]);
  
  return (
    <div ref={containerRef} className="w-full h-full bg-white">
      <svg 
        ref={svgRef} 
        className="w-full h-full" 
        style={{ minHeight: "400px" }}
      />
    </div>
  );
}