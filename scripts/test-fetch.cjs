async function test() {
  console.log("Testing fetch...");
  try {
    const res = await fetch("http://127.0.0.1:54321", { signal: AbortSignal.timeout(3000) });
    console.log("Status:", res.status);
  } catch (err) {
    console.log("Fetch error:", err.message);
  }
}
test();
