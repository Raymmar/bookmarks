// This is a helper method to unpin all nodes in the force-directed graph
// Use this in the console to test the behavior immediately

function unpinAllNodes() {
  // Get the SVG graph element
  const svg = document.querySelector('svg');
  if (!svg) return console.error('SVG not found');
  
  // Use D3's internal data storage to get all nodes
  const nodes = svg.__data__.nodes;
  if (!nodes) return console.error('No nodes data found');
  
  // Unpin all nodes by setting fx and fy to null
  nodes.forEach(node => {
    node.fx = null;
    node.fy = null;
  });
  
  console.log(`Unpinned ${nodes.length} nodes - they should now move freely`);
}

// Run the function
unpinAllNodes();
