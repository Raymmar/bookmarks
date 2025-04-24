import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { Bookmark } from "@shared/types";
import { Progress } from "@/components/ui/progress";

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
  initialBookmarks?: Bookmark[]; // Starting bookmarks to show right away
  batchSize?: number; // Size of each batch of bookmarks to load
  onNodeClick: (bookmarkId: string) => void;
  onTagClick?: (tagName: string) => void;
  onDomainClick?: (domainName: string) => void;
  selectedBookmarkId?: string | null;
  visibleNodeTypes?: string[];
  insightLevel?: number;
}

export function ForceDirectedGraphProgressive({ 
  initialBookmarks = [],
  batchSize = 15,
  insightLevel = 1,
  onNodeClick, 
  onTagClick, 
  onDomainClick, 
  selectedBookmarkId,
  visibleNodeTypes = ["bookmark", "domain", "tag"] 
}: ForceDirectedGraphProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const graphDataRef = useRef<GraphData | null>(null);
  const graphInitializedRef = useRef<boolean>(false);
  
  // Progressive loading state
  const [loadedBookmarks, setLoadedBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [offset, setOffset] = useState(0);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [progress, setProgress] = useState(0);
  const loadingTimerRef = useRef<number | null>(null);
  const userInteractedRef = useRef<boolean>(false);
  
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
  const generateGraphData = useCallback((bookmarks: Bookmark[], insightLevel: number, focusBookmarkId?: string) => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Create maps for lookups
    const tagGroups: Record<string, number> = {};
    const tagNodes: Record<string, boolean> = {}; // Track created tag nodes
    const domainNodes: Record<string, boolean> = {}; // Track created domain nodes
    const relatedBookmarkIds = new Set<string>(); // Track related bookmark IDs when focusing
    let groupCounter = 1;
    
    // If we're focusing on a specific bookmark, first identify its connections
    if (focusBookmarkId) {
      // Add the focus bookmark to the set
      relatedBookmarkIds.add(focusBookmarkId);
      
      // Find the target bookmark
      const focusBookmark = bookmarks.find(b => b.id === focusBookmarkId);
      if (focusBookmark) {
        // For each bookmark, check if it's connected to the focus bookmark
        bookmarks.forEach(bookmark => {
          if (bookmark.id === focusBookmarkId) return; // Skip the focus bookmark itself
          
          // Check for direct content relationships
          if (focusBookmark.insights?.related_links?.some(link => link.includes(bookmark.url)) ||
              bookmark.insights?.related_links?.some(link => link.includes(focusBookmark.url))) {
            relatedBookmarkIds.add(bookmark.id);
          }
          
          // For the focused bookmark, we'll add all its tag and domain connections later
        });
      }
    }
    
    // First pass: create bookmark nodes and collect metadata
    bookmarks.forEach(bookmark => {
      // If focusing on a bookmark and this isn't related, skip it
      if (focusBookmarkId && !relatedBookmarkIds.has(bookmark.id)) return;
      
      // Determine group based on normalized tags or source if no tags
      // Get the first tag or use the source as a fallback
      const primaryTag = bookmark.tags && bookmark.tags.length > 0 
        ? bookmark.tags[0].name 
        : bookmark.source;
      
      if (!tagGroups[primaryTag]) {
        tagGroups[primaryTag] = groupCounter++;
      }
      
      const group = tagGroups[primaryTag];
      
      // Add the main bookmark node
      nodes.push({
        id: `bookmark-${bookmark.id}`, // Format ID to match selectNode event
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
        id: `link-bookmark-${bookmark.id}-${domain}`,
        source: `bookmark-${bookmark.id}`,
        target: `domain-${domain}`,
        value: 2,
        type: "domain"
      });
      
      // Create tag nodes and connect bookmark to its tags
      // Tags come from bookmark.tags in the normalized system
      const allTags = bookmark.tags ? bookmark.tags.map(tag => tag.name) : [];
      // Only use normalized tags from the tags table
      if (allTags.length > 0) {
        allTags.forEach(tagName => {
          // Create tag node if it doesn't exist
          if (!tagNodes[tagName]) {
            tagNodes[tagName] = true;
            nodes.push({
              id: `tag-${tagName}`,
              name: tagName,
              group: tagGroups[tagName] || group, // Use tag's group or bookmark's group
              type: "tag"
            });
          }
          
          // Connect bookmark to tag
          links.push({
            id: `link-bookmark-${bookmark.id}-tag-${tagName}`,
            source: `bookmark-${bookmark.id}`,
            target: `tag-${tagName}`,
            value: 1.5,
            type: "tag"
          });
        });
      }
    });
    
    // Second pass: create content relationship links (related bookmarks)
    if (insightLevel > 0) {
      for (let i = 0; i < bookmarks.length; i++) {
        const bookmarkA = bookmarks[i];
        // Skip if we're focusing and this isn't in our focus set
        if (focusBookmarkId && !relatedBookmarkIds.has(bookmarkA.id)) continue;
        
        // Only process bookmarks with insights
        if (!bookmarkA.insights) continue;
        
        for (let j = i + 1; j < bookmarks.length; j++) {
          const bookmarkB = bookmarks[j];
          // Skip if we're focusing and this isn't in our focus set
          if (focusBookmarkId && !relatedBookmarkIds.has(bookmarkB.id)) continue;
          
          // Check for content similarity/relatedness
          if (bookmarkA.insights?.related_links?.some(link => link.includes(bookmarkB.url)) ||
              bookmarkB.insights?.related_links?.some(link => link.includes(bookmarkA.url))) {
            links.push({
              id: `link-ref-bookmark-${bookmarkA.id}-bookmark-${bookmarkB.id}`,
              source: `bookmark-${bookmarkA.id}`,
              target: `bookmark-${bookmarkB.id}`,
              value: 3,
              type: "content"
            });
          }
        }
      }
    }
    
    return { nodes, links };
  }, []);

  // Determine link color based on type
  const getLinkColor = useCallback((type: string) => {
    switch (type) {
      case "tag": return "#3B82F6"; // Blue for tag connections
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
      case "domain": return "#10B981"; // Green for domains
      case "tag": return "#3B82F6"; // Blue for tags
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
        // Track user-initiated zoom events
        if (event.sourceEvent) {
          // Only consider direct user interaction (mouse/touch)
          if (event.sourceEvent.type === 'wheel' || 
              event.sourceEvent.type === 'mousedown' || 
              event.sourceEvent.type === 'touchstart' ||
              event.sourceEvent.type === 'dblclick') {
            userInteractedRef.current = true;
          }
        }
        
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
    
    // If we couldn't determine a bounding box, use defaults
    if (minX === Infinity || minY === Infinity) {
      return;
    }
    
    // Calculate center and dimensions of the nodes' bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const boxWidth = maxX - minX + 100; // Add padding
    const boxHeight = maxY - minY + 100; // Add padding
    
    // Calculate scale to fit the bounding box in the container
    const scaleX = width / boxWidth;
    const scaleY = height / boxHeight;
    let scale = Math.min(scaleX, scaleY);
    
    // Clamp scale to reasonable values based on node count
    if (isFewNodes) {
      // For very few nodes, zoom in more to make them more visible
      scale = Math.min(scale, 0.8);
    } else {
      // Adjust scale based on node count - more nodes means we need to zoom out more
      if (nodes.length > 100) {
        scale = Math.min(scale, 0.4);
      } else if (nodes.length > 50) {
        scale = Math.min(scale, 0.5);
      } else {
        scale = Math.min(scale, 0.6);
      }
    }
    
    // Check if this center point is significantly different from the last one
    const now = Date.now();
    if (lastCenteredStateRef.current) {
      const lastState = lastCenteredStateRef.current;
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
  
  // Load paginated bookmarks - used for progressive loading
  const loadBookmarkBatch = useCallback(async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      // API request to get the next batch of bookmarks
      const response = await fetch(`/api/bookmarks/paginated?limit=${batchSize}&offset=${offset}&sortBy=date_saved&sortOrder=desc`);
      
      if (!response.ok) {
        throw new Error(`Failed to load bookmarks: ${response.statusText}`);
      }
      
      const data = await response.json();
      const { bookmarks: newBookmarks, total } = data;
      
      // First time loading, set the total count
      if (totalBookmarks === 0) {
        setTotalBookmarks(total);
      }
      
      // Add the new bookmarks to the existing ones
      setLoadedBookmarks(prev => [...prev, ...newBookmarks]);
      
      // Update offset for the next batch
      setOffset(prev => prev + newBookmarks.length);
      
      // Calculate progress
      const progressPercent = Math.min(100, Math.round(((offset + newBookmarks.length) / total) * 100));
      setProgress(progressPercent);
      
      return newBookmarks;
    } catch (error) {
      console.error("Error loading bookmark batch:", error);
    } finally {
      setIsLoading(false);
    }
  }, [batchSize, offset, isLoading, totalBookmarks]);
  
  // Initialize graph with base bookmarks and simulation
  const initializeGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (graphInitializedRef.current) return;

    const svg = d3.select(svgRef.current);
    const svgContainer = containerRef.current;
    const width = svgContainer.clientWidth;
    const height = svgContainer.clientHeight;
    
    // Create initial graph with whatever bookmarks we have (could be empty)
    let graphData = generateGraphData(loadedBookmarks, insightLevel);
    graphDataRef.current = graphData;
    
    // Clear previous SVG content
    svg.selectAll("*").remove();
    
    // Create zoom container group
    const zoomContainer = svg.append("g")
      .attr("class", "zoom-container");
    
    // Initialize zoom behavior first (needs to be done before we start drawing)
    initializeZoom();
    
    // Create the simulation
    const simulation = d3.forceSimulation<GraphNode, GraphLink>(graphData.nodes)
      .force("charge", d3.forceManyBody().strength(-200).distanceMax(300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("link", d3.forceLink<GraphNode, GraphLink>(graphData.links)
        .id(d => d.id)
        .distance(link => {
          // Adjust link distance based on type
          switch (link.type) {
            case "tag": return 100; // Shorter distance for tag connections
            case "domain": return 150; // Medium distance for domain connections
            case "content": return 200; // Longer distance for content connections
            default: return 100;
          }
        })
        .strength(link => {
          // Adjust link strength based on type
          switch (link.type) {
            case "tag": return 0.3; // Stronger for tag connections
            case "domain": return 0.2; // Medium for domain connections
            case "content": return 0.1; // Weaker for content connections
            default: return 0.2;
          }
        })
      )
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(30).strength(0.5));
    
    // Create the link elements
    const link = zoomContainer.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graphData.links)
      .enter().append("line")
      .attr("class", "graph-link")
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke", d => getLinkColor(d.type))
      .attr("opacity", 0.6);
    
    // Create the node elements
    const node = zoomContainer.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graphData.nodes)
      .enter().append("g")
      .attr("class", d => `graph-node ${d.type}${(d.bookmarkId === selectedBookmarkId) ? ' selected' : ''}`)
      .attr("data-type", d => d.type)
      .attr("data-id", d => d.id)
      .attr("data-name", d => d.name)
      .on("click", (event, d) => {
        // Mark that user has interacted with the graph
        userInteractedRef.current = true;
        
        if (d.type === "bookmark" && d.bookmarkId) {
          onNodeClick(d.bookmarkId);
          setSelectedNode(d.id);
        } else if (d.type === "tag" && onTagClick) {
          onTagClick(d.name);
        } else if (d.type === "domain" && onDomainClick) {
          onDomainClick(d.name);
        }
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // Add circles to each node
    node.append("circle")
      .attr("r", d => {
        switch (d.type) {
          case "bookmark": return 8; // Larger for bookmarks
          case "domain": return 6; // Medium for domains
          case "tag": return 7; // Medium-large for tags
          default: return 5;
        }
      })
      .attr("fill", d => getNodeColor(d.type, d.group))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    
    // Add labels to each node
    node.append("text")
      .attr("class", "node-label")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name)
      .attr("font-size", d => {
        switch (d.type) {
          case "bookmark": return "10px"; // Smallest for bookmarks (lots of them)
          case "domain": return "10px"; // Medium for domains
          case "tag": return "12px"; // Largest for tags (most important)
          default: return "10px";
        }
      })
      .style("fill", "#333")
      .style("stroke", "white")
      .style("stroke-width", "0.3px")
      .style("paint-order", "stroke");
    
    // Set up simulation tick handler
    simulation.on("tick", () => {
      link
        .attr("x1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source?.x || 0;
        })
        .attr("y1", d => {
          const source = typeof d.source === 'string' ? null : d.source;
          return source?.y || 0;
        })
        .attr("x2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target?.x || 0;
        })
        .attr("y2", d => {
          const target = typeof d.target === 'string' ? null : d.target;
          return target?.y || 0;
        });
      
      node.attr("transform", d => {
        // Apply bounds to keep nodes within the container
        const padding = 50; // Padding from edges
        if (d.x !== undefined && d.y !== undefined) {
          d.x = Math.max(padding, Math.min(width - padding, d.x));
          d.y = Math.max(padding, Math.min(height - padding, d.y));
          return `translate(${d.x},${d.y})`;
        }
        return '';
      });
    });
    
    // Store the simulation for later updates
    simulationRef.current = simulation;
    
    // Mark the graph as initialized and update the UI by centering the graph
    graphInitializedRef.current = true;
    centerGraph(graphData.nodes);
    setIsInitialized(true);
    
    // Store references to elements for updates
    return { simulation, link, node, zoomContainer };
  }, [
    loadedBookmarks, 
    insightLevel, 
    centerGraph, 
    dragged, 
    dragended, 
    dragstarted, 
    generateGraphData, 
    getLinkColor, 
    getNodeColor, 
    initializeZoom, 
    onDomainClick, 
    onNodeClick, 
    onTagClick, 
    selectedBookmarkId
  ]);
  
  // Update the graph with new bookmarks
  const updateGraph = useCallback((newBookmarks: Bookmark[]) => {
    if (!svgRef.current || !simulationRef.current || !graphDataRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoomContainer = svg.select("g.zoom-container");
    const simulation = simulationRef.current;
    
    // Generate updated graph data with all bookmarks
    const updatedGraphData = generateGraphData(loadedBookmarks, insightLevel, selectedBookmarkId);
    graphDataRef.current = updatedGraphData;
    
    // Update simulation with new nodes and links
    simulation.nodes(updatedGraphData.nodes);
    
    // Update links
    const linkForce = simulation.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    linkForce.links(updatedGraphData.links);
    
    // Update visual elements
    
    // Update links
    const link = zoomContainer.select(".links").selectAll("line")
      .data(updatedGraphData.links, (d: any) => d.id);
    
    // Remove old links
    link.exit().remove();
    
    // Add new links
    const linkEnter = link.enter().append("line")
      .attr("class", "graph-link")
      .attr("stroke-width", d => Math.sqrt(d.value))
      .attr("stroke", d => getLinkColor(d.type))
      .attr("opacity", 0.6);
    
    // Update nodes
    const node = zoomContainer.select(".nodes").selectAll("g")
      .data(updatedGraphData.nodes, (d: any) => d.id);
    
    // Remove old nodes
    node.exit().remove();
    
    // Add new nodes
    const nodeEnter = node.enter().append("g")
      .attr("class", d => `graph-node ${d.type}${(d.bookmarkId === selectedBookmarkId) ? ' selected' : ''}`)
      .attr("data-type", d => d.type)
      .attr("data-id", d => d.id)
      .attr("data-name", d => d.name)
      .on("click", (event, d) => {
        // Mark that user has interacted with the graph
        userInteractedRef.current = true;
        
        if (d.type === "bookmark" && d.bookmarkId) {
          onNodeClick(d.bookmarkId);
          setSelectedNode(d.id);
        } else if (d.type === "tag" && onTagClick) {
          onTagClick(d.name);
        } else if (d.type === "domain" && onDomainClick) {
          onDomainClick(d.name);
        }
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // Add circles to new nodes
    nodeEnter.append("circle")
      .attr("r", d => {
        switch (d.type) {
          case "bookmark": return 8; // Larger for bookmarks
          case "domain": return 6; // Medium for domains
          case "tag": return 7; // Medium-large for tags
          default: return 5;
        }
      })
      .attr("fill", d => getNodeColor(d.type, d.group))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    
    // Add labels to new nodes
    nodeEnter.append("text")
      .attr("class", "node-label")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text(d => d.name)
      .attr("font-size", d => {
        switch (d.type) {
          case "bookmark": return "10px"; // Smallest for bookmarks (lots of them)
          case "domain": return "10px"; // Medium for domains
          case "tag": return "12px"; // Largest for tags (most important)
          default: return "10px";
        }
      })
      .style("fill", "#333")
      .style("stroke", "white")
      .style("stroke-width", "0.3px")
      .style("paint-order", "stroke");
    
    // Reheat the simulation to position the new nodes
    simulation.alpha(0.3).restart();
    
    // If user hasn't manually interacted with the graph, recenter it
    if (!userInteractedRef.current) {
      centerGraph(updatedGraphData.nodes);
    }
  }, [
    loadedBookmarks, 
    selectedBookmarkId, 
    insightLevel, 
    generateGraphData, 
    centerGraph, 
    getLinkColor, 
    getNodeColor, 
    dragged, 
    dragended, 
    dragstarted, 
    onNodeClick, 
    onTagClick, 
    onDomainClick
  ]);
  
  // Initialize graph on first render or when initial bookmarks change
  useEffect(() => {
    if (loadedBookmarks.length > 0 && !isInitialized) {
      initializeGraph();
    }
  }, [loadedBookmarks, initializeGraph, isInitialized]);
  
  // Load initial batch if we don't have any bookmarks yet
  useEffect(() => {
    if (loadedBookmarks.length === 0 && !isLoading) {
      loadBookmarkBatch();
    }
  }, [loadedBookmarks.length, isLoading, loadBookmarkBatch]);
  
  // Load next batches with a slight delay between them
  useEffect(() => {
    if (isInitialized && offset < totalBookmarks && !isLoading && progress < 100) {
      loadingTimerRef.current = window.setTimeout(async () => {
        const newBookmarks = await loadBookmarkBatch();
        if (newBookmarks && newBookmarks.length > 0) {
          updateGraph(newBookmarks);
        }
      }, 1500); // Delay between batches to prevent overwhelming the visualization
    }
    
    return () => {
      if (loadingTimerRef.current !== null) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [isInitialized, offset, totalBookmarks, isLoading, progress, loadBookmarkBatch, updateGraph]);
  
  // Resize handler
  const handleResize = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !simulationRef.current || !graphDataRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Update simulation forces for the new size
    simulationRef.current
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .alpha(0.3) // Reheat the simulation
      .restart();
      
    // Auto-recenter if the user hasn't interacted
    if (!userInteractedRef.current && graphDataRef.current.nodes.length > 0) {
      centerGraph(graphDataRef.current.nodes);
    }
  }, [centerGraph]);
  
  // Set up resize listener
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {progress < 100 && (
        <div className="absolute top-2 left-2 right-2 z-10 bg-gray-100 rounded-md p-2">
          <div className="text-xs text-gray-600 mb-1">
            Loading bookmarks: {Math.round(progress)}% complete 
            ({loadedBookmarks.length} of {totalBookmarks || '?'})
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
      
      <svg 
        ref={svgRef} 
        className="w-full h-full" 
        style={{ background: 'transparent' }}
      ></svg>
    </div>
  );
}