<script lang="ts">
  // Pixel-art tome with a glowing flask emblem (original artwork, 16×16 grid).
  let { size = 44 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" class="logo">
  <!-- cover -->
  <rect x="2" y="1" width="12" height="14" fill="#3a2440" />
  <rect x="3" y="2" width="10" height="12" fill="#52325c" />
  <!-- spine & pages -->
  <rect x="2" y="1" width="2" height="14" fill="#241629" />
  <rect x="13" y="2" width="1" height="13" fill="#e6d3a8" />
  <rect x="3" y="14" width="11" height="1" fill="#e6d3a8" />
  <!-- gold corners -->
  <rect x="12" y="1" width="2" height="1" fill="#ffd97a" />
  <rect x="12" y="13" width="1" height="1" fill="#e2b450" />
  <rect x="4" y="1" width="1" height="1" fill="#e2b450" />
  <!-- flask emblem -->
  <rect x="7" y="4" width="2" height="1" fill="#ffd97a" />
  <rect x="7" y="5" width="2" height="2" fill="#a8977f" />
  <rect x="6" y="7" width="4" height="1" fill="#a8977f" />
  <rect x="5" y="8" width="6" height="3" fill="#8dff6a" class="liquid" />
  <rect x="6" y="11" width="4" height="1" fill="#5fc94a" />
  <rect x="6" y="8" width="1" height="1" fill="#d8ffc8" />
  <rect x="9" y="9" width="1" height="1" fill="#c9ff9c" class="bubble" />
</svg>

<style>
  .logo { filter: drop-shadow(0 0 6px rgba(141, 255, 106, 0.35)) drop-shadow(2px 2px 0 #000); }
  .liquid { animation: glow 2.4s steps(2) infinite; } /* steps: repaint twice per cycle, not every frame */
  .bubble { animation: bub 1.8s steps(3) infinite; }
  @keyframes glow { 50% { fill: #b6ff8e; } }
  @keyframes bub { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-3px); opacity: 0; } }
</style>
