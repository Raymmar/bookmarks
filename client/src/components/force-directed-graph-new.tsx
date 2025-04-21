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

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
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
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const graphDataRef = useRef<GraphData | null>(null);
  const graphInitializedRef = useRef<boolean>(false);
  
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

  // Determine link color based on type
  const getLinkColor = useCallback((type: string) => {
    switch (type) {
      case "tag": return "#8B5CF6"; // Purple for tag connections
      case "domain": return "#10B981"; // Green for domain connections
      case "related": return "#F59E0B"; // Orange for related content
      case "content": return "#EF4444"; // Red for content similarity
      default: return "#d1d5db"; // Gray default
    }
  }, []);
    
  // Determine node color based on type and group
  const getNodeColor = useCallback((type: string, group: number) => {
    switch (type) {
      case "bookmark": 
        // Use a color scale based on group
        return d3.schemeCategory10[group % 10];
      case "related": return "#F59E0B"; // Orange
      case "domain": return "#10B981"; // Green
      case "tag": return "#8B5CF6"; // Purple
      default: return "#4F46E5"; // Blue default
    }
  }, []);

  // Handle the zoom behavior
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  const initializeZoom = useCallback(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        const g = svg.select("g.zoom-container");
        g.attr("transform", event.transform);
      });
    
    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;
  }, []);

  // Store the last centered state to avoid unnecessary zooming
  const lastCenteredStateRef = useRef<{
    nodeCount: number;
    centerX: number;
    centerY: number;
    scale: number;
    timestamp: number;
  } | null>(null);
  
  // Function to center and zoom the graph based on visible nodes
  const centerGraph = useCallback((nodes: GraphNode[]) => {
    if (!svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
    
    // Get container dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    if (nodes.length === 0) return;
    
    // Special handling for very few nodes
    const isFewNodes = nodes.length <= 10;
    
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
    
    // Add padding - adaptive based on node count
    // More padding for fewer nodes to prevent them from appearing too spread out
    const paddingScale = isFewNodes ? 0.25 : 0.1;
    const padding = Math.min(width, height) * paddingScale;
    
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
    
    // For few nodes, ensure the scale isn't too large or small
    // by enforcing a minimum bounding box size
    let effectiveBoundsWidth = boundsWidth;
    let effectiveBoundsHeight = boundsHeight;
    
    if (isFewNodes) {
      // For few nodes, ensure a reasonable minimum bounds to avoid excessive zoom
      const minBoundSize = Math.min(width, height) * 0.4; // Minimum 40% of container
      effectiveBoundsWidth = Math.max(boundsWidth, minBoundSize);
      effectiveBoundsHeight = Math.max(boundsHeight, minBoundSize);
    }
    
    // Determine scale to fit content (use the more constraining dimension)
    let scale = Math.min(
      width / effectiveBoundsWidth,
      height / effectiveBoundsHeight
    );
    
    // Scale adjustment based on node count
    if (nodes.length > 20) {
      // Reduce scale for many nodes to fit them better
      scale = Math.max(0.5, scale * (1 - Math.min(nodes.length / 150, 0.4)));
    } else if (nodes.length < 5) {
      // For very few nodes, use a moderate scale to avoid them appearing tiny
      // But also avoid zooming in too much for better context
      scale = Math.min(scale, 1.1);
    } else if (nodes.length < 10) {
      // For a moderate number of nodes, slightly reduce zoom
      scale = Math.min(scale, 1.2);
    }
    
    // Constrain scale to the allowed range
    scale = Math.max(0.4, Math.min(scale, 1.8));
    
    // Check if this view is very similar to the last one
    const now = Date.now();
    const lastState = lastCenteredStateRef.current;
    
    if (lastState) {
      // Don't re-center if we've recently centered and the change is minor
      const timeSinceLastCenter = now - lastState.timestamp;
      const centerXDiff = Math.abs(centerX - lastState.centerX);
      const centerYDiff = Math.abs(centerY - lastState.centerY);
      const scaleDiff = Math.abs(scale - lastState.scale);
      const nodeCountDiff = Math.abs(nodes.length - lastState.nodeCount);
      
      // If it's been less than 1.5 seconds, the center point hasn't moved much, 
      // scale is similar, and we're not showing dramatically different number of nodes, 
      // then skip this update for smoother experience
      if (timeSinceLastCenter < 1500 && 
          centerXDiff < 50 && 
          centerYDiff < 50 && 
          scaleDiff < 0.2 &&
          nodeCountDiff < 3) {
        return;
      }
    }
    
    // Apply the transform with a longer duration for smoother transitions
    const svg = d3.select(svgRef.current);
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);
    
    svg.transition()
      .duration(1000) // Smooth animation
      .ease(d3.easeCubicOut) // Smoother easing function
      .call(zoomBehaviorRef.current.transform, transform);
    
    // Store this state to avoid oscillation
    lastCenteredStateRef.current = {
      nodeCount: nodes.length,
      centerX,
      centerY,
      scale,
      timestamp: now
    };
    
    console.log(`Graph centered: ${nodes.length} nodes, scale: ${scale.toFixed(2)}, center: (${Math.round(centerX)}, ${Math.round(centerY)})`);
  }, []);

  // Functions for drag behavior
  const dragstarted = useCallback((event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
    if (!simulationRef.current) return;
    if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }, []);
  
  const dragged = useCallback((event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }, []);
  
  const dragended = useCallback((event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) => {
    if (!simulationRef.current) return;
    if (!event.active) simulationRef.current.alphaTarget(0);
    // Don't release nodes after drag to maintain layout
    // event.subject.fx = null;
    // event.subject.fy = null;
  }, []);

  // Handle node click events
  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    event.stopPropagation();
    
    // Highlight this node
    setSelectedNode(d.id);
    
    if (d.bookmarkId) {
      onNodeClick(d.bookmarkId);
    } else if (d.type === "related" && d.url) {
      // For related nodes, try to find an existing bookmark with this URL
      const matchingBookmark = bookmarks.find(b => b.url === d.url);
      if (matchingBookmark) {
        onNodeClick(matchingBookmark.id);
      }
    }
  }, [bookmarks, onNodeClick]);

  // Handle node hover effects
  const handleNodeHover = useCallback((event: MouseEvent, d: GraphNode, isEntering: boolean) => {
    if (!svgRef.current || !graphDataRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const { links } = graphDataRef.current;
    
    if (isEntering) {
      // Highlight connected nodes and links on hover
      const connectedLinks = links.filter(link => 
        link.source === d.id || 
        (typeof link.source === 'object' && (link.source as GraphNode).id === d.id) ||
        link.target === d.id || 
        (typeof link.target === 'object' && (link.target as GraphNode).id === d.id)
      );
      
      const connectedNodeIds = new Set<string>();
      connectedLinks.forEach(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        
        if (sourceId !== d.id) connectedNodeIds.add(sourceId);
        if (targetId !== d.id) connectedNodeIds.add(targetId);
      });
      
      // Dim all nodes and links
      svg.selectAll(".node").attr("opacity", 0.4);
      svg.selectAll("line").attr("opacity", 0.2);
      
      // Highlight the current node and its connections
      svg.select(`#node-${d.id}`).attr("opacity", 1);
      
      // Highlight connected nodes
      connectedNodeIds.forEach(id => {
        svg.select(`#node-${id}`).attr("opacity", 1);
      });
      
      // Highlight connected links
      connectedLinks.forEach(l => {
        svg.select(`#link-${l.id}`).attr("opacity", 1);
      });
      
      // Show tooltip with name
      d3.select("#tooltip")
        .style("opacity", 1)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px")
        .html(`<div class="font-medium">${d.name}</div><div class="text-gray-600 text-xs">${d.type}</div>`);
    } else {
      // Reset all opacities on mouseout
      svg.selectAll(".node").attr("opacity", 1);
      svg.selectAll("line").attr("opacity", 0.6);
      
      // Hide tooltip
      d3.select("#tooltip").style("opacity", 0);
    }
  }, []);

  // Update node selection visually without re-rendering the graph
  const updateSelectedNode = useCallback((nodeId: string | null) => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    
    // Reset all nodes to default size
    svg.selectAll(".node circle")
      .attr("r", d => {
        const node = d as GraphNode;
        switch (node.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7;
          case "tag": return 5;
          default: return 6;
        }
      })
      .attr("stroke-width", d => (d as GraphNode).type === "bookmark" ? 2 : 1.5)
      .attr("stroke-opacity", 1);
    
    // Reset node opacity
    svg.selectAll(".node").attr("opacity", 1);
    svg.selectAll("line").attr("opacity", 0.6);
    
    if (!nodeId) return;
    
    // Highlight the selected node
    const selectedElement = svg.select(`#node-${nodeId}`);
    if (!selectedElement.empty()) {
      // Highlight just this node
      svg.select(`#node-${nodeId} circle`)
        .attr("r", 12)
        .attr("stroke-width", 3)
        .attr("stroke-opacity", 1);
        
      // Dim other nodes slightly to make selected node stand out
      svg.selectAll(".node").attr("opacity", 0.7);
      svg.selectAll("line").attr("opacity", 0.4);
      svg.select(`#node-${nodeId}`).attr("opacity", 1);
      
      // Find and highlight connected nodes/links
      const graphData = graphDataRef.current;
      if (graphData) {
        const connectedLinks = graphData.links.filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return sourceId === nodeId || targetId === nodeId;
        });
        
        // Highlight connected nodes
        connectedLinks.forEach(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          
          const otherNodeId = sourceId === nodeId ? targetId : sourceId;
          svg.select(`#node-${otherNodeId}`).attr("opacity", 1);
          svg.select(`#link-${link.id}`).attr("opacity", 0.8);
        });
      }
    }
  }, []);

  // Center on specific node or node group
  const centerOnNode = useCallback((nodeId: string) => {
    if (!simulationRef.current || !svgRef.current || !graphDataRef.current) return;
    
    const nodeData = simulationRef.current.nodes().find(n => n.id === nodeId);
    if (!nodeData) return;
    
    // Check if we need to redraw the graph or just pan to the node
    // Find the node's position
    if (nodeData.x === undefined || nodeData.y === undefined) return;
    
    // Use smoother animation to pan to the node
    if (zoomBehaviorRef.current && svgRef.current) {
      const svg = d3.select(svgRef.current);
      const width = containerRef.current!.clientWidth;
      const height = containerRef.current!.clientHeight;
      
      // Get nodes to include in view
      let nodesToCenter = [nodeData];
      
      // For tag nodes, include connected bookmarks
      if (nodeData.type === "tag") {
        const tagId = nodeData.id;
        const relatedNodes = simulationRef.current.nodes().filter(n => {
          if (n.type !== "bookmark") return false;
          
          // Check if there's a link between this bookmark and the tag
          const links = simulationRef.current?.force("link") as d3.ForceLink<GraphNode, GraphLink>;
          const connection = links.links().some(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
            return (sourceId === n.id && targetId === tagId) || (sourceId === tagId && targetId === n.id);
          });
          
          return connection;
        });
        
        if (relatedNodes.length > 0) {
          nodesToCenter = [nodeData, ...relatedNodes];
        }
      } else {
        // For non-tag nodes, include directly connected nodes
        const links = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
        const connectedNodes = simulationRef.current.nodes().filter(n => {
          return links.links().some(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
            return (sourceId === nodeData.id && targetId === n.id) || (sourceId === n.id && targetId === nodeData.id);
          });
        });
        
        if (connectedNodes.length > 0) {
          nodesToCenter = [nodeData, ...connectedNodes];
        }
      }
      
      // Calculate bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      
      nodesToCenter.forEach(node => {
        if (node.x === undefined || node.y === undefined) return;
        
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      });
      
      if (minX === Infinity || minY === Infinity) return;
      
      // Add padding
      const padding = Math.max(30, Math.min(100, 100 - nodesToCenter.length * 2));
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;
      
      // Calculate center point and bounding box
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const boundsWidth = maxX - minX;
      const boundsHeight = maxY - minY;
      
      // Calculate optimal scale
      let scale = Math.min(
        width / boundsWidth,
        height / boundsHeight
      );
      
      // Adjust scale based on node count
      if (nodesToCenter.length > 15) {
        // More subtle scale for many nodes
        scale = Math.max(0.5, scale * (1 - Math.min(nodesToCenter.length / 150, 0.4)));
      } else if (nodesToCenter.length < 5) {
        // Closer view for few nodes
        scale = Math.min(1.8, scale);
      }
      
      // Ensure scale is within reasonable bounds
      scale = Math.max(0.4, Math.min(scale, 1.8));
      
      // Create transform
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
      
      // Apply smoother transition
      svg.transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, transform);
    }
    
    // Highlight the selected node - with a slight delay to allow smooth transition
    setTimeout(() => {
      updateSelectedNode(nodeId);
    }, 100);
    
  }, [updateSelectedNode]);

  // Initialize the graph
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !bookmarks.length) return;
    
    // Don't re-initialize if we already have a simulation running
    if (graphInitializedRef.current && simulationRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Generate the graph data
    const graphData = generateGraphData(bookmarks, insightLevel);
    graphDataRef.current = graphData;
    const { nodes, links } = graphData;
    
    // Setup the SVG
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);
    
    // Clear any previous content
    svg.selectAll("*").remove();
    
    // Create a container for the graph that can be zoomed
    const zoomContainer = svg.append("g")
      .attr("class", "zoom-container");
    
    // Create the links group first (to be under nodes)
    const linkGroup = zoomContainer.append("g")
      .attr("class", "links");
    
    // Create the nodes group
    const nodeGroup = zoomContainer.append("g")
      .attr("class", "nodes");
    
    // Initialize node positions with a more stable pattern before simulation
    const nodeCount = nodes.length;
    
    // Adaptive layout based on node count
    // For very few nodes, use a tighter, more centered layout
    const useCompactLayout = nodeCount <= 10;
    
    // Calculate radius based on node count - smaller radius for fewer nodes
    const radiusScale = useCompactLayout ? 
      Math.max(0.15, Math.min(0.25, nodeCount / 30)) : // Small circle for few nodes
      Math.max(0.25, Math.min(0.4, nodeCount / 50));   // Larger circle for many nodes
    
    const radius = Math.min(width, height) * radiusScale;
    
    nodes.forEach((node, i) => {
      // Set initial positions in a circular layout
      const angle = (i / nodes.length) * 2 * Math.PI;
      node.x = width / 2 + radius * Math.cos(angle);
      node.y = height / 2 + radius * Math.sin(angle);
      
      // Pin tag and domain nodes for stability
      // If few nodes, pin fewer to allow more natural arrangement
      if ((node.type === "tag" || node.type === "domain")) {
        if (useCompactLayout) {
          // For few nodes, don't pin everything, but use softer constraints
          if (i % 2 === 0) { // Pin only some nodes when few
            node.fx = node.x;
            node.fy = node.y;
          }
        } else {
          // For many nodes, pin all tags and domains for stability
          node.fx = node.x;
          node.fy = node.y;
        }
      }
    });

    // Adjust forces based on node count
    const isFewNodes = nodes.length <= 10;
    
    // For small graphs, use gentler forces to prevent stretching
    const linkStrength = isFewNodes ? 0.5 : 0.2;
    const repulsionStrength = isFewNodes ? -100 : -300;
    
    // Create the force simulation with adaptive forces based on node count
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        // Use smaller distances for small graphs
        if (isFewNodes) {
          if (d.type === "domain") return 40; 
          if (d.type === "tag") return 50;
          if (d.type === "related") return 35;
          return 40;
        } else {
          // Normal distances for larger graphs
          if (d.type === "domain") return 80;
          if (d.type === "tag") return 100;
          if (d.type === "related") return 60;
          return 70;
        }
      }).strength(linkStrength))
      .force("charge", d3.forceManyBody().strength(repulsionStrength))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(isFewNodes ? 0.2 : 0.1))
      .force("x", d3.forceX(width / 2).strength(isFewNodes ? 0.3 : 0.05))
      .force("y", d3.forceY(height / 2).strength(isFewNodes ? 0.3 : 0.05))
      .force("collision", d3.forceCollide().radius(d => {
        // Smaller collision radius for small graphs
        if (isFewNodes) {
          if (d.type === "bookmark") return 20;
          if (d.type === "domain") return 15;
          return 12;
        } else {
          // Normal collision radius for larger graphs
          if (d.type === "bookmark") return 30;
          if (d.type === "domain") return 25;
          if (d.type === "tag") return 20;
          return 15;
        }
      }).strength(isFewNodes ? 0.5 : 0.8));
    
    // Store simulation reference for later updates
    simulationRef.current = simulation;
    
    // Create links with visual distinctions
    const link = linkGroup
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", d => getLinkColor(d.type))
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke-opacity", 0.6)
      .attr("id", d => `link-${d.id}`);
    
    // Create node groups
    const node = nodeGroup
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", d => `node node-${d.type}`)
      .attr("id", d => `node-${d.id}`)
      .style("cursor", "pointer")
      .on("click", function(event, d) { handleNodeClick(event, d); })
      .on("mouseover", function(event, d) { handleNodeHover(event, d, true); })
      .on("mouseout", function(event, d) { handleNodeHover(event, d, false); })
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );
    
    // Add circles to nodes
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
      .attr("stroke", d => {
        if (d.type === "bookmark") return d3.rgb(getNodeColor(d.type, d.group)).darker(0.8).toString();
        return d3.rgb(getNodeColor(d.type, d.group)).darker(0.5).toString();
      })
      .attr("stroke-width", d => d.type === "bookmark" ? 2 : 1.5);
    
    // Add labels to nodes selectively (to avoid crowding)
    node.filter(d => d.type === "tag" || d.type === "domain")
      .append("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name)
      .attr("font-size", d => d.type === "tag" ? 10 : 11)
      .attr("fill", "#4B5563");
    
    // Add hover labels for bookmark nodes
    node.filter(d => d.type === "bookmark")
      .append("title")
      .text(d => d.name);
    
    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source ? source.x : 0;
        })
        .attr("y1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source ? source.y : 0;
        })
        .attr("x2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target ? target.x : 0;
        })
        .attr("y2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target ? target.y : 0;
        });
      
      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Setup zoom functionality
    initializeZoom();
    
    // Center graph after simulation stabilizes
    simulation.on("end", () => {
      setTimeout(() => {
        centerGraph(nodes);
      }, 100);
    });
    
    // Mark graph as initialized
    graphInitializedRef.current = true;
    
    // Return cleanup function
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [bookmarks, insightLevel, generateGraphData, getLinkColor, getNodeColor, 
      initializeZoom, centerGraph, handleNodeClick, handleNodeHover, dragstarted, dragged, dragended]);
  
  // Update graph data when bookmarks or insight level changes
  const updateGraphData = useCallback(() => {
    if (!simulationRef.current || !graphInitializedRef.current || !bookmarks.length) return;
    
    // Save positions of existing nodes to preserve layout when possible
    const currentPositions = new Map<string, { x: number, y: number, fx: number | null, fy: number | null }>();
    if (simulationRef.current) {
      simulationRef.current.nodes().forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          currentPositions.set(node.id, {
            x: node.x,
            y: node.y,
            fx: node.fx || null,
            fy: node.fy || null
          });
        }
      });
    }
    
    // Generate new graph data
    const newGraphData = generateGraphData(bookmarks, insightLevel);
    
    // Apply saved positions to new nodes
    newGraphData.nodes.forEach(node => {
      const savedPos = currentPositions.get(node.id);
      if (savedPos) {
        node.x = savedPos.x;
        node.y = savedPos.y;
        node.fx = savedPos.fx;
        node.fy = savedPos.fy;
      }
    });
    
    // Store the updated graph data
    graphDataRef.current = newGraphData;
    
    // Stop the simulation first
    simulationRef.current.stop();
    
    // Create a fresh simulation with the same configuration
    const width = containerRef.current!.clientWidth;
    const height = containerRef.current!.clientHeight;
    
    // Initialize positions for any new nodes with adaptive spacing
    const nodeCount = newGraphData.nodes.length;
    
    // Adaptive layout based on node count
    // For very few nodes, use a tighter, more centered layout
    const useCompactLayout = nodeCount <= 10;
    
    // Calculate radius based on node count - smaller radius for fewer nodes
    const radiusScale = useCompactLayout ? 
      Math.max(0.15, Math.min(0.25, nodeCount / 30)) : // Small circle for few nodes
      Math.max(0.25, Math.min(0.4, nodeCount / 50));   // Larger circle for many nodes
    
    const radius = Math.min(width, height) * radiusScale;
    
    // Reset fixed positions if we have very few nodes to allow better arrangement
    if (useCompactLayout) {
      newGraphData.nodes.forEach(node => {
        // Keep some nodes fixed but let others float freely for better spacing with few nodes
        if (node.type !== "tag" && node.type !== "domain") {
          node.fx = null;
          node.fy = null;
        }
      });
    }
    
    // Now position any new nodes
    newGraphData.nodes.forEach((node, i) => {
      // If it's a new node without position
      if (node.x === undefined || node.y === undefined) {
        // Set initial positions in a circular layout
        const angle = (i / nodeCount) * 2 * Math.PI;
        node.x = width / 2 + radius * Math.cos(angle);
        node.y = height / 2 + radius * Math.sin(angle);
      }
      
      // Pin tag and domain nodes for stability
      // If few nodes, pin fewer to allow more natural arrangement
      if ((node.type === "tag" || node.type === "domain")) {
        if (useCompactLayout) {
          // For few nodes, don't pin everything, but use softer constraints
          if (i % 2 === 0) { // Pin only some nodes when few
            node.fx = node.x;
            node.fy = node.y;
          }
        } else {
          // For many nodes, pin all tags and domains for stability
          node.fx = node.x;
          node.fy = node.y;
        }
      }
    });

    // If we have a small number of nodes (filtered view), use a completely different physics setup
    const isFilteredView = newGraphData.nodes.length <= 10;
    
    if (isFilteredView) {
      // For filtered views, use a deterministic arrangement instead of physics simulation
      // This completely bypasses the force layout for small node counts
      
      const centerX = width / 2;
      const centerY = height / 2;
      const nodeCount = newGraphData.nodes.length;
      
      if (nodeCount <= 7) {
        // Circular arrangement for very small node sets
        const radius = 100; // Increased radius for better node separation
        
        newGraphData.nodes.forEach((node, i) => {
          // First node goes at the center
          if (i === 0) {
            node.x = centerX;
            node.y = centerY;
            // Fix this node in place
            node.fx = centerX;
            node.fy = centerY;
          } else {
            // Arrange other nodes in a perfect circle
            const angle = 2 * Math.PI * (i - 1) / (nodeCount - 1);
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
            // Fix these nodes in place too
            node.fx = node.x;
            node.fy = node.y;
          }
        });
        
        // Use minimal forces just to maintain the fixed positions
        simulationRef.current
          .nodes(newGraphData.nodes)
          .force("link", d3.forceLink<GraphNode, GraphLink>(newGraphData.links)
            .id(d => d.id)
            .distance(10)
            .strength(0)) // Zero strength as positions are fixed
          .force("charge", null) // No charge forces
          .force("center", null) // No centering force
          .force("x", null) // No X force
          .force("y", null) // No Y force
          .force("collision", null); // No collision force
      } else {
        // Grid arrangement for larger filtered sets
        // Calculate grid dimensions
        const gridSize = Math.ceil(Math.sqrt(nodeCount));
        const cellSize = 80; // Increased space between nodes for better visibility
        const gridWidth = gridSize * cellSize;
        const startX = centerX - gridWidth / 2 + cellSize / 2;
        const startY = centerY - gridWidth / 2 + cellSize / 2;
        
        // Position nodes in a grid
        newGraphData.nodes.forEach((node, i) => {
          const row = Math.floor(i / gridSize);
          const col = i % gridSize;
          node.x = startX + col * cellSize;
          node.y = startY + row * cellSize;
          // Fix all nodes in place
          node.fx = node.x;
          node.fy = node.y;
        });
        
        // Use minimal forces just to maintain the fixed positions
        simulationRef.current
          .nodes(newGraphData.nodes)
          .force("link", d3.forceLink<GraphNode, GraphLink>(newGraphData.links)
            .id(d => d.id)
            .distance(10)
            .strength(0)) // Zero strength as positions are fixed
          .force("charge", null) // No charge forces
          .force("center", null) // No centering force
          .force("x", null) // No X force
          .force("y", null) // No Y force
          .force("collision", null); // No collision force
      }
    } else {
      // NORMAL (UNFILTERED) VIEW PHYSICS - Standard force configuration
      
      // IMPORTANT: Remove all fixed positions (fx/fy) from nodes when filters are removed
      // This allows them to rejoin the natural layout pattern
      newGraphData.nodes.forEach(node => {
        // Release any fixed positions to allow nodes to naturally position in the layout
        if ('fx' in node) node.fx = null;
        if ('fy' in node) node.fy = null;
      });
      
      simulationRef.current
        .nodes(newGraphData.nodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(newGraphData.links)
          .id(d => d.id)
          .distance(d => {
            // Normal distances for larger node counts
            if (d.type === "domain") return 80;
            if (d.type === "tag") return 100;
            if (d.type === "related") return 60;
            return 70;
          })
          .strength(0.2))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1))
        .force("x", d3.forceX(width / 2).strength(0.05))
        .force("y", d3.forceY(height / 2).strength(0.05))
        .force("collision", d3.forceCollide().radius(d => {
          // Normal collision radius for larger node counts
          if (d.type === "bookmark") return 40;
          if (d.type === "domain") return 30;
          if (d.type === "tag") return 25;
          return 20;
        }).strength(0.8));
    }
    
    // Update visuals
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoomContainer = svg.select("g.zoom-container");
    
    // Clear existing elements
    zoomContainer.select("g.links").selectAll("*").remove();
    zoomContainer.select("g.nodes").selectAll("*").remove();
    
    // Create links with visual distinctions
    const linkGroup = zoomContainer.select("g.links");
    const nodeGroup = zoomContainer.select("g.nodes");
    
    const link = linkGroup
      .selectAll("line")
      .data(newGraphData.links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", d => getLinkColor(d.type))
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke-opacity", 0.6)
      .attr("id", d => `link-${d.id}`);
    
    // Create node groups
    const node = nodeGroup
      .selectAll(".node")
      .data(newGraphData.nodes)
      .enter()
      .append("g")
      .attr("class", d => `node node-${d.type}`)
      .attr("id", d => `node-${d.id}`)
      .style("cursor", "pointer")
      .on("click", function(event, d) { handleNodeClick(event, d); })
      .on("mouseover", function(event, d) { handleNodeHover(event, d, true); })
      .on("mouseout", function(event, d) { handleNodeHover(event, d, false); })
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );
    
    // Add circles to nodes
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
      .attr("stroke", d => {
        if (d.type === "bookmark") return d3.rgb(getNodeColor(d.type, d.group)).darker(0.8).toString();
        return d3.rgb(getNodeColor(d.type, d.group)).darker(0.5).toString();
      })
      .attr("stroke-width", d => d.type === "bookmark" ? 2 : 1.5);
    
    // Add labels to nodes selectively (to avoid crowding)
    node.filter(d => d.type === "tag" || d.type === "domain")
      .append("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name)
      .attr("font-size", d => d.type === "tag" ? 10 : 11)
      .attr("fill", "#4B5563");
    
    // Add hover labels for bookmark nodes
    node.filter(d => d.type === "bookmark")
      .append("title")
      .text(d => d.name);
    
    // Update positions on each tick
    simulationRef.current.on("tick", () => {
      link
        .attr("x1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source ? source.x : 0;
        })
        .attr("y1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source ? source.y : 0;
        })
        .attr("x2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target ? target.x : 0;
        })
        .attr("y2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target ? target.y : 0;
        });
      
      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Restart with a higher alpha for better stabilization
    simulationRef.current.alpha(0.5).restart();
    
    // Center the graph after data update (with a longer delay to allow simulation to stabilize)
    setTimeout(() => {
      centerGraph(newGraphData.nodes);
    }, 300);
    
  }, [bookmarks, insightLevel, generateGraphData, centerGraph, getLinkColor, 
      getNodeColor, handleNodeClick, handleNodeHover, dragstarted, dragged, dragended]);

  // Listen for external node selection
  useEffect(() => {
    const handleSelectNode = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.nodeId) return;
      
      const nodeId = customEvent.detail.nodeId;
      
      // Update visual selection
      setSelectedNode(nodeId);
      
      // Center the graph on the selected node
      centerOnNode(nodeId);
    };
    
    // Add event listener
    document.addEventListener('selectGraphNode', handleSelectNode);
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode);
    };
  }, [centerOnNode]);
  
  // Update selected node visually without redrawing graph
  useEffect(() => {
    updateSelectedNode(selectedNode);
  }, [selectedNode, updateSelectedNode]);

  // Initialize graph on first render
  useEffect(() => {
    const cleanup = initializeGraph();
    return cleanup;
  }, [initializeGraph]);
  
  // Update graph when bookmarks or insight level changes
  // Using a ref to avoid re-recreating the entire graph
  useEffect(() => {
    if (graphInitializedRef.current) {
      updateGraphData();
    }
  }, [bookmarks, insightLevel, updateGraphData]);

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {/* Tooltip container for hover info */}
      <div 
        id="tooltip" 
        className="absolute bg-white p-2 rounded-md shadow-md text-sm pointer-events-none opacity-0 transition-opacity z-50 max-w-xs"
      />
      
      <svg 
        ref={svgRef} 
        className="w-full h-full"
      />
    </div>
  );
}