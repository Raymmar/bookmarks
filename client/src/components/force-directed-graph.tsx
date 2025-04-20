import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Bookmark } from "@shared/types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  group: number;
  bookmarkId?: string;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
}

interface ForceDirectedGraphProps {
  bookmarks: Bookmark[];
  insightLevel: number;
  onNodeClick: (bookmarkId: string) => void;
}

export function ForceDirectedGraph({ bookmarks, insightLevel, onNodeClick }: ForceDirectedGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !bookmarks.length) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    // Create nodes and links from bookmarks
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Group bookmarks by their tags
    const tagGroups: Record<string, number> = {};
    let groupCounter = 1;
    
    // Create nodes for bookmarks
    bookmarks.forEach(bookmark => {
      // Determine group based on primary tag
      const primaryTag = bookmark.user_tags[0] || bookmark.system_tags[0] || "uncategorized";
      
      if (!tagGroups[primaryTag]) {
        tagGroups[primaryTag] = groupCounter++;
      }
      
      const group = tagGroups[primaryTag];
      
      nodes.push({
        id: bookmark.id,
        name: bookmark.title,
        group,
        bookmarkId: bookmark.id
      });
      
      // Create additional nodes for related content based on insight level
      if (bookmark.insights?.related_links && insightLevel > 1) {
        const relatedCount = Math.min(bookmark.insights.related_links.length, insightLevel);
        
        for (let i = 0; i < relatedCount; i++) {
          const relatedId = `related-${bookmark.id}-${i}`;
          const relatedUrl = bookmark.insights.related_links[i];
          const relatedName = relatedUrl.substring(relatedUrl.lastIndexOf('/') + 1);
          
          nodes.push({
            id: relatedId,
            name: relatedName,
            group
          });
          
          links.push({
            source: bookmark.id,
            target: relatedId,
            value: 3
          });
        }
      }
    });
    
    // Connect nodes with similar tags
    for (let i = 0; i < bookmarks.length; i++) {
      for (let j = i + 1; j < bookmarks.length; j++) {
        const bookmarkA = bookmarks[i];
        const bookmarkB = bookmarks[j];
        
        // Find common tags
        const tagsA = [...bookmarkA.user_tags, ...bookmarkA.system_tags];
        const tagsB = [...bookmarkB.user_tags, ...bookmarkB.system_tags];
        
        const commonTags = tagsA.filter(tag => tagsB.includes(tag));
        
        if (commonTags.length > 0) {
          links.push({
            source: bookmarkA.id,
            target: bookmarkB.id,
            value: commonTags.length + 1
          });
        }
      }
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Create the force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(70))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    // Create links
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", d => Math.sqrt(d.value));

    // Create nodes
    const node = svg.append("g")
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .on("click", function(event, d) {
        event.stopPropagation();
        if (d.bookmarkId) {
          onNodeClick(d.bookmarkId);
          
          // Update visual state
          node.selectAll("circle").attr("r", 6);
          d3.select(this).select("circle").attr("r", 8);
        }
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      );

    // Add circles to nodes
    node.append("circle")
      .attr("r", 6)
      .attr("fill", d => d.group === 1 ? "#4F46E5" : d.group === 2 ? "#10B981" : "#F59E0B")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    // Add labels to nodes
    node.append("text")
      .attr("dx", 10)
      .attr("dy", 4)
      .text(d => d.name)
      .attr("font-size", "10px")
      .attr("fill", "#1F2937");

    // Update positions during simulation
    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as unknown as GraphNode).x!)
        .attr("y1", d => (d.source as unknown as GraphNode).y!)
        .attr("x2", d => (d.target as unknown as GraphNode).x!)
        .attr("y2", d => (d.target as unknown as GraphNode).y!);
      
      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
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
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [bookmarks, insightLevel, onNodeClick]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full rounded-lg"
        style={{ background: "#f9fafb" }}
      />
    </div>
  );
}
