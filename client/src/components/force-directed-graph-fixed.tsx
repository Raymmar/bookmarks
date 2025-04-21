import { useCallback, useEffect, useRef, useState } from "react";
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
  onTagClick?: (tag: string) => void;
  onDomainClick?: (domain: string) => void;
}

export function ForceDirectedGraph({ bookmarks, insightLevel, onNodeClick, onTagClick, onDomainClick }: ForceDirectedGraphProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
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
  
  // Generate graph data from bookmarks
  const generateGraphData = useCallback((bookmarks: Bookmark[], insightLevel: number): GraphData => {
    const data: GraphData = { nodes: [], links: [] };
    const existingNodeIds = new Set<string>();
    const existingLinkIds = new Set<string>();
    
    // Helper to generate a deterministic ID from two node IDs
    const generateLinkId = (source: string, target: string, type: string): string => {
      return source < target ? `${source}-${target}-${type}` : `${target}-${source}-${type}`;
    };
    
    // Add bookmark nodes
    bookmarks.forEach((bookmark, index) => {
      // Add the bookmark node
      const bookmarkNode: GraphNode = {
        id: `bookmark-${bookmark.id}`,
        name: bookmark.title,
        group: 1,
        type: "bookmark",
        bookmarkId: bookmark.id,
        url: bookmark.url
      };
      
      if (!existingNodeIds.has(bookmarkNode.id)) {
        data.nodes.push(bookmarkNode);
        existingNodeIds.add(bookmarkNode.id);
      }
      
      // Add domain node
      const domain = getDomain(bookmark.url);
      const domainId = `domain-${domain}`;
      
      if (!existingNodeIds.has(domainId)) {
        data.nodes.push({
          id: domainId,
          name: domain,
          group: 2,
          type: "domain"
        });
        existingNodeIds.add(domainId);
      }
      
      // Link bookmark to domain
      const domainLinkId = generateLinkId(bookmarkNode.id, domainId, "domain");
      if (!existingLinkIds.has(domainLinkId)) {
        data.links.push({
          id: domainLinkId,
          source: bookmarkNode.id,
          target: domainId,
          value: 1,
          type: "domain"
        });
        existingLinkIds.add(domainLinkId);
      }
      
      // Add tags
      const tags = [...(bookmark.user_tags || []), ...(bookmark.system_tags || [])];
      tags.forEach(tag => {
        const tagId = `tag-${tag}`;
        
        if (!existingNodeIds.has(tagId)) {
          data.nodes.push({
            id: tagId,
            name: tag,
            group: 3,
            type: "tag"
          });
          existingNodeIds.add(tagId);
        }
        
        // Link bookmark to tag
        const tagLinkId = generateLinkId(bookmarkNode.id, tagId, "tag");
        if (!existingLinkIds.has(tagLinkId)) {
          data.links.push({
            id: tagLinkId,
            source: bookmarkNode.id,
            target: tagId,
            value: 2,
            type: "tag"
          });
          existingLinkIds.add(tagLinkId);
        }
      });
      
      // Add related links based on insight level
      if (insightLevel > 0 && bookmark.insights && bookmark.insights.related_links) {
        // Only add a subset of related links based on insight level
        const relatedCount = Math.min(insightLevel * 2, bookmark.insights.related_links.length);
        
        for (let i = 0; i < relatedCount; i++) {
          const relatedUrl = bookmark.insights.related_links[i];
          if (!relatedUrl) continue;
          
          // Try to find if this URL matches an existing bookmark
          const existingBookmark = bookmarks.find(b => b.url === relatedUrl);
          
          if (existingBookmark) {
            // If it's an existing bookmark, link to that
            const existingBookmarkId = `bookmark-${existingBookmark.id}`;
            const relatedLinkId = generateLinkId(bookmarkNode.id, existingBookmarkId, "content");
            
            if (!existingLinkIds.has(relatedLinkId)) {
              data.links.push({
                id: relatedLinkId,
                source: bookmarkNode.id,
                target: existingBookmarkId,
                value: 1,
                type: "content"
              });
              existingLinkIds.add(relatedLinkId);
            }
          } else {
            // Add as a separate related node
            // Use the URL as ID but add prefix to avoid collisions
            const relatedId = `related-${encodeURIComponent(relatedUrl)}`;
            
            if (!existingNodeIds.has(relatedId)) {
              // Try to extract a name from the URL
              let name = relatedUrl;
              try {
                const urlObj = new URL(relatedUrl);
                name = urlObj.pathname.split('/').pop() || urlObj.hostname;
                // Clean up the name
                name = name.replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
                // Capitalize first letter
                name = name.charAt(0).toUpperCase() + name.slice(1);
              } catch (e) {
                // Use the URL as is
              }
              
              data.nodes.push({
                id: relatedId,
                name: name,
                group: 4,
                type: "related",
                url: relatedUrl
              });
              existingNodeIds.add(relatedId);
            }
            
            // Link bookmark to related node
            const relatedLinkId = generateLinkId(bookmarkNode.id, relatedId, "related");
            if (!existingLinkIds.has(relatedLinkId)) {
              data.links.push({
                id: relatedLinkId,
                source: bookmarkNode.id,
                target: relatedId,
                value: 1,
                type: "related"
              });
              existingLinkIds.add(relatedLinkId);
            }
          }
        }
      }
    });
    
    return data;
  }, []);
  
  // Get color for nodes
  const getNodeColor = useCallback((type: string, group: number): string => {
    switch (type) {
      case "bookmark": return "#3B82F6"; // Blue
      case "domain": return "#10B981";   // Green
      case "tag": return "#F59E0B";      // Amber
      case "related": return "#8B5CF6";  // Purple
      default: return "#6B7280";         // Gray
    }
  }, []);
  
  // Get color for links
  const getLinkColor = useCallback((type: string): string => {
    switch (type) {
      case "domain": return "#10B981";   // Green
      case "tag": return "#F59E0B";      // Amber
      case "related": return "#8B5CF6";  // Purple
      case "content": return "#EC4899";  // Pink
      default: return "#D1D5DB";         // Light Gray
    }
  }, []);
  
  // Center the graph to show all nodes
  const centerGraph = useCallback((nodes: GraphNode[]) => {
    if (!simulationRef.current || !svgRef.current || !zoomBehaviorRef.current) return;
    
    const width = containerRef.current!.clientWidth;
    const height = containerRef.current!.clientHeight;
    
    // Compute bounds of all nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;
      
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    });
    
    if (minX === Infinity || minY === Infinity) return;
    
    // Add padding
    const padding = 50;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;
    
    // Calculate center and scale
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const boundWidth = maxX - minX;
    const boundHeight = maxY - minY;
    
    const scale = Math.min(
      0.95 * width / boundWidth,
      0.95 * height / boundHeight
    );
    
    // Apply zoom transform
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);
    
    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .call(zoomBehaviorRef.current.transform, transform);
    
    console.log(`Graph centered: ${nodes.length} nodes, scale: ${scale.toFixed(2)}, center: (${Math.round(centerX)}, ${Math.round(centerY)})`);
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
  
  // Center on specific node with optional animation speed control
  const centerOnNode = useCallback((nodeId: string, animationDuration: number = 300) => {
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
      
      // Apply smoother transition with configurable duration
      svg.transition()
        .duration(animationDuration)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, transform);
    }
    
    // Highlight the selected node - with a slight delay to allow smooth transition
    setTimeout(() => {
      updateSelectedNode(nodeId);
    }, 100);
    
  }, [updateSelectedNode]);
  
  // Setup zoom behavior
  const initializeZoom = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        d3.select(svgRef.current)
          .select(".zoom-container")
          .attr("transform", event.transform.toString());
      });
    
    d3.select(svgRef.current)
      .call(zoomBehavior);
    
    // Store reference
    zoomBehaviorRef.current = zoomBehavior;
    
    // Initial zoom level
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(0.8)
      .translate(-width / 2, -height / 2);
    
    d3.select(svgRef.current)
      .call(zoomBehavior.transform, initialTransform);
    
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
    
    // Center the graph on this node with a consistent speed for direct clicks
    centerOnNode(d.id, 300);
    
    if (d.bookmarkId) {
      onNodeClick(d.bookmarkId);
    } else if (d.type === "related" && d.url) {
      // For related nodes, try to find an existing bookmark with this URL
      const matchingBookmark = bookmarks.find(b => b.url === d.url);
      if (matchingBookmark) {
        onNodeClick(matchingBookmark.id);
      }
    } else if (d.type === "tag" && onTagClick) {
      // Extract tag name from the node ID (format is "tag-{tagName}")
      const tagName = d.name;
      onTagClick(tagName);
    } else if (d.type === "domain" && onDomainClick) {
      // Extract domain name from the node ID (format is "domain-{domainName}")
      const domainName = d.name;
      onDomainClick(domainName);
    }
  }, [bookmarks, onNodeClick, onTagClick, onDomainClick, centerOnNode]);
  
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
      
      // Show tooltip with node info in fixed position at bottom left
      d3.select("#tooltip")
        .style("opacity", 1)
        .html(`
          <div>
            <div class="font-medium text-base">${d.name}</div>
            <div class="text-gray-600 text-xs my-1">Type: ${d.type}</div>
            ${d.type === "bookmark" ? `<div class="text-gray-600 text-xs">Bookmark ID: ${d.bookmarkId || 'N/A'}</div>` : ''}
            ${d.url ? `<div class="text-gray-600 text-xs truncate max-w-[300px]">URL: ${d.url}</div>` : ''}
          </div>
        `);
    } else {
      // Reset all opacities on mouseout
      svg.selectAll(".node").attr("opacity", 1);
      svg.selectAll("line").attr("opacity", 0.6);
      
      // Hide tooltip
      d3.select("#tooltip").style("opacity", 0);
    }
  }, []);
  
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
  }, [
    bookmarks, 
    insightLevel, 
    generateGraphData, 
    getLinkColor, 
    getNodeColor, 
    handleNodeClick, 
    handleNodeHover, 
    dragstarted, 
    dragged, 
    dragended, 
    centerGraph, 
    initializeZoom
  ]);
  
  // Update graph data when bookmarks or insight level changes
  const updateGraphData = useCallback((shouldAutocenter: boolean = false) => {
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
    
    // Update the reference
    graphDataRef.current = newGraphData;
    
    // Check if we need filtered layout
    const nodeCount = newGraphData.nodes.length;
    const width = containerRef.current!.clientWidth;
    const height = containerRef.current!.clientHeight;
    
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
          if (d.type === "bookmark") return 30;
          if (d.type === "domain") return 25;
          if (d.type === "tag") return 20;
          return 15;
        }).strength(0.8));
    }
    
    // Update the link elements
    const linkGroup = d3.select(svgRef.current).select(".links");
    
    // Remove old links
    linkGroup.selectAll("line").remove();
    
    // Add new links
    linkGroup
      .selectAll("line")
      .data(newGraphData.links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", d => getLinkColor(d.type))
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke-opacity", 0.6)
      .attr("id", d => `link-${d.id}`);
    
    // Update the node elements
    const nodeGroup = d3.select(svgRef.current).select(".nodes");
    
    // Remove old nodes
    nodeGroup.selectAll(".node").remove();
    
    // Add new nodes
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
    
    // Add circles to the new nodes
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
    
    // Add labels for tags and domains
    node.filter(d => d.type === "tag" || d.type === "domain")
      .append("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name)
      .attr("font-size", d => d.type === "tag" ? 10 : 11)
      .attr("fill", "#4B5563");
    
    // Add hover labels for bookmarks
    node.filter(d => d.type === "bookmark")
      .append("title")
      .text(d => d.name);
    
    // Update the link positions immediately
    const link = linkGroup.selectAll("line");
    
    // Update positions on simulation tick
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
    
    // Only auto-center in certain situations to avoid disrupting user-initiated actions
    if (shouldAutocenter || bookmarks.length <= 10) {
      // For filtered views, we want to zoom in to show the filtered results
      // Or if explicitly requested via shouldAutocenter parameter
      setTimeout(() => {
        if (!selectedNode) {
          console.log("Auto-centering graph due to data change or filter");
          centerGraph(newGraphData.nodes);
        }
      }, 300);
    }
    
  }, [
    bookmarks, 
    insightLevel, 
    generateGraphData, 
    getLinkColor, 
    getNodeColor, 
    handleNodeClick, 
    handleNodeHover, 
    dragstarted, 
    dragged, 
    dragended, 
    centerGraph,
    selectedNode
  ]);
  
  // Listen for external node selection and graph centering events
  useEffect(() => {
    const handleSelectNode = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.nodeId) return;
      
      const nodeId = customEvent.detail.nodeId;
      const source = customEvent.detail.source || 'click';
      
      // Update visual selection
      setSelectedNode(nodeId);
      
      // Center the graph on the selected node
      // Use different animation speeds based on source
      // Tag filtering should be smoother (slower)
      const animationSpeed = source === 'tagFilter' ? 400 : 300;
      centerOnNode(nodeId, animationSpeed);
    };
    
    const handleCenterFullGraph = (event: Event) => {
      const customEvent = event as CustomEvent;
      
      // Reset the graph if it's coming from closeDetail or tagFilter
      // This ensures proper zooming behavior for different user actions
      const validSources = ['closeDetail', 'tagFilter'];
      if (validSources.includes(customEvent.detail?.source)) {
        // Clear selection
        setSelectedNode(null);
        
        // Reset all node styling
        updateSelectedNode(null);
        
        // Center the entire graph with a faster transition
        if (simulationRef.current?.nodes()) {
          // Use a faster duration for immediate feedback
          const nodes = simulationRef.current.nodes();
          
          if (zoomBehaviorRef.current && svgRef.current && containerRef.current) {
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            
            // Compute bounds of all nodes
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            
            nodes.forEach(node => {
              if (node.x === undefined || node.y === undefined) return;
              
              minX = Math.min(minX, node.x);
              maxX = Math.max(maxX, node.x);
              minY = Math.min(minY, node.y);
              maxY = Math.max(maxY, node.y);
            });
            
            if (minX === Infinity || minY === Infinity) return;
            
            // Add padding
            const padding = 50;
            minX -= padding;
            maxX += padding;
            minY -= padding;
            maxY += padding;
            
            // Calculate center and scale
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const boundWidth = maxX - minX;
            const boundHeight = maxY - minY;
            
            const scale = Math.min(
              0.9 * width / boundWidth,
              0.9 * height / boundHeight
            );
            
            // Apply zoom transform with faster transition
            const transform = d3.zoomIdentity
              .translate(width / 2, height / 2)
              .scale(scale)
              .translate(-centerX, -centerY);
            
            console.log("Zooming out - reset graph view");
            
            d3.select(svgRef.current)
              .transition()
              .duration(300) // Consistent 300ms transition for immediate feedback
              .call(zoomBehaviorRef.current.transform, transform);
          }
        }
      }
    };
    
    // Add event listeners
    document.addEventListener('selectGraphNode', handleSelectNode);
    document.addEventListener('centerFullGraph', handleCenterFullGraph);
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode);
      document.removeEventListener('centerFullGraph', handleCenterFullGraph);
    };
  }, [centerOnNode, updateSelectedNode]);
  
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
      // By default, don't auto-center when bookmarks array changes
      // This prevents competing with any active selections or user viewports
      updateGraphData(false);
    }
  }, [bookmarks, insightLevel, updateGraphData]);

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {/* Node info panel - fixed position in bottom left corner */}
      <div 
        id="tooltip" 
        className="absolute bottom-4 left-4 bg-white p-3 rounded-md shadow-lg text-sm pointer-events-none opacity-0 transition-opacity z-50 min-w-[200px] border border-gray-200 text-left"
      >
        <div className="text-xs uppercase text-gray-400 font-semibold mb-1">Node Information</div>
      </div>
      
      <svg 
        ref={svgRef} 
        className="w-full h-full"
      />
    </div>
  );
}