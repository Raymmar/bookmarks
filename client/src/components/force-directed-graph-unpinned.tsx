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
  onTagClick?: (tagName: string) => void;
  onDomainClick?: (domainName: string) => void;
  selectedBookmarkId?: string | null;
}

export function ForceDirectedGraph({ bookmarks, insightLevel, onNodeClick, onTagClick, onDomainClick, selectedBookmarkId }: ForceDirectedGraphProps): JSX.Element {
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
      // Determine group based on system_tags or source if no tags
      // Note: user_tags have been migrated to a normalized tag system
      const primaryTag = bookmark.system_tags?.[0] || bookmark.source;
      
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
      // Tags come from bookmark.tags in the normalized system
      const allTags = bookmark.tags ? bookmark.tags.map(tag => tag.name) : [];
      // Also include system tags as a fallback
      if (bookmark.system_tags) {
        bookmark.system_tags.forEach(tag => {
          if (!allTags.includes(tag)) {
            allTags.push(tag);
          }
        });
      }
      
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
        // Extract tag names from normalized tag objects
        const tagsA: string[] = [];
        if (bookmarkA.tags) {
          bookmarkA.tags.forEach(tag => tagsA.push(tag.name));
        }
        if (bookmarkA.system_tags) {
          bookmarkA.system_tags.forEach(tag => {
            if (!tagsA.includes(tag)) {
              tagsA.push(tag);
            }
          });
        }
        
        const tagsB: string[] = [];
        if (bookmarkB.tags) {
          bookmarkB.tags.forEach(tag => tagsB.push(tag.name));
        }
        if (bookmarkB.system_tags) {
          bookmarkB.system_tags.forEach(tag => {
            if (!tagsB.includes(tag)) {
              tagsB.push(tag);
            }
          });
        }
        
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
    
  // Determine node color based on type
  const getNodeColor = useCallback((type: string, group: number) => {
    switch (type) {
      case "bookmark": 
        // All bookmarks are black
        return "#000000";
      case "related": return "#F59E0B"; // Orange
      case "domain": return "#3B82F6"; // Blue
      case "tag": return "#10B981"; // Green
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
    // We'll still set fx/fy to null to allow nodes to move naturally
    event.subject.fx = null;
    event.subject.fy = null;
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
      
      centerGraph(nodesToCenter);
    }
  }, [centerGraph]);

  // Update the selected node visually without redrawing the graph
  const updateSelectedNode = useCallback((selectedNodeId: string | null) => {
    if (!svgRef.current) return;
    
    // Reset all nodes to normal appearance
    d3.select(svgRef.current)
      .selectAll(".node circle")
      .attr("stroke-width", d => d.type === "bookmark" ? 2 : 1.5);
    
    // Highlight the selected node
    if (selectedNodeId) {
      d3.select(svgRef.current)
        .select(`#node-${selectedNodeId} circle`)
        .attr("stroke-width", 4);
    }
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    event.stopPropagation();
    
    // For bookmark nodes, notify parent
    if (d.type === "bookmark" && d.bookmarkId) {
      onNodeClick(d.bookmarkId);
      setSelectedNode(d.id);
    } else if (d.type === "related" && d.url) {
      // For related nodes, open the URL in a new tab
      window.open(d.url, "_blank");
    } else if (d.type === "tag") {
      // For tag nodes, center the graph on this node and notify parent
      setSelectedNode(d.id);
      centerOnNode(d.id);
      // Extract just the tag name without the "tag-" prefix
      if (onTagClick && d.name) {
        onTagClick(d.name);
      }
    } else if (d.type === "domain") {
      // For domain nodes, center the graph on this node and notify parent
      setSelectedNode(d.id);
      centerOnNode(d.id);
      if (onDomainClick && d.name) {
        onDomainClick(d.name);
      }
    }
  }, [onNodeClick, onTagClick, onDomainClick, centerOnNode]);

  // Handle node hover
  const handleNodeHover = useCallback((event: MouseEvent, d: GraphNode, isHovering: boolean) => {
    if (!svgRef.current) return;
    
    const tooltip = document.getElementById("tooltip");
    if (!tooltip) return;
    
    if (isHovering) {
      // Prepare tooltip content based on node type
      let content = "";
      
      switch (d.type) {
        case "bookmark":
          content = `<div class="font-semibold text-sm mb-1">${d.name}</div>`;
          if (d.url) {
            content += `<div class="text-xs text-gray-500 truncate">${d.url}</div>`;
          }
          break;
        case "tag":
          content = `<div class="font-semibold text-sm mb-1">Tag: ${d.name}</div>`;
          content += `<div class="text-xs text-gray-500">Click to focus on related bookmarks</div>`;
          break;
        case "domain":
          content = `<div class="font-semibold text-sm mb-1">Domain: ${d.name}</div>`;
          content += `<div class="text-xs text-gray-500">Click to focus on related bookmarks</div>`;
          break;
        case "related":
          content = `<div class="font-semibold text-sm mb-1">Related: ${d.name}</div>`;
          if (d.url) {
            content += `<div class="text-xs text-gray-500 truncate">${d.url}</div>`;
          }
          content += `<div class="text-xs text-gray-500">Click to open link</div>`;
          break;
      }
      
      // Set tooltip content
      tooltip.innerHTML = `<div class="text-xs uppercase text-gray-400 font-semibold mb-1">Node Information</div>${content}`;
      
      // Position tooltip near mouse but ensure it stays within viewport
      const containerRect = containerRef.current!.getBoundingClientRect();
      const nodeRect = (event.target as SVGCircleElement).getBoundingClientRect();
      
      const tooltipX = Math.min(
        containerRect.width - tooltip.offsetWidth - 10,
        Math.max(10, nodeRect.right - containerRect.left + 10)
      );
      
      const tooltipY = Math.min(
        containerRect.height - tooltip.offsetHeight - 10,
        Math.max(10, nodeRect.top - containerRect.top - tooltip.offsetHeight / 2)
      );
      
      tooltip.style.transform = `translate(${tooltipX}px, ${tooltipY}px)`;
      tooltip.style.opacity = "1";
      
      // Highlight connected links
      const svg = d3.select(svgRef.current);
      
      // Dim all links
      svg.selectAll(".link")
        .style("opacity", 0.3);
      
      // Highlight connected links
      svg.selectAll(".link")
        .filter(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return sourceId === d.id || targetId === d.id;
        })
        .style("opacity", 1);
      
      // Highlight the hovered node
      d3.select(event.currentTarget as Element)
        .select("circle")
        .style("stroke-width", d.type === "bookmark" ? 3 : 2.5);
      
    } else {
      // Reset tooltip
      tooltip.style.opacity = "0";
      
      // Reset all links
      d3.select(svgRef.current)
        .selectAll(".link")
        .style("opacity", 0.6);
      
      // Reset node appearance (except selected node)
      d3.select(event.currentTarget as Element)
        .select("circle")
        .style("stroke-width", d => {
          if (selectedNode === d.id) return 4;
          return d.type === "bookmark" ? 2 : 1.5;
        });
    }
  }, [selectedNode]);

  // Initialize the graph
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return () => {};
    
    const svg = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Clear previous content
    svg.selectAll("*").remove();
    
    // Add a zoom container for all graph elements
    const zoomContainer = svg.append("g")
      .attr("class", "zoom-container");
    
    // Create groups for links and nodes (ordering matters for z-index)
    zoomContainer.append("g")
      .attr("class", "links");
    
    zoomContainer.append("g")
      .attr("class", "nodes");
    
    // Initialize simulation with empty data
    const simulation = d3.forceSimulation<GraphNode, GraphLink>()
      .force("link", d3.forceLink<GraphNode, GraphLink>()
        .id(d => d.id)
        .distance(70))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(40));
    
    simulationRef.current = simulation;
    
    // Initialize zoom behavior
    initializeZoom();
    
    // Set the initial graph data
    graphInitializedRef.current = true;
    
    // Clean up function
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [initializeZoom]);

  // Update graph data without recreating the simulation
  const updateGraphData = useCallback(() => {
    if (!simulationRef.current || !svgRef.current || !containerRef.current) return;
    
    // Generate new graph data
    const newGraphData = generateGraphData(bookmarks, insightLevel);
    graphDataRef.current = newGraphData;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // First preserve existing node positions
    const existingNodes = simulationRef.current.nodes();
    const nodePositions = new Map();
    
    existingNodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        nodePositions.set(node.id, { x: node.x, y: node.y });
      }
    });
    
    // Copy positions to new nodes
    newGraphData.nodes.forEach(node => {
      if (nodePositions.has(node.id)) {
        const pos = nodePositions.get(node.id);
        node.x = pos.x;
        node.y = pos.y;
      }
    });
    
    // Determine node count
    const nodeCount = newGraphData.nodes.length;
    
    // Set initial positions for new nodes and reset fixed positions
    // Now position any new nodes
    newGraphData.nodes.forEach((node, i) => {
      // If it's a new node without position
      if (node.x === undefined || node.y === undefined) {
        // Set initial positions in a simple circular arrangement
        const angle = (i / nodeCount) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.3;
        node.x = width / 2 + radius * Math.cos(angle);
        node.y = height / 2 + radius * Math.sin(angle);
      }
      
      // IMPORTANT: Make sure all nodes are free to move - no fixed positions
      // This ensures fully organic layouts regardless of filter state
      node.fx = null;
      node.fy = null;
    });
    
    // Use the same physics configuration for all graphs, regardless of size
    simulationRef.current
      .nodes(newGraphData.nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(newGraphData.links)
        .id(d => d.id)
        .distance(d => {
          // Adjusted link distances - domain connections are half as long as tag connections
          if (d.type === "domain") return 50; // Shorter connections for domains
          if (d.type === "tag") return 100;   // Longer connections for tags
          if (d.type === "related") return 70;
          return 70;
        })
        .strength(0.2))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(d => {
        // Standard collision radii
        if (d.type === "bookmark") return 40;
        if (d.type === "domain") return 30;
        if (d.type === "tag") return 25;
        return 20;
      }).strength(0.8));
    
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
    
    // Add shapes to nodes with distinct styling based on type
    node.each(function(d) {
      const element = d3.select(this);
      
      if (d.type === "tag") {
        // Tags get a square shape
        element.append("rect")
          .attr("x", -5)
          .attr("y", -5)
          .attr("width", 10)
          .attr("height", 10)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1.5);
      } else if (d.type === "domain") {
        // Domains get a diamond shape
        element.append("polygon")
          .attr("points", "0,-7 7,0 0,7 -7,0")
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1.5);
      } else {
        // Bookmarks and other types get circles
        element.append("circle")
          .attr("r", d.type === "bookmark" ? 8 : 6)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "#ffffff")
          .attr("stroke-width", d.type === "bookmark" ? 2 : 1.5);
      }
    });
    
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
    
    // Only center the graph if no node is currently selected
    // This avoids competing with manual node selection
    setTimeout(() => {
      if (!selectedNode) {
        centerGraph(newGraphData.nodes);
      }
    }, 300);
    
  }, [bookmarks, insightLevel, generateGraphData, centerGraph, getLinkColor, 
      getNodeColor, handleNodeClick, handleNodeHover, dragstarted, dragged, dragended]);

  // Listen for external node selection and tag changes
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
    
    // Handle tag changed events from other components
    const handleTagChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { bookmarkId, tagId, action, tagName } = customEvent.detail;
      
      console.log(`Tag change detected: ${action} tag ${tagId} ${tagName ? `(${tagName})` : ''} to/from bookmark ${bookmarkId}`);
      
      // Force update of the graph data
      if (graphInitializedRef.current && simulationRef.current) {
        // Schedule an update after a slight delay to ensure the server data is refreshed
        setTimeout(() => {
          console.log("Refreshing graph for tag change");
          updateGraphData();
        }, 100);
      }
    };
    
    // Handle centerFullGraph event to reset view when detail is closed
    const handleCenterFullGraph = (event: Event) => {
      // Skip if there is no graph data
      if (!simulationRef.current || !svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
      
      // When event is received, reset the selection state
      setSelectedNode(null);
      
      // Reset visual styling of nodes and links to their default state
      const svg = d3.select(svgRef.current);
      
      // Reset all nodes and links to default appearance
      svg.selectAll('.node')
        .style('opacity', 1)
        .select('circle')
        .attr('stroke-width', (d: any) => d.type === "bookmark" ? 2 : 1.5)
        .attr('stroke', (d: any) => {
          if (d.type === "bookmark") return d3.rgb(getNodeColor(d.type, d.group)).darker(0.8).toString();
          return d3.rgb(getNodeColor(d.type, d.group)).darker(0.5).toString();
        })
        .attr('r', (d: any) => {
          switch (d.type) {
            case "bookmark": return 8;
            case "related": return 6;
            case "domain": return 7;
            case "tag": return 5;
            default: return 6;
          }
        })
        .style('filter', null);
        
      // Reset text labels
      svg.selectAll('.node text')
        .style('opacity', 0.9)
        .style('font-weight', 'normal')
        .style('font-size', '12px');
        
      svg.selectAll('.link')
        .style('opacity', 0.6)
        .attr('stroke-width', (d: any) => Math.sqrt(d.value));
      
      // Get container dimensions
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Create a smooth zoom-out effect
      svg.transition()
        .duration(750) // Longer transition for smoother effect
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(0.9) // Slightly zoomed out to see the whole graph
        );
      
      // After reset, center on all nodes to ensure proper layout
      if (simulationRef.current.nodes().length > 0) {
        setTimeout(() => {
          centerGraph(simulationRef.current.nodes());
        }, 100);
      }
    };
    
    // Add event listeners
    document.addEventListener('selectGraphNode', handleSelectNode);
    document.addEventListener('centerFullGraph', handleCenterFullGraph);
    document.addEventListener('tagChanged', handleTagChanged); // Listen for tag change events
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode);
      document.removeEventListener('centerFullGraph', handleCenterFullGraph);
      document.removeEventListener('tagChanged', handleTagChanged);
    };
  }, [centerOnNode, getNodeColor, centerGraph, updateGraphData]);
  
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
  
  // Effect for handling the selected bookmark
  useEffect(() => {
    if (!selectedBookmarkId || !svgRef.current || !simulationRef.current || !zoomBehaviorRef.current) return;
    
    // Set the selected node in state
    setSelectedNode(selectedBookmarkId);
    
    // Log selected bookmark ID for debugging
    console.log(`Selecting bookmark: ${selectedBookmarkId}`);
    
    // Highlight the selected node and center the graph on it and its connections
    // Important: We need to find the exact node by ID that matches the selected bookmark
    const selectedNode = simulationRef.current.nodes().find(n => n.id === selectedBookmarkId);
    
    if (selectedNode) {
      console.log(`Found node in simulation: ${selectedNode.id}, type: ${selectedNode.type}`);
      
      // Find directly connected nodes for better focus context
      const links = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
      const connectedNodes = simulationRef.current.nodes().filter(n => {
        return links.links().some(link => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return (sourceId === selectedBookmarkId && targetId === n.id) || 
                 (sourceId === n.id && targetId === selectedBookmarkId);
        });
      });
      
      console.log(`Found ${connectedNodes.length} connected nodes`);
      
      // Apply strong zoom effect to focus closely on the selected node
      // We need to ensure the node has valid coordinates - some node types might not
      if (selectedNode.x !== undefined && selectedNode.y !== undefined) {
        // Get container dimensions
        const width = containerRef.current?.clientWidth || 800;
        const height = containerRef.current?.clientHeight || 600;
        
        // Calculate zoom level - higher number means closer zoom
        const zoomLevel = 2.0; 
        
        // Calculate a small offset so the node isn't perfectly centered
        // This helps to show more of its connected nodes in the visible area
        const offsetX = width * 0.05; // 5% offset
        const offsetY = height * 0.05;
        
        // Apply the zoom transformation
        const svg = d3.select(svgRef.current);
        
        console.log(`Zooming to node at (${selectedNode.x.toFixed(2)}, ${selectedNode.y.toFixed(2)}) with level ${zoomLevel}`);
        
        // Create a transition for smoother zoom effect
        svg.transition()
          .duration(500) // Half-second transition
          .call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity
              .translate(width / 2 - selectedNode.x * zoomLevel + offsetX, 
                        height / 2 - selectedNode.y * zoomLevel + offsetY)
              .scale(zoomLevel)
          );
      } else {
        // Fallback to standard centering if coordinates aren't available
        console.log("Node coordinates not defined, using centerGraph fallback");
        centerGraph([selectedNode, ...connectedNodes]);
      }
      
      // Reset all nodes to default appearance first
      d3.select(svgRef.current)
        .selectAll('.node')
        .style('opacity', 0.4) // Dim all nodes more dramatically 
        .select('circle')
        .attr('stroke-width', 1.5)
        .attr('r', (d: any) => d.type === "bookmark" ? 7 : 5);
        
      // Highlight connected nodes with medium emphasis
      d3.select(svgRef.current)
        .selectAll('.node')
        .filter((d: any) => {
          // Check if this node is connected to the selected node
          return connectedNodes.some(n => n.id === d.id);
        })
        .style('opacity', 0.9)
        .select('circle')
        .attr('stroke-width', 2)
        .attr('r', (d: any) => d.type === "bookmark" ? 9 : 7);
      
      // Visually highlight the selected node with very strong emphasis
      const selectedNodeElement = d3.select(svgRef.current).select(`#node-${selectedBookmarkId}`);
      
      if (!selectedNodeElement.empty()) {
        selectedNodeElement
          .style('opacity', 1)
          .raise() // Bring to front
          .select('circle')
          .attr('stroke-width', 4)
          .attr('stroke', '#3b82f6') // Blue highlight border
          .attr('r', (d: any) => d.type === "bookmark" ? 18 : 14) // Make MUCH larger (2x+)
          .style('filter', 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.8))'); // Stronger glow effect
          
        // Also highlight the label - make it visible and larger
        selectedNodeElement
          .select('text')
          .style('opacity', 1)
          .style('font-weight', 'bold')
          .style('font-size', '14px'); // Larger font
      } else {
        console.warn(`Could not find node element with ID: node-${selectedBookmarkId}`);
      }
        
      // Also highlight the directly connected links
      d3.select(svgRef.current)
        .selectAll('.link')
        .style('opacity', 0.1); // Dim all links more dramatically
        
      d3.select(svgRef.current)
        .selectAll('.link')
        .filter((d: any) => {
          const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
          const targetId = typeof d.target === 'string' ? d.target : d.target.id;
          return sourceId === selectedBookmarkId || targetId === selectedBookmarkId;
        })
        .style('opacity', 1)
        .attr('stroke-width', (d: any) => d.value + 2) // Make connected links much thicker
        .raise(); // Bring links to front
    } else {
      console.warn(`Could not find node with ID: ${selectedBookmarkId}`);
    }
    
    // Create a cleanup function
    return () => {
      // If the component is still mounted and the svg ref exists
      if (svgRef.current) {
        // Reset all nodes and links to default appearance
        d3.select(svgRef.current).selectAll('.node')
          .style('opacity', 1)
          .select('circle')
          .attr('stroke-width', 1.5)
          .attr('stroke', '#999')
          .attr('r', (d: any) => d.type === "bookmark" ? 7 : 5)
          .style('filter', null);
          
        // Reset text labels
        d3.select(svgRef.current).selectAll('.node text')
          .style('opacity', 0.9)
          .style('font-weight', 'normal')
          .style('font-size', '12px');
          
        d3.select(svgRef.current).selectAll('.link')
          .style('opacity', 0.6)
          .attr('stroke-width', (d: any) => d.value);
      }
    };
  }, [selectedBookmarkId, centerGraph]);

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {/* Node info panel - fixed position in bottom left corner */}
      <div 
        id="tooltip" 
        className="absolute bottom-4 left-4 bg-white p-3 rounded-md shadow-lg text-sm pointer-events-none opacity-1 transition-opacity z-50 min-w-[200px] border border-gray-200 text-left"
      >
        <div className="text-xs uppercase text-gray-400 font-semibold mb-1">Node Information</div>
        <div className="text-sm text-gray-500">Hover over a node to see details</div>
      </div>
      
      <svg 
        ref={svgRef} 
        className="w-full h-full"
      />
    </div>
  );
}