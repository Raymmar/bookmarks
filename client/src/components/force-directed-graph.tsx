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

interface ForceDirectedGraphProps {
  bookmarks: Bookmark[];
  insightLevel: number;
  onNodeClick: (bookmarkId: string) => void;
}

export function ForceDirectedGraph({ bookmarks, insightLevel, onNodeClick }: ForceDirectedGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [graphInitialized, setGraphInitialized] = useState(false);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  
  // Memoize bookmarksKey to detect when bookmarks array actually changes
  const bookmarksKey = useMemo(() => {
    return bookmarks.map(b => b.id).sort().join(',') + '-' + insightLevel;
  }, [bookmarks, insightLevel]);
  
  // Extract domain from URL
  const getDomain = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // Return a fallback for invalid URLs
      return url.split('/')[0];
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
  }, [getDomain]);

  // Handle the zoom behavior
  const initializeZoom = useCallback(() => {
    if (!svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        const g = svg.select("g.zoom-container");
        if (!g.empty()) {
          g.attr("transform", event.transform);
        }
      });
    
    svg.call(zoomBehavior);
    
    // Initial zoom to fit
    svg.call(zoomBehavior.translateTo, 0, 0);
  }, []);

  // Function to center the graph on all visible nodes
  const centerGraphOnVisibleNodes = useCallback(() => {
    if (!svgRef.current || !nodesRef.current.length) return;
    
    const svg = d3.select(svgRef.current);
    const width = containerRef.current?.clientWidth || 0;
    const height = containerRef.current?.clientHeight || 0;
    
    if (width === 0 || height === 0) {
      // Container not fully loaded yet, try again later
      setTimeout(centerGraphOnVisibleNodes, 100);
      return;
    }
    
    // Get the current zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>();
    
    // Create a transition for smooth animation
    const transition = svg.transition().duration(750);
    
    // Calculate the bounding box of all nodes
    const nodes = nodesRef.current;
    
    // If there are fewer than 2 nodes, just center on the first node
    if (nodes.length === 1) {
      const node = nodes[0];
      const x = width / 2 - (node.x || 0);
      const y = height / 2 - (node.y || 0);
      
      svg.transition(transition)
        .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(1));
      return;
    }
    
    // For multiple nodes, find the centroid and bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;
    
    // Count nodes with valid positions
    let validNodeCount = 0;
    
    // First check if the simulation has assigned positions
    let hasPositions = false;
    
    for (let i = 0; i < Math.min(5, nodes.length); i++) {
      if (nodes[i].x !== undefined && nodes[i].y !== undefined) {
        hasPositions = true;
        break;
      }
    }
    
    // If positions aren't assigned yet, wait for the simulation to run more
    if (!hasPositions && simulationRef.current) {
      // Ensure the simulation is running
      simulationRef.current.alpha(0.3).restart();
      
      // Try again after a short delay
      setTimeout(centerGraphOnVisibleNodes, 200);
      return;
    }
    
    // Get bookmark nodes specifically to weigh them more in the centering
    const bookmarkNodes = nodes.filter(node => node.type === "bookmark");
    const nodesForCentering = bookmarkNodes.length > 0 ? bookmarkNodes : nodes;
    
    nodesForCentering.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
        sumX += node.x;
        sumY += node.y;
        validNodeCount++;
      }
    });
    
    // If no valid positions yet, retry later
    if (validNodeCount === 0) {
      setTimeout(centerGraphOnVisibleNodes, 200);
      return;
    }
    
    // Calculate the centroid
    const centerX = sumX / validNodeCount;
    const centerY = sumY / validNodeCount;
    
    // Calculate the bounding box width and height
    const boxWidth = Math.max(maxX - minX, 10); // Prevent division by zero
    const boxHeight = Math.max(maxY - minY, 10); // Prevent division by zero
    
    // Calculate the scale to fit the bounding box with some padding
    const padding = Math.max(width, height) * 0.1; // 10% of the larger dimension as padding
    const scaleX = width / (boxWidth + padding * 2);
    const scaleY = height / (boxHeight + padding * 2);
    
    // Use the smaller scale to ensure everything fits, with min/max constraints
    const maxScale = 2.0; // Don't zoom in too much
    const minScale = 0.5; // Don't zoom out too much
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), minScale), maxScale);
    
    // Calculate translation to center the centroid
    const x = width / 2 - centerX * scale;
    const y = height / 2 - centerY * scale;
    
    // Apply the transform with transition
    svg.transition(transition)
      .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
      
    // Log for debugging
    console.log(`Graph centered: ${validNodeCount} nodes, scale: ${scale.toFixed(2)}, center: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
  }, []);
  
  // Initialize or reinitialize the graph
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Use the nodes and links from our refs
    const nodes = nodesRef.current;
    const links = linksRef.current;
    
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
    
    // Determine link color based on type
    const getLinkColor = (type: string) => {
      switch (type) {
        case "tag": return "#8B5CF6"; // Purple for tag connections
        case "domain": return "#10B981"; // Green for domain connections
        case "related": return "#F59E0B"; // Orange for related content
        case "content": return "#EF4444"; // Red for content similarity
        default: return "#d1d5db"; // Gray default
      }
    };
    
    // Determine node color based on type and group
    const getNodeColor = (type: string, group: number) => {
      switch (type) {
        case "bookmark": 
          // Use a color scale based on group
          return d3.schemeCategory10[group % 10];
        case "related": return "#F59E0B"; // Orange
        case "domain": return "#10B981"; // Green
        case "tag": return "#8B5CF6"; // Purple
        default: return "#4F46E5"; // Blue default
      }
    };
    
    // Create the force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        // Adjust link distance by type
        if (d.type === "domain") return 80;
        if (d.type === "tag") return 100;
        if (d.type === "related") return 60;
        return 70;
      }))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => {
        // Adjust node size based on type
        if (d.type === "bookmark") return 40;
        if (d.type === "domain") return 30;
        return 20;
      }));
    
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
      .on("click", function(event, d) {
        event.stopPropagation();
        
        // Highlight this node
        setSelectedNode(d.id);
        
        // Center this node in the viewport
        if (svgRef.current) {
          const svg = d3.select(svgRef.current);
          const width = containerRef.current?.clientWidth || 0;
          const height = containerRef.current?.clientHeight || 0;
          
          // Get the zoom behavior
          const zoom = d3.zoom<SVGSVGElement, unknown>();
          
          // Create a transition for smooth animation
          const transition = svg.transition().duration(750);
          
          // Calculate the transform to center the node
          const scale = d3.zoomTransform(svg.node() as Element).k; // Keep current zoom level
          const x = width / 2 - (d.x || 0) * scale;
          const y = height / 2 - (d.y || 0) * scale;
          
          // Apply the transform with transition
          svg.transition(transition)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
        }
        
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
      .on("dblclick", function(event, d) {
        event.stopPropagation();
        
        // Zoom in on this node
        if (svgRef.current) {
          const svg = d3.select(svgRef.current);
          const width = containerRef.current?.clientWidth || 0;
          const height = containerRef.current?.clientHeight || 0;
          
          // Get the zoom behavior
          const zoom = d3.zoom<SVGSVGElement, unknown>();
          
          // Create a transition for smooth animation
          const transition = svg.transition().duration(750);
          
          // Calculate the transform to center and zoom on the node
          // Use a higher zoom level (2.5x) for double click
          const zoomLevel = 2.5;
          const x = width / 2 - (d.x || 0) * zoomLevel;
          const y = height / 2 - (d.y || 0) * zoomLevel;
          
          // Apply the transform with transition
          svg.transition(transition)
            .call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(zoomLevel));
            
          // Prevent the regular click event from firing
          event.preventDefault();
        }
      })
      .on("mouseover", function(event, d) {
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
          connectedNodeIds.add(sourceId);
          connectedNodeIds.add(targetId);
        });
        
        // Dim unrelated nodes and links
        nodeGroup.selectAll(".node")
          .style("opacity", n => connectedNodeIds.has(n.id) || n.id === d.id ? 1 : 0.3);
        
        linkGroup.selectAll("line")
          .style("opacity", l => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
            return sourceId === d.id || targetId === d.id ? 1 : 0.1;
          })
          .style("stroke-width", l => {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
            return sourceId === d.id || targetId === d.id ? Math.sqrt(l.value) * 1.5 : Math.sqrt(l.value);
          });
      })
      .on("mouseout", function() {
        // Reset opacity for all nodes and links
        nodeGroup.selectAll(".node").style("opacity", 1);
        linkGroup.selectAll("line")
          .style("opacity", 0.6)
          .style("stroke-width", d => Math.sqrt(d.value));
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", function(event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", function(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", function(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );
    
    // Add shapes to nodes based on type
    node.each(function(d) {
      const g = d3.select(this);
      const radius = d.type === "bookmark" ? 8 : 6;
      
      if (d.type === "bookmark") {
        // Circle shape for bookmark
        g.append("circle")
          .attr("r", radius)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "white")
          .attr("stroke-width", 1);
      } else if (d.type === "tag") {
        // Square shape for tag
        const size = radius * 1.8;
        g.append("rect")
          .attr("x", -size / 2)
          .attr("y", -size / 2)
          .attr("width", size)
          .attr("height", size)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "white")
          .attr("stroke-width", 1);
      } else if (d.type === "domain") {
        // Diamond shape for domain
        const size = radius * 1.8;
        g.append("polygon")
          .attr("points", `0,-${size/2} ${size/2},0 0,${size/2} -${size/2},0`)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "white")
          .attr("stroke-width", 1);
      } else {
        // Circle for related or other types
        g.append("circle")
          .attr("r", radius)
          .attr("fill", getNodeColor(d.type, d.group))
          .attr("stroke", "white")
          .attr("stroke-width", 1);
      }
      
      // Add tooltip label
      g.append("title")
        .text(d.name);
    });
    
    // Add text labels for primary nodes
    node.filter(d => d.type === "bookmark" || d.type === "tag")
      .append("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name.length > 20 ? d.name.substring(0, 20) + "..." : d.name)
      .style("font-size", "10px")
      .style("font-family", "sans-serif")
      .style("pointer-events", "none")
      .style("fill", "#4b5563");
    
    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => typeof d.source === 'string' ? 
          (nodes.find(n => n.id === d.source)?.x || 0) : 
          (d.source as GraphNode).x || 0)
        .attr("y1", d => typeof d.source === 'string' ? 
          (nodes.find(n => n.id === d.source)?.y || 0) : 
          (d.source as GraphNode).y || 0)
        .attr("x2", d => typeof d.target === 'string' ? 
          (nodes.find(n => n.id === d.target)?.x || 0) : 
          (d.target as GraphNode).x || 0)
        .attr("y2", d => typeof d.target === 'string' ? 
          (nodes.find(n => n.id === d.target)?.y || 0) : 
          (d.target as GraphNode).y || 0);
      
      node.attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    });
    
    // Set up zoom behavior
    initializeZoom();
    
  }, [bookmarks, initializeZoom]);

  // Initialize graph once
  useEffect(() => {
    if (graphInitialized || !svgRef.current || !containerRef.current || !bookmarks.length) return;
    
    // Generate the graph data from bookmarks
    const { nodes, links } = generateGraphData(bookmarks, insightLevel);
    
    // Store nodes and links for future reference
    nodesRef.current = nodes;
    linksRef.current = links;
    
    // Initialize the graph
    initializeGraph();
    
    // After the graph is initialized, run the simulation for a bit to improve layout
    if (simulationRef.current) {
      simulationRef.current
        .alpha(0.5) // Restart simulation with decent alpha value
        .restart();
        
      // Setup a timer to run the simulation actively for a bit
      const tick = () => {
        simulationRef.current?.tick();
      };
      
      // Run 100 steps of the simulation immediately
      for (let i = 0; i < 100; i++) {
        tick();
      }
      
      // Mark as initialized and trigger centering 
      setTimeout(() => {
        setGraphInitialized(true);
        centerGraphOnVisibleNodes();
      }, 300);
    } else {
      // If no simulation, just mark as initialized
      setGraphInitialized(true);
    }
    
  }, [bookmarks, insightLevel, generateGraphData, graphInitialized, centerGraphOnVisibleNodes, initializeGraph]);

  // Only rebuild the graph when bookmarks actually change (not just selections)
  useEffect(() => {
    if (!graphInitialized || !svgRef.current || !containerRef.current) return;
    
    // Only rebuild the graph if the bookmarks or insight level has changed
    const { nodes, links } = generateGraphData(bookmarks, insightLevel);
    
    // Update our refs
    nodesRef.current = nodes;
    linksRef.current = links;
    
    // Only rebuild the entire graph when the underlying data changes
    initializeGraph();
    
    // After the graph is rendered, wait for the simulation to settle a bit
    // Then center on the visible nodes
    let attempts = 0;
    const maxAttempts = 10;
    const attemptCentering = () => {
      attempts++;
      
      if (simulationRef.current && simulationRef.current.alpha() > 0.05 && attempts < maxAttempts) {
        // Simulation still running, wait longer
        setTimeout(attemptCentering, 300);
      } else {
        // Simulation settled or max attempts reached, center the graph
        centerGraphOnVisibleNodes();
      }
    };
    
    // Start the centering attempts after a short initial delay
    setTimeout(attemptCentering, 500);
    
  }, [bookmarksKey, generateGraphData, graphInitialized, centerGraphOnVisibleNodes, initializeGraph]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full rounded-lg"
        style={{ background: "#f9fafb" }}
      />
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
        <div className="flex items-center mb-1">
          <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
          <span>Related</span>
        </div>
        <div className="text-xs mt-2 pt-2 border-t border-gray-200">
          <div>Click: Select node</div>
          <div>Double-click: Zoom in</div>
          <div>Drag: Move node</div>
        </div>
      </div>
    </div>
  );
}