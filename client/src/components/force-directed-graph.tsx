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
    
    // Mark as initialized
    setGraphInitialized(true);
    
  }, [bookmarks, insightLevel, generateGraphData, graphInitialized]);

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
    
  }, [bookmarksKey, generateGraphData, graphInitialized]);
  
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
        // Reset highlights
        nodeGroup.selectAll(".node").style("opacity", 1);
        linkGroup.selectAll("line")
          .style("opacity", 0.6)
          .style("stroke-width", d => Math.sqrt(d.value));
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      );
    
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
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Implement drag behavior
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      // Don't release nodes after drag to maintain layout
      // event.subject.fx = null;
      // event.subject.fy = null;
    }
    
    // Setup zoom functionality
    initializeZoom();
    
  }, [bookmarks, insightLevel, initializeZoom, onNodeClick]);
  
  // Update selected node visual when it changes
  useEffect(() => {
    if (!selectedNode || !svgRef.current || !graphInitialized) return;
    
    const svg = d3.select(svgRef.current);
    
    // Reset all nodes to default size
    svg.selectAll(".node circle, .node rect, .node polygon")
      .attr("r", function() {
        const nodeType = d3.select(this.parentNode).datum() as GraphNode;
        switch (nodeType.type) {
          case "bookmark": return 8;
          case "related": return 6;
          case "domain": return 7; // This won't apply to polygons, but that's fine
          case "tag": return 5; // This won't apply to rects, but that's fine
          default: return 6;
        }
      })
      .attr("stroke-width", function() {
        const nodeType = d3.select(this.parentNode).datum() as GraphNode;
        return nodeType.type === "bookmark" ? 2 : 1.5;
      });
    
    // Highlight the selected node based on its type
    const selectedNodeElem = svg.select(`#node-${selectedNode}`);
    if (!selectedNodeElem.empty()) {
      const nodeType = selectedNodeElem.datum() as GraphNode;
      
      if (nodeType.type === "tag") {
        selectedNodeElem.select("rect")
          .attr("x", -6)
          .attr("y", -6)
          .attr("width", 12)
          .attr("height", 12)
          .attr("stroke-width", 3);
      } else if (nodeType.type === "domain") {
        selectedNodeElem.select("polygon")
          .attr("points", "0,-10 10,0 0,10 -10,0")
          .attr("stroke-width", 3);
      } else {
        selectedNodeElem.select("circle")
          .attr("r", 10)
          .attr("stroke-width", 3);
      }
    }
  }, [selectedNode, graphInitialized]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
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
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
          <span>Related</span>
        </div>
      </div>
    </div>
  );
}
