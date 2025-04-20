import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { Bookmark } from "@shared/types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  group: number;
  bookmarkId?: string;
  type: "bookmark" | "related" | "domain" | "tag"; // Node type for visual differentiation
  url?: string;
}

interface GraphLink {
  id: string; // Unique identifier for each link
  source: string;
  target: string;
  value: number;
  type: "tag" | "domain" | "related" | "content"; // Link type for visual differentiation
}

interface GraphState {
  selectedNodeId: string | null;
  focusedNodeIds: Set<string>;
  isFiltered: boolean;
  zoomTransform: d3.ZoomTransform | null;
}

interface ForceDirectedGraphProps {
  bookmarks: Bookmark[];
  insightLevel: number;
  onNodeClick: (bookmarkId: string) => void;
}

export function ForceDirectedGraph({ bookmarks, insightLevel, onNodeClick }: ForceDirectedGraphProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // Maintain graph state separately to avoid unnecessary re-renders
  const [graphState, setGraphState] = useState<GraphState>({
    selectedNodeId: null,
    focusedNodeIds: new Set<string>(),
    isFiltered: false,
    zoomTransform: null
  });
  
  // Extract domain from URL
  const getDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // Return a fallback for invalid URLs
      return url.split('/')[0];
    }
  };

  // Utility function to get node color by type and group
  const getNodeColor = useCallback((type: string, group: number): string => {
    switch (type) {
      case "bookmark": 
        // Use a predictable color scheme for bookmark groups
        const bookmarkColors = [
          "#3b82f6", // blue
          "#8b5cf6", // purple
          "#ec4899", // pink
          "#f97316", // orange
          "#10b981", // green
          "#06b6d4", // cyan
          "#6366f1", // indigo
          "#a855f7", // fuchsia
          "#ef4444", // red
          "#14b8a6", // teal
        ];
        return bookmarkColors[(group - 1) % bookmarkColors.length];
      case "tag":
        return "#9333ea"; // Purple for tags
      case "domain":
        return "#10b981"; // Green for domains
      case "related":
        return "#f97316"; // Orange for related content
      default:
        return "#6b7280"; // Gray fallback
    }
  }, []);

  // Generate nodes and links from bookmarks
  const generateGraphData = useCallback((bookmarks: Bookmark[], insightLevel: number) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Create maps for lookups
    const tagGroups: Record<string, number> = {};
    const tagNodes: Record<string, boolean> = {}; // Track created tag nodes
    const domainNodes: Record<string, boolean> = {}; // Track created domain nodes
    let groupCounter = 1;
    
    // First pass: create bookmark nodes and collect metadata
    bookmarks.forEach(bookmark => {
      // Determine group based on primary tag or source if no tags
      const primaryTag = bookmark.user_tags[0] || bookmark.system_tags[0] || bookmark.source;
      
      if (!tagGroups[primaryTag]) {
        tagGroups[primaryTag] = groupCounter++;
      }
      
      const group = tagGroups[primaryTag];
      
      // Add the main bookmark node
      nodes.push({
        id: bookmark.id,
        name: bookmark.title,
        group,
        bookmarkId: bookmark.id,
        type: "bookmark",
        url: bookmark.url
      });
      
      // Create domain node if not exists
      const domain = getDomain(bookmark.url);
      if (!domainNodes[domain]) {
        domainNodes[domain] = true;
        nodes.push({
          id: `domain-${domain}`,
          name: domain,
          group: group, // Keep domain in same group
          type: "domain"
        });
      }
      
      // Connect bookmark to its domain
      links.push({
        id: `link-${bookmark.id}-${domain}`,
        source: bookmark.id,
        target: `domain-${domain}`,
        value: 2,
        type: "domain"
      });
      
      // Create tag nodes and connect bookmark to its tags
      const allTags = [...new Set([...bookmark.user_tags, ...bookmark.system_tags])];
      allTags.forEach(tag => {
        // Create tag node if not exists
        if (!tagNodes[tag]) {
          tagNodes[tag] = true;
          nodes.push({
            id: `tag-${tag}`,
            name: tag,
            group: tagGroups[tag] || group,
            type: "tag"
          });
        }
        
        // Connect bookmark to tag
        links.push({
          id: `link-${bookmark.id}-tag-${tag}`,
          source: bookmark.id,
          target: `tag-${tag}`,
          value: 1,
          type: "tag"
        });
      });
      
      // Add related content nodes based on insight level
      if (bookmark.insights?.related_links && insightLevel > 0) {
        const relatedCount = Math.min(bookmark.insights.related_links.length, insightLevel + 1);
        
        for (let i = 0; i < relatedCount; i++) {
          const relatedUrl = bookmark.insights.related_links[i];
          if (!relatedUrl) continue;
          
          // Create a more descriptive name
          let relatedName = relatedUrl;
          try {
            const urlObj = new URL(relatedUrl);
            relatedName = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1);
            // Clean up the name
            relatedName = relatedName.replace(/-|_/g, ' ').trim();
            if (!relatedName) relatedName = urlObj.hostname;
          } catch (e) {
            // Keep original if URL parsing fails
          }
          
          const relatedId = `related-${bookmark.id}-${i}`;
          
          nodes.push({
            id: relatedId,
            name: relatedName || "Related Link",
            group: group,
            type: "related",
            url: relatedUrl
          });
          
          links.push({
            id: `link-${bookmark.id}-${relatedId}`,
            source: bookmark.id,
            target: relatedId,
            value: 2,
            type: "related"
          });
        }
      }
    });
    
    // Second pass: content-based connections (semantic similarity)
    // Connect bookmarks with similar content or from same source
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
        
        // Connect by common tags with stronger connections for more matches
        const tagsA = [...new Set([...bookmarkA.user_tags, ...bookmarkA.system_tags])];
        const tagsB = [...new Set([...bookmarkB.user_tags, ...bookmarkB.system_tags])];
        
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
        
        // Connect bookmarks if they reference each other in related links
        if (bookmarkA.insights?.related_links?.some(link => link.includes(bookmarkB.url)) ||
            bookmarkB.insights?.related_links?.some(link => link.includes(bookmarkA.url))) {
          links.push({
            id: `link-ref-${bookmarkA.id}-${bookmarkB.id}`,
            source: bookmarkA.id,
            target: bookmarkB.id,
            value: 3,
            type: "content"
          });
        }
      }
    }
    
    return { nodes, links };
  }, []);

  // Store the last centered state to avoid unnecessary zooming
  const lastCenteredStateRef = useRef<{
    nodeCount: number;
    centerX: number;
    centerY: number;
    scale: number;
    timestamp: number;
    nodeIds: string[];
  } | null>(null);
  
  // Function to center and zoom the graph based on visible nodes
  const centerGraph = useCallback((nodes: GraphNode[]) => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current || nodes.length === 0) return;
    
    // Get container dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Sort the node IDs for consistent comparison
    const currentNodeIds = nodes.map(n => n.id).sort();
    
    // Calculate bounding box of all nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;
      
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    });
    
    // If we couldn't determine bounds, exit
    if (minX === Infinity || minY === Infinity) return;
    
    // Add padding - use more padding for fewer nodes to make the view more comfortable
    const padding = Math.max(30, Math.min(100, 100 - nodes.length * 2));
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;
    
    // Calculate center point of nodes
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calculate required scale to fit all nodes
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    
    // Determine scale to fit content (use the more constraining dimension)
    let scale = Math.min(
      width / boundsWidth,
      height / boundsHeight
    );
    
    // Smoother scale adjustment based on node count
    if (nodes.length > 15) {
      // More subtle scale reduction for many nodes
      scale = Math.max(0.5, scale * (1 - Math.min(nodes.length / 150, 0.4)));
    } else if (nodes.length < 5) {
      // Don't zoom in quite as aggressively for small node counts
      scale = Math.min(1.8, scale);
    }
    
    // Constrain scale to the allowed range with a tighter min bound for better visibility
    scale = Math.max(0.4, Math.min(scale, 1.8));
    
    // Check if this view is very similar to the last one
    const now = Date.now();
    const lastState = lastCenteredStateRef.current;
    
    if (lastState) {
      // Check if we're centering the exact same set of nodes
      const sameNodes = lastState.nodeIds.length === currentNodeIds.length &&
        lastState.nodeIds.every((id, i) => id === currentNodeIds[i]);
        
      // Don't re-center if we've recently centered the same set of nodes
      // and the position/scale change is minimal
      const timeSinceLastCenter = now - lastState.timestamp;
      const centerXDiff = Math.abs(centerX - lastState.centerX);
      const centerYDiff = Math.abs(centerY - lastState.centerY);
      const scaleDiff = Math.abs(scale - lastState.scale);
      
      // Much more aggressive de-bouncing to prevent multiple zooms
      if (sameNodes && timeSinceLastCenter < 1500) {
        // If we're zooming the same nodes in a short time period, skip this operation
        return;
      }
      
      // Also skip minor adjustments
      if (
        centerXDiff < 20 && 
        centerYDiff < 20 && 
        scaleDiff < 0.05 &&
        sameNodes
      ) {
        return;
      }
    }
    
    // Apply the transform to center on the specified nodes
    const svg = d3.select(svgRef.current);
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);
    
    // Apply the transform smoothly with transition
    svg.transition()
      .duration(750)
      .call(zoomRef.current.transform, transform);
    
    // Update the last centered state reference
    lastCenteredStateRef.current = {
      nodeCount: nodes.length,
      centerX,
      centerY,
      scale,
      timestamp: now,
      nodeIds: currentNodeIds
    };
    
    console.log(`Graph centered: ${nodes.length} nodes, scale: ${scale.toFixed(2)}, center: (${Math.round(centerX)}, ${Math.round(centerY)})`);
  }, []);

  // Initialize zoom behavior
  const initializeZoom = useCallback(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        const g = svg.select("g.zoom-container");
        g.attr("transform", event.transform);
        
        // Update the stored zoom transform state
        setGraphState(prev => ({
          ...prev,
          zoomTransform: event.transform
        }));
      });
    
    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;
  }, []);

  // Get the connected nodes for a given node ID
  const getConnectedNodeIds = useCallback((nodeId: string): Set<string> => {
    // First defensive check - if no simulation exists
    if (!simulationRef.current) return new Set([nodeId]);
    
    const connectedIds = new Set<string>([nodeId]);
    const linkForce = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    
    // If there's no link force or it's not properly initialized
    if (!linkForce || typeof linkForce.links !== 'function') return connectedIds;
    
    // Get links, with defensive check in case links() returns undefined
    const links = linkForce.links() || [];
    
    // Find all direct connections
    const directLinks = links.filter(link => {
      if (!link || !link.source || !link.target) return false;
      
      const sourceId = typeof link.source === 'string' ? link.source : 
                      (link.source as GraphNode).id ? (link.source as GraphNode).id : '';
      const targetId = typeof link.target === 'string' ? link.target : 
                      (link.target as GraphNode).id ? (link.target as GraphNode).id : '';
                      
      return sourceId === nodeId || targetId === nodeId;
    });
    
    // Add all directly connected node IDs
    directLinks.forEach(link => {
      if (!link || !link.source || !link.target) return;
      
      const sourceId = typeof link.source === 'string' ? link.source : 
                      (link.source as GraphNode).id ? (link.source as GraphNode).id : '';
      const targetId = typeof link.target === 'string' ? link.target : 
                      (link.target as GraphNode).id ? (link.target as GraphNode).id : '';
                      
      if (sourceId) connectedIds.add(sourceId);
      if (targetId) connectedIds.add(targetId);
    });
    
    return connectedIds;
  }, []);
  
  // Function to find a node by bookmark ID
  const findNodeByBookmarkId = useCallback((bookmarkId: string): GraphNode | undefined => {
    if (!simulationRef.current) return undefined;
    
    return simulationRef.current.nodes().find(n => 
      n.type === "bookmark" && n.bookmarkId === bookmarkId
    );
  }, []);
  
  // Apply visual filtering based on focused node ids
  const applyNodeFiltering = useCallback((focusedIds: Set<string>) => {
    if (!svgRef.current || !focusedIds || focusedIds.size === 0) return;
    
    const svg = d3.select(svgRef.current);
    
    try {
      // Update node opacity with safe guards
      svg.selectAll(".node")
        .style("opacity", (d: any) => {
          if (!d || !d.id) return 0.02;
          return focusedIds.has(d.id) ? 1 : 0.02;
        });
      
      // Update link opacity and stroke width with safe guards
      svg.selectAll("line.link")
        .style("opacity", (l: any) => {
          if (!l || !l.source || !l.target) return 0.02;
          
          const sourceId = typeof l.source === 'string' ? l.source : 
                          (l.source && typeof l.source === 'object' && 'id' in l.source) ? l.source.id : '';
          const targetId = typeof l.target === 'string' ? l.target : 
                          (l.target && typeof l.target === 'object' && 'id' in l.target) ? l.target.id : '';
                          
          if (!sourceId || !targetId) return 0.02;
          return focusedIds.has(sourceId) && focusedIds.has(targetId) ? 0.9 : 0.02;
        })
        .style("stroke-width", (l: any) => {
          if (!l || !l.source || !l.target || !l.value) return 1;
          
          const sourceId = typeof l.source === 'string' ? l.source : 
                          (l.source && typeof l.source === 'object' && 'id' in l.source) ? l.source.id : '';
          const targetId = typeof l.target === 'string' ? l.target : 
                          (l.target && typeof l.target === 'object' && 'id' in l.target) ? l.target.id : '';
                          
          if (!sourceId || !targetId) return 1;
          return focusedIds.has(sourceId) && focusedIds.has(targetId) ? 
            Math.sqrt(l.value) * 1.8 : 
            Math.sqrt(l.value) * 0.3;
        });
      
      // Focus the view on the filtered nodes (only if there are nodes to focus on)
      if (simulationRef.current && focusedIds.size > 0) {
        const nodes = simulationRef.current.nodes();
        if (nodes && nodes.length > 0) {
          const focusedNodes = nodes.filter(n => n && n.id && focusedIds.has(n.id));
          
          // Only center if we have nodes to center on
          if (focusedNodes.length > 0) {
            centerGraph(focusedNodes);
          }
        }
      }
    } catch (err) {
      console.error("Error applying node filtering:", err);
    }
  }, [centerGraph]);
  
  // Function to select a node and update the graph filtering
  const selectNode = useCallback((nodeId: string, isolateView: boolean = true) => {
    if (!simulationRef.current) return;
    
    // Get the target node
    const node = simulationRef.current.nodes().find(n => n.id === nodeId);
    if (!node) return;
    
    // Update the graph state
    setGraphState(prev => {
      // If isolating the view, get connected nodes and update filter
      const focusedNodeIds = isolateView ? getConnectedNodeIds(nodeId) : prev.focusedNodeIds;
      
      // Return the updated state
      return {
        ...prev,
        selectedNodeId: nodeId,
        focusedNodeIds: focusedNodeIds,
        isFiltered: isolateView
      };
    });
    
    if (isolateView) {
      // Apply visual filtering
      const connectedIds = getConnectedNodeIds(nodeId);
      applyNodeFiltering(connectedIds);
      
      console.log(`Isolated view to show node ${nodeId} and ${connectedIds.size - 1} connected nodes`);
    }
    
    // Highlight the selected node
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      
      // Reset all nodes to default size first
      svg.selectAll(".node circle")
        .attr("r", (d: any) => {
          switch (d.type) {
            case "bookmark": return 8;
            case "related": return 6;
            case "domain": return 7;
            case "tag": return 5;
            default: return 6;
          }
        })
        .attr("stroke-width", (d: any) => d.type === "bookmark" ? 2 : 1.5);
      
      // Highlight the selected node
      svg.select(`#node-${nodeId} circle`)
        .attr("r", 12)
        .attr("stroke-width", 3);
    }
  }, [getConnectedNodeIds, applyNodeFiltering]);
  
  // Function to select a bookmark by ID
  const selectBookmarkById = useCallback((bookmarkId: string, isolateView: boolean = true) => {
    const node = findNodeByBookmarkId(bookmarkId);
    
    if (node) {
      console.log(`Selecting bookmark: ${bookmarkId}, node: ${node.id}`);
      selectNode(node.id, isolateView);
    } else {
      console.log(`No graph node found for bookmark ID: ${bookmarkId}`);
    }
  }, [findNodeByBookmarkId, selectNode]);
  
  // Reset the graph filtering to show all nodes
  const resetFilter = useCallback(() => {
    if (!svgRef.current || !simulationRef.current) return;
    
    console.log("Resetting graph filters");
    
    const svg = d3.select(svgRef.current);
    
    // Reset all visual elements to default state
    svg.selectAll(".node")
      .style("opacity", 1);
      
    svg.selectAll("line.link")
      .style("opacity", 0.6)
      .style("stroke-width", (d: any) => Math.sqrt(d.value));
    
    // Reset all node sizes to default (clear highlight)
    svg.selectAll(".node circle")
      .attr("r", (d: any) => {
        switch (d.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7;
          case "tag": return 5;
          default: return 6;
        }
      })
      .attr("stroke-width", (d: any) => d.type === "bookmark" ? 2 : 1.5);
    
    // Reset the selection state
    setGraphState(prev => ({
      ...prev,
      selectedNodeId: null,
      focusedNodeIds: new Set<string>(),
      isFiltered: false
    }));
    
    // Skip centering view if we're already showing all nodes to avoid excess zooming
    if (
      lastCenteredStateRef.current && 
      simulationRef.current?.nodes() &&
      lastCenteredStateRef.current.nodeCount === simulationRef.current.nodes().length
    ) {
      // Already centered on all nodes, don't do anything
      return;
    }
    
    // Center the view on all nodes (with a short delay to ensure state is updated)
    setTimeout(() => {
      if (simulationRef.current) {
        centerGraph(simulationRef.current.nodes());
      }
    }, 50);
  }, [centerGraph]);
  
  // Initialize and render the force-directed graph
  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || bookmarks.length === 0) return;
    
    // Calculate effective dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const svg = d3.select(svgRef.current);
    
    // Clear previous graph completely
    svg.selectAll("*").remove();
    
    // Create new SVG structure with zoom container
    const zoomContainer = svg.append("g")
      .attr("class", "zoom-container");
    
    // Create groups for links and nodes (links need to be below nodes)
    const linkGroup = zoomContainer.append("g").attr("class", "links");
    const nodeGroup = zoomContainer.append("g").attr("class", "nodes");
    
    // Generate nodes and links
    const { nodes, links } = generateGraphData(bookmarks, insightLevel);
    
    // Store references to the graph data
    nodesRef.current = nodes;
    linksRef.current = links;
    
    // Create simulation with appropriate forces
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("charge", d3.forceManyBody()
        .strength(node => {
          // Adjust repulsion for different node types
          switch (node.type) {
            case "bookmark": return -400; 
            case "related": return -300;
            case "domain": return -350;
            case "tag": return -200;
            default: return -300;
          }
        }))
      .force("link", d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(link => {
          // Adjust link distance by type
          switch (link.type) {
            case "domain": return 100;
            case "tag": return 120;
            case "related": return 80;
            case "content": return 150;
            default: return 100;
          }
        })
        .strength(link => {
          // Adjust attractive force by type and value
          switch (link.type) {
            case "domain": return 0.7;
            case "tag": return 0.3;
            case "related": return 0.5;
            case "content": return 0.2;
            default: return 0.3;
          }
        }))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(d => {
        // Collision radius varies by node type
        switch (d.type) {
          case "bookmark": return 20;
          case "related": return 15;
          case "domain": return 18;
          case "tag": return 12;
          default: return 15;
        }
      }));
    
    // Store the simulation for external control
    simulationRef.current = simulation;
    
    // Define the arrow marker for directed links (optional)
    svg.append("defs").selectAll("marker")
      .data(["standard", "tag", "domain", "related", "content"])
      .enter().append("marker")
      .attr("id", d => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 15)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", d => {
        switch (d) {
          case "tag": return "#9333ea";
          case "domain": return "#10b981";
          case "related": return "#f97316";
          case "content": return "#3b82f6";
          default: return "#6b7280";
        }
      });
    
    // Create links
    const link = linkGroup.selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", link => {
        switch (link.type) {
          case "tag": return "#9333ea";
          case "domain": return "#10b981";
          case "related": return "#f97316";
          case "content": return "#3b82f6";
          default: return "#6b7280";
        }
      })
      .attr("stroke-width", link => Math.sqrt(link.value))
      .attr("stroke-opacity", 0.6);
    
    // Create node groups
    const node = nodeGroup
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", d => `node node-${d.type}`)
      .attr("id", d => `node-${d.id}`)
      .style("cursor", "pointer")
      .on("click", function(event: MouseEvent, d: GraphNode) {
        event.stopPropagation();
        
        // Select this node with isolation view
        selectNode(d.id, true);
        
        // If this node represents a bookmark, trigger the callback to update sidebar
        if (d.bookmarkId) {
          onNodeClick(d.bookmarkId);
        } else if (d.type === "related" && d.url) {
          // For related nodes, try to find an existing bookmark with this URL
          const matchingBookmark = bookmarks.find(b => b.url === d.url);
          if (matchingBookmark) {
            onNodeClick(matchingBookmark.id);
          }
        }
      })
      .on("mouseover", function(event: MouseEvent, d: GraphNode) {
        // Only apply hover effects if we're not in filtered mode
        if (graphState.isFiltered) return;
        
        // Highlight connected nodes and links on hover
        const connectedIds = getConnectedNodeIds(d.id);
        
        // Apply temporary hover highlighting
        nodeGroup.selectAll(".node")
          .style("opacity", (n: any) => connectedIds.has(n.id) ? 1 : 0.3);
        
        linkGroup.selectAll("line")
          .style("opacity", (l: any) => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
            return connectedIds.has(sourceId) && connectedIds.has(targetId) ? 0.9 : 0.1;
          })
          .style("stroke-width", (l: any) => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
            return connectedIds.has(sourceId) && connectedIds.has(targetId) ? 
              Math.sqrt(l.value) * 1.3 : 
              Math.sqrt(l.value);
          });
      })
      .on("mouseout", function() {
        // Only restore if we're not in filtered mode
        if (graphState.isFiltered) return;
        
        // Reset highlights
        nodeGroup.selectAll(".node").style("opacity", 1);
        linkGroup.selectAll("line")
          .style("opacity", 0.6)
          .style("stroke-width", (d: any) => Math.sqrt(d.value));
      });
    
    // Add node dragging behavior
    const dragBehavior = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        // Keep the node fixed at its final position
        // d.fx = null;
        // d.fy = null;
      });
      
    node.call(dragBehavior);
    
    // Add circles to nodes with distinct styling based on type
    node.append("circle")
      .attr("r", d => {
        switch (d.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7;
          case "tag": return 5;
          default: return 6;
        }
      })
      .attr("fill", d => getNodeColor(d.type, d.group))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", d => d.type === "bookmark" ? 2 : 1.5);
    
    // Add different shapes for different node types
    node.each(function(d) {
      const element = d3.select(this);
      
      if (d.type === "tag") {
        // Tags get a square shape
        element.append("rect")
          .attr("x", -4)
          .attr("y", -4)
          .attr("width", 8)
          .attr("height", 8)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1.5);
          
        // Remove the circle for tag nodes
        element.select("circle").remove();
      } else if (d.type === "domain") {
        // Domains get a diamond shape
        element.append("polygon")
          .attr("points", "0,-7 7,0 0,7 -7,0")
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1.5);
          
        // Remove the circle for domain nodes
        element.select("circle").remove();
      }
    });
    
    // Add labels to nodes
    node.append("text")
      .attr("dx", d => {
        // Adjust label position based on node type
        switch (d.type) {
          case "bookmark": return 10;
          case "related": return 8;
          default: return 9;
        }
      })
      .attr("dy", 4)
      .text(d => d.name)
      .attr("font-size", d => d.type === "bookmark" ? "11px" : "10px")
      .attr("fill", "#1F2937");
    
    // Update positions during simulation
    simulation.on("tick", () => {
      link
        .attr("x1", d => (typeof d.source === 'string' ? 
          (nodes.find(n => n.id === d.source)?.x || 0) : 
          (d.source as GraphNode).x || 0))
        .attr("y1", d => (typeof d.source === 'string' ? 
          (nodes.find(n => n.id === d.source)?.y || 0) : 
          (d.source as GraphNode).y || 0))
        .attr("x2", d => (typeof d.target === 'string' ? 
          (nodes.find(n => n.id === d.target)?.x || 0) : 
          (d.target as GraphNode).x || 0))
        .attr("y2", d => (typeof d.target === 'string' ? 
          (nodes.find(n => n.id === d.target)?.y || 0) : 
          (d.target as GraphNode).y || 0));
      
      node
        .attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    });
    
    // Center graph after initial layout
    simulation.on("end", () => {
      setTimeout(() => centerGraph(nodes), 100);
    });
    
    // Initialize zoom behavior
    initializeZoom();
    
    // Manually trigger centering after a timeout if simulation doesn't end naturally
    setTimeout(() => {
      if (simulationRef.current === simulation) {
        centerGraph(nodes);
      }
    }, 1000);
    
    // If we've previously applied a filter and have a selected node, reapply that filter
    if (graphState.isFiltered && graphState.selectedNodeId) {
      // Give time for the simulation to stabilize first
      setTimeout(() => {
        selectNode(graphState.selectedNodeId, true);
      }, 1200);
    }
    
    // Click on background to reset filtering
    svg.on("click", (event) => {
      // Only if we're not clicking on a node element
      if (!(event.target as Element).closest(".node")) {
        resetFilter();
      }
    });
    
    return () => {
      // Clean up the simulation when unmounting or re-rendering
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [bookmarks, insightLevel, getNodeColor, generateGraphData, initializeZoom, centerGraph, selectNode, getConnectedNodeIds, resetFilter, graphState.isFiltered, graphState.selectedNodeId, onNodeClick]);
  
  // Render graph when bookmarks data changes
  useEffect(() => {
    renderGraph();
  }, [renderGraph]);
  
  // Listen for external node selection events (from bookmark card or tag selection)
  useEffect(() => {
    const handleSelectNode = (event: Event) => {
      // Make sure the simulation exists before proceeding
      if (!simulationRef.current) return;
      
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.nodeId) return;
      
      const nodeId = customEvent.detail.nodeId;
      const isBookmarkId = customEvent.detail?.isBookmarkId === true;
      const isolateView = customEvent.detail?.isolateView === true;
      
      // If it's a bookmark ID, find the corresponding node first
      if (isBookmarkId) {
        selectBookmarkById(nodeId, isolateView);
      } else {
        // Otherwise select the node directly
        selectNode(nodeId, isolateView);
      }
    };
    
    // Reset graph event handler
    const handleResetGraph = () => {
      // Make sure the simulation exists before proceeding
      if (!simulationRef.current) return;
      
      console.log("Handling reset graph event");
      resetFilter();
    };
    
    // Add event listeners
    document.addEventListener('selectGraphNode', handleSelectNode);
    document.addEventListener('resetGraphView', handleResetGraph);
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode);
      document.removeEventListener('resetGraphView', handleResetGraph);
    };
  }, [selectNode, selectBookmarkById, resetFilter, simulationRef]);
  
  return (
    <div ref={containerRef} className="h-full w-full relative">
      <svg 
        ref={svgRef} 
        className="w-full h-full rounded-lg"
        style={{ background: "#f9fafb" }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white p-2 rounded-md shadow-md text-xs text-gray-600">
        <div className="flex items-center mb-1">
          <div className="w-3 h-3 rounded-full bg-blue-600 mr-2"></div>
          <span>Bookmark</span>
        </div>
        <div className="flex items-center mb-1">
          <div className="w-3 h-3 bg-purple-500 mr-2"></div>
          <span>Tag</span>
        </div>
        <div className="flex items-center mb-1">
          <div className="w-3 h-3 transform rotate-45 bg-green-500 mr-2"></div>
          <span>Domain</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
          <span>Related</span>
        </div>
      </div>
    </div>
  );
}