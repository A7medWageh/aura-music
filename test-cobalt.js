async function testInstances() {
  try {
    const res = await fetch("https://api.cobalt.tools/api/instances"); // Or similar tracker
    console.log("Instances:", await res.status);
  } catch(e) {}
  
  try {
    const res = await fetch("https://instances.cobalt.tools/api/instances");
    const data = await res.json();
    console.log("Cobalt Directory:", data.slice(0,5));
  } catch(e) {}
}

testInstances();
