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
    
    // Completely reworked focus mode layout to eliminate grid formations
    if (nodes.length <= 15 && simulationRef.current) {
      // Stop current simulation to ensure clean state
      simulationRef.current.stop();
      
      // Get all nodes and put non-focus nodes far away
      const allNodes = simulationRef.current.nodes();
      const focusNodeIds = new Set(nodes.map(n => n.id));
      
      // Clear all fixed positions for focused nodes
      allNodes.forEach(node => {
        if (focusNodeIds.has(node.id)) {
          // Reset positions to null to allow force simulation to work
          node.fx = null;
          node.fy = null;
          node.vx = 0;
          node.vy = 0;
        } else {
          // Move non-focus nodes very far away
          node.fx = node.x ? node.x + (Math.random() - 0.5) * 10000 : null;
          node.fy = node.y ? node.y + (Math.random() - 0.5) * 10000 : null;
        }
      });
      
      // Get only the focused nodes
      const focusedNodes = nodes.filter(n => focusNodeIds.has(n.id));
      const centerX = width / 2;
      const centerY = height / 2;
      
      // First arrange nodes in a completely random organic pattern
      // This helps break any pre-existing grid patterns
      focusedNodes.forEach(node => {
        // Add random noise to positions - this is key to breaking grid patterns
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDistance = Math.random() * 120 + 80; // Varied distances 80-200px from center
        
        node.x = centerX + Math.cos(randomAngle) * randomDistance;
        node.y = centerY + Math.sin(randomAngle) * randomDistance;
        
        // Add random initial velocities for more chaotic starting conditions
        node.vx = (Math.random() - 0.5) * 10;
        node.vy = (Math.random() - 0.5) * 10;
      });
      
      // Create a completely new force simulation for focus mode
      // This is critical - we don't want to inherit any forces from the main view
      const focusSimulation = d3.forceSimulation<GraphNode>(allNodes)
        // Apply very strong node repulsion
        .force("charge", d3.forceManyBody()
          .strength(-800)  // Much stronger negative charge
          .distanceMax(600) // Increased maximum distance
          .theta(0.7)  // More accurate force calculations
        );
      
      // Apply custom node positioning strategy
      // For different node types in different regions to maximize spacing
      const positioningForce = () => {
        // Group nodes by type
        const domainNodes: GraphNode[] = [];
        const bookmarkNodes: GraphNode[] = [];
        const tagNodes: GraphNode[] = [];
        const otherNodes: GraphNode[] = [];
        
        focusedNodes.forEach(node => {
          if (node.type === "domain") domainNodes.push(node);
          else if (node.type === "bookmark") bookmarkNodes.push(node);
          else if (node.type === "tag") tagNodes.push(node);
          else otherNodes.push(node);
        });
        
        // Position domains most prominently in separate regions
        if (domainNodes.length > 0) {
          const domainSpread = Math.PI * 2 / domainNodes.length;
          domainNodes.forEach((node, i) => {
            // Place domains in a wide circle 
            const angle = i * domainSpread + (Math.random() * 0.2);
            const distance = 170 + (Math.random() * 40);
            
            // Create a strong pull toward this position
            const targetX = centerX + Math.cos(angle) * distance;
            const targetY = centerY + Math.sin(angle) * distance;
            
            // Apply force toward the target position
            const dx = targetX - (node.x || 0);
            const dy = targetY - (node.y || 0);
            const distance2 = Math.sqrt(dx * dx + dy * dy);
            
            if (distance2 > 5) {  // Only if we're not already close
              node.vx = (node.vx || 0) + dx * 0.1;
              node.vy = (node.vy || 0) + dy * 0.1;
            }
          });
        }
      };
      
      // Ensure we're working with the correct set of links for the focused view
      const focusedLinks = simulationRef.current.force("link") 
        ? (simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>).links()
        : links;
        
      // Filter to only include links between nodes that are in focus
      const relevantLinks = focusedLinks.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        return focusNodeIds.has(sourceId) && focusNodeIds.has(targetId);
      });
      
      // Add special forces just for this focused view
      focusSimulation
        // Use longer distances for links with randomization for organic layout
        .force("link", d3.forceLink<GraphNode, GraphLink>()
          .id(d => d.id)
          .links(relevantLinks)
          .distance(() => 120 + Math.random() * 80) // Varied distances for organic look
          .strength(0.15) // Very weak link strength
        )
        
        // Use a weak centering force
        .force("center", d3.forceCenter(centerX, centerY).strength(0.05))
        
        // Add radial force to spread nodes out from center
        .force("radial", d3.forceRadial(
          (d) => {
            // Vary the distance by node type
            if (d.type === "domain") return 180 + Math.random() * 40; 
            if (d.type === "tag") return 140 + Math.random() * 30;
            return 120 + Math.random() * 40;
          }, 
          centerX, 
          centerY
        ).strength(0.2))
        
        // Add our custom positioning force
        .force("positioning", positioningForce)
        
        // Add very large collision detection
        .force("collision", d3.forceCollide()
          .radius(d => {
            switch (d.type) {
              case "domain": return 80 + Math.random() * 20;  // Largest for domains
              case "bookmark": return 65 + Math.random() * 15; // Large for bookmarks
              case "tag": return 55 + Math.random() * 10;     // Medium for tags
              default: return 50 + Math.random() * 10;        // Smaller for others
            }
          })
          .strength(0.85)  // Strong collision detection
          .iterations(4)   // More collision iterations
        )
        
        // Add x-y positioning for better spread
        .force("x", d3.forceX(centerX).strength(d => {
          // Vary strength by type to create uneven, organic clustering
          if (d.type === "domain") return 0.02;
          return 0.04;
        }))
        .force("y", d3.forceY(centerY).strength(d => {
          if (d.type === "domain") return 0.02;
          return 0.04;
        }));
      
      // Special force to explicitly break grid patterns
      const breakGridForce = () => {
        focusedNodes.forEach(node => {
          // Add small random movement to each node
          node.vx = (node.vx || 0) + (Math.random() - 0.5) * 2;
          node.vy = (node.vy || 0) + (Math.random() - 0.5) * 2;
          
          // Find nodes that are too aligned (in grid formation)
          const alignedNodes = focusedNodes.filter(other => {
            if (node === other) return false;
            
            // Check if nodes are horizontally or vertically aligned (grid pattern)
            const dx = Math.abs((node.x || 0) - (other.x || 0));
            const dy = Math.abs((node.y || 0) - (other.y || 0));
            
            // If they're very closely aligned on either axis (but not both)
            return (dx < 10 && dy > 20) || (dy < 10 && dx > 20);
          });
          
          // For each aligned node, add a force to break the alignment
          alignedNodes.forEach(other => {
            const dx = (node.x || 0) - (other.x || 0);
            const dy = (node.y || 0) - (other.y || 0);
            
            // If horizontally aligned, add vertical force
            if (Math.abs(dx) < 10) {
              node.vy = (node.vy || 0) + (Math.random() - 0.5) * 5;
            }
            
            // If vertically aligned, add horizontal force
            if (Math.abs(dy) < 10) {
              node.vx = (node.vx || 0) + (Math.random() - 0.5) * 5;
            }
          });
        });
      };
      
      // Add the grid-breaking force
      focusSimulation.force("breakGrid", breakGridForce);
      
      // Configure the simulation for a more chaotic, organic result
      focusSimulation
        .alpha(0.9)            // Start with high energy
        .alphaMin(0.001)       // Run longer by using a lower min alpha
        .alphaDecay(0.008)     // Very slow alpha decay
        .velocityDecay(0.3)    // Moderate velocity decay for momentum
        .restart();            // Start the simulation
      
      // Override the main simulation with our focused one
      simulationRef.current = focusSimulation;
    }
    
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
    const padding = Math.max(40, Math.min(120, 100 - nodes.length * 2));
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
    
    // Smoother scale adjustment:
    // 1. Make scaling more gradual based on node count
    const baseScale = scale;
    
    if (nodes.length > 15) {
      // More subtle scale reduction for many nodes
      scale = Math.max(0.5, scale * (1 - Math.min(nodes.length / 150, 0.4)));
    } else if (nodes.length < 5) {
      // Don't zoom in quite as aggressively for small node counts
      scale = Math.min(1.8, scale);
    }
    
    // 2. Constrain scale to the allowed range with a tighter min bound for better visibility
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
      .duration(1200) // Longer animation for smoother feel
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

  // Update graph when data changes
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !bookmarks.length) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Generate the graph data
    const { nodes, links } = generateGraphData(bookmarks, insightLevel);
    
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
    
    // Adjust forces based on node count for better organic layout
    const isFewNodes = nodes.length <= 10;
    
    // Find domain nodes for special treatment in large graphs
    const domainNodes = nodes.filter(node => node.type === "domain");
    const domainCount = domainNodes.length;
    
    // Special domain repulsion force for large graphs (similar to focus mode)
    const domainRepulsionForce = (alpha: number) => {
      for (let i = 0; i < domainNodes.length; i++) {
        for (let j = i + 1; j < domainNodes.length; j++) {
          const nodeA = domainNodes[i];
          const nodeB = domainNodes[j];
          
          if (!nodeA.x || !nodeA.y || !nodeB.x || !nodeB.y) continue;
          
          // Calculate distance between domains
          const dx = nodeA.x - nodeB.x;
          const dy = nodeA.y - nodeB.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Apply repulsive force (weaker than in focus mode)
          if (distance > 0) {
            const force = (-250 * alpha) / (distance * distance);
            const forceX = dx * force;
            const forceY = dy * force;
            
            // Apply the force to both nodes
            nodeA.vx = (nodeA.vx || 0) + forceX;
            nodeA.vy = (nodeA.vy || 0) + forceY;
            nodeB.vx = (nodeB.vx || 0) - forceX;
            nodeB.vy = (nodeB.vy || 0) - forceY;
          }
        }
      }
    };
    
    // Create the force simulation with adaptive parameters for better organic layout
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        // Adjust link distance by type and node count
        if (isFewNodes) {
          // For smaller graphs, use more uniform distances for better organic layout
          if (d.type === "domain") return 100; // Increased for better domain separation
          if (d.type === "tag") return 80;
          if (d.type === "related") return 60;
          return 70;
        } else {
          // For larger graphs, use diverse distances with still enough separation
          if (d.type === "domain") return 90; // Increased to match the feel of focus mode
          if (d.type === "tag") return 100;
          if (d.type === "related") return 70;
          return 80;
        }
      }).strength(isFewNodes ? 0.5 : 0.2)) // Stronger links for small graphs, but not too rigid
      
      // Higher repulsion to prevent grid-like structures
      .force("charge", d3.forceManyBody().strength(isFewNodes ? -250 : -180))
      
      // Center force - slightly stronger for small graphs
      .force("center", d3.forceCenter(width / 2, height / 2).strength(isFewNodes ? 0.1 : 0.05))
      
      // Additional forces for all graphs to allow more natural organic layout
      .force("x", d3.forceX(width / 2).strength(isFewNodes ? 0.02 : 0.01))
      .force("y", d3.forceY(height / 2).strength(isFewNodes ? 0.02 : 0.01))
      
      // Collision avoidance - larger radii to prevent overlapping
      .force("collision", d3.forceCollide().radius(d => {
        if (isFewNodes) {
          // More spacing in small graphs
          if (d.type === "bookmark") return 50;
          if (d.type === "domain") return 60; // Much larger for domains
          if (d.type === "tag") return 45;
          return 35;
        } else {
          // Enhanced spacing for large graphs too
          if (d.type === "bookmark") return 45;
          if (d.type === "domain") return 50; // Increased significantly
          if (d.type === "tag") return 35;
          return 25;
        }
      }).strength(0.8).iterations(2)) // Stronger collision and more iterations
      
      // Add the domain repulsion for both modes
      .force("domainRepulsion", domainRepulsionForce)
      
      // Better simulation settings for organic movement
      .alphaDecay(0.028); // Slightly slower decay for more natural movement
    
    // Store simulation reference for later updates
    simulationRef.current = simulation;
    
    // Create links with visual distinctions and curved paths to avoid crossing
    const link = linkGroup
      .selectAll("path") // Use paths instead of lines for curved edges
      .data(links)
      .enter()
      .append("path") // Using paths allows for curves
      .attr("class", "link")
      .attr("stroke", d => getLinkColor(d.type))
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke-opacity", 0.6)
      .attr("fill", "none") // Important for paths
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
        
        linkGroup.selectAll("path") // Updated from "line" to "path"
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
        linkGroup.selectAll("path") // Updated from "line" to "path"
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
    
    // Create a reusable curved path generator function that we can use in both normal and focus mode
    const generateCurvedPath = (d: GraphLink, allNodes: GraphNode[]) => {
      // Helper to get node position from either a string ID or node reference
      const getNodePos = (nodeRef: string | GraphNode, key: 'x' | 'y'): number => {
        if (typeof nodeRef === 'string') {
          return allNodes.find(n => n.id === nodeRef)?.[key] || 0;
        } else {
          return (nodeRef as GraphNode)[key] || 0;
        }
      };
      
      // Get source and target coordinates
      const sourceX = getNodePos(d.source, 'x');
      const sourceY = getNodePos(d.source, 'y');
      const targetX = getNodePos(d.target, 'x');
      const targetY = getNodePos(d.target, 'y');
      
      // Calculate midpoint
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;
      
      // Calculate normal vector (perpendicular to the line connecting source and target)
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const len = Math.sqrt(dx * dx + dy * dy);
      
      // Default for very short links to avoid division by zero
      if (len < 1) {
        return `M${sourceX},${sourceY} L${targetX},${targetY}`;
      }
      
      // Normalize the perpendicular vector
      const nx = -dy / len;
      const ny = dx / len;
      
      // Special curving for different link types to create visual distinction
      // and avoid edge crossing with other links of same type
      let curveFactor = 0;
      
      // Adjust curve based on link type for better visual separation
      switch (d.type) {
        case "domain":
          curveFactor = 0.3; // Gentle curve for domain links
          break;
        case "tag":
          curveFactor = 0.2; // Slight curve for tag links
          break;
        case "related":
          curveFactor = 0.15; // Very subtle curve
          break;
        default:
          curveFactor = 0.1; // Almost straight for other links
      }
      
      // Calculate control point offset (perpendicular to the line)
      // This creates a quadratic curve that helps avoid edge crossings
      const offsetDistance = len * curveFactor;
      const controlX = midX + nx * offsetDistance;
      const controlY = midY + ny * offsetDistance;
      
      // Draw a quadratic Bezier curve
      return `M${sourceX},${sourceY} Q${controlX},${controlY} ${targetX},${targetY}`;
    };
    
    // Share the curve generator with other parts of the code via ref for consistent rendering
    curveGeneratorRef.current = generateCurvedPath;
    
    // Update positions during simulation with curved paths for better readability
    simulation.on("tick", () => {
      // Use our reusable curved path generator for all links
      link.attr("d", d => generateCurvedPath(d, nodes));
      
      // Update node positions normally
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Implement drag behavior
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      // Temporarily fix position during drag
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      // Update position during drag
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      
      // Get the node that was dragged
      const draggedNode = event.subject;
      
      // Check if we're in a focused view (small number of nodes)
      const isFocusedView = simulationRef.current && 
                           simulationRef.current.nodes().length <= 15;
      
      // CRITICAL CHANGE: In focus mode, ALWAYS release nodes
      // This ensures our organic layout can take effect
      if (isFocusedView) {
        // In focus mode, ALWAYS release ALL nodes to allow organic positioning
        // This is the key to breaking grid patterns
        
        // Release the dragged node
        event.subject.fx = null;
        event.subject.fy = null;
        
        // Release ALL other nodes too to ensure they're free to move
        if (simulationRef.current) {
          simulationRef.current.nodes().forEach(node => {
            node.fx = null;
            node.fy = null;
          });
          
          // Add random velocities to all nodes to break any existing grid patterns
          simulationRef.current.nodes().forEach(node => {
            // Add random velocity to completely disrupt any existing formation
            node.vx = (node.vx || 0) + (Math.random() - 0.5) * 5;
            node.vy = (node.vy || 0) + (Math.random() - 0.5) * 5;
          });
        }
        
        // Extra velocity for the dragged node in random direction
        const randomAngle = Math.random() * Math.PI * 2;
        const randomStrength = 2 + Math.random() * 3;
        draggedNode.vx = Math.cos(randomAngle) * randomStrength;
        draggedNode.vy = Math.sin(randomAngle) * randomStrength;
        
        // Give the simulation a strong kick to adjust the layout
        simulation.alpha(0.5).restart();
      } 
      else {
        // In normal mode (not focused view)
        const isDomain = draggedNode.type === "domain";
        
        if (isDomain) {
          // Always release domain nodes
          event.subject.fx = null;
          event.subject.fy = null;
          
          // Special handling for domain nodes - push them away from other domains
          if (simulationRef.current) {
            // Find all domain nodes in the current simulation
            const domains = simulationRef.current.nodes()
              .filter(n => n.type === "domain" && n.id !== draggedNode.id);
            
            // If more than one domain, add extra repulsion from other domains
            if (domains.length > 0) {
              // Calculate average position of other domains
              let avgX = 0, avgY = 0;
              domains.forEach(d => {
                avgX += d.x || 0;
                avgY += d.y || 0;
              });
              avgX /= domains.length;
              avgY /= domains.length;
              
              // Vector away from center of other domains
              const dx = (draggedNode.x || 0) - avgX;
              const dy = (draggedNode.y || 0) - avgY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              // Add velocity away from other domains
              if (dist > 0) {
                // Normalized direction vector * strength
                draggedNode.vx = (dx / dist) * 3;
                draggedNode.vy = (dy / dist) * 3;
              }
            }
          }
          
          // Give the simulation a moderate kick to adjust layout
          simulation.alpha(0.2).restart();
        } else {
          // Non-domain nodes in normal mode can remain fixed
          // (We keep this behavior because it works well for large graphs)
          
          // Give the simulation a tiny kick to adjust surrounding nodes
          simulation.alpha(0.05).restart();
        }
      }
    }
    
    // Setup zoom functionality
    initializeZoom();
    
    // Center graph after simulation stabilizes with a slight delay
    // to allow the simulation to settle more completely
    simulation.on("end", () => {
      // Short delay to ensure nodes are fully positioned
      setTimeout(() => {
        centerGraph(nodes);
      }, 100);
    });
    
    // Manually trigger centering after a timeout if simulation doesn't end naturally
    const timeoutId = setTimeout(() => {
      if (simulationRef.current === simulation) {
        centerGraph(nodes);
      }
    }, 1500); // 1.5 second timeout (reduced to avoid long waiting)
    
    // Clean up on unmount
    return () => {
      clearTimeout(timeoutId);
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, [bookmarks, insightLevel, generateGraphData, initializeZoom, onNodeClick, centerGraph]);
  
  // Listen for external node selection events (like from tag selection in parent component)
  useEffect(() => {
    const handleSelectNode = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.nodeId) {
        setSelectedNode(customEvent.detail.nodeId);
      }
    };
    
    // Add event listener
    document.addEventListener('selectGraphNode', handleSelectNode);
    
    // Clean up on unmount
    return () => {
      document.removeEventListener('selectGraphNode', handleSelectNode);
    };
  }, []);

  // Update selected node visual when it changes and center the graph around it
  useEffect(() => {
    if (!selectedNode || !svgRef.current) return;
    
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
      .attr("stroke-width", d => (d as GraphNode).type === "bookmark" ? 2 : 1.5);
    
    // Highlight the selected node
    const selectedElement = svg.select(`#node-${selectedNode}`);
    if (!selectedElement.empty()) {
      svg.select(`#node-${selectedNode} circle`)
        .attr("r", 10)
        .attr("stroke-width", 3);
      
      // Get selected node data
      const nodeData = simulationRef.current?.nodes().find(n => n.id === selectedNode);
      
      // If we have the node data and simulation is available, center the graph around this node
      if (nodeData && simulationRef.current) {
        // For tag nodes, we want to center the graph on all associated bookmarks
        if (nodeData.type === "tag") {
          // Find all nodes connected to this tag
          const tagId = nodeData.id;
          const relatedNodes = simulationRef.current.nodes().filter(n => {
            // Find bookmark nodes that have a link to this tag
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
          
          // Center on the cluster that includes the tag and all connected bookmarks
          if (relatedNodes.length > 0) {
            centerGraph([nodeData, ...relatedNodes]);
          } else {
            centerGraph([nodeData]);
          }
        } else {
          // For non-tag nodes, just center on the node itself
          // Find connected nodes for a better view
          const links = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
          const connectedNodes = simulationRef.current.nodes().filter(n => {
            return links.links().some(link => {
              const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
              const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
              return (sourceId === nodeData.id && targetId === n.id) || (sourceId === n.id && targetId === nodeData.id);
            });
          });
          
          centerGraph([nodeData, ...connectedNodes]);
        }
      }
    }
  }, [selectedNode, centerGraph]);

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
