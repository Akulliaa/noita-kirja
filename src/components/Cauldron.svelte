<script lang="ts">
  // Pixel-art cauldron bubbling over a fire (original artwork, 32×28 grid).
</script>

<svg viewBox="0 0 32 28" shape-rendering="crispEdges" class="cauldron" aria-hidden="true">
  <!-- bubbles -->
  <g class="bubbles">
    <rect class="b b1" x="12" y="8" width="2" height="2" fill="#b6ff8e" />
    <rect class="b b2" x="18" y="9" width="1" height="1" fill="#d8ffc8" />
    <rect class="b b3" x="15" y="7" width="1" height="1" fill="#8dff6a" />
    <rect class="b b4" x="20" y="8" width="2" height="2" fill="#8dff6a" />
  </g>
  <!-- rim -->
  <rect x="6" y="10" width="20" height="2" fill="#3b3346" />
  <rect x="5" y="11" width="22" height="1" fill="#2a2433" />
  <!-- potion surface -->
  <rect x="8" y="10" width="16" height="1" fill="#8dff6a" class="surf" />
  <!-- body -->
  <rect x="6" y="12" width="20" height="2" fill="#2a2433" />
  <rect x="5" y="14" width="22" height="5" fill="#231d2b" />
  <rect x="6" y="19" width="20" height="2" fill="#1b1622" />
  <rect x="8" y="21" width="16" height="1" fill="#15111b" />
  <rect x="8" y="13" width="2" height="5" fill="#463856" />
  <rect x="9" y="12" width="1" height="1" fill="#5a4a6c" />
  <!-- legs -->
  <rect x="8" y="22" width="2" height="2" fill="#15111b" />
  <rect x="22" y="22" width="2" height="2" fill="#15111b" />
  <!-- fire -->
  <g class="fire">
    <rect x="11" y="23" width="10" height="2" fill="#ff8a3d" />
    <rect x="12" y="22" width="2" height="1" fill="#ffb347" class="f1" />
    <rect x="15" y="21" width="2" height="2" fill="#ffd97a" class="f2" />
    <rect x="18" y="22" width="2" height="1" fill="#ffb347" class="f3" />
    <rect x="13" y="24" width="6" height="1" fill="#ffd97a" />
  </g>
  <!-- logs -->
  <rect x="9" y="25" width="14" height="2" fill="#5a3a22" />
  <rect x="10" y="25" width="2" height="1" fill="#7a5232" />
  <rect x="19" y="26" width="3" height="1" fill="#3e2716" />
</svg>

<style>
  .cauldron { width: 100%; height: 100%; filter: drop-shadow(0 0 14px rgba(141, 255, 106, 0.25)) drop-shadow(0 6px 10px rgba(255, 138, 61, 0.25)); }
  .b { animation: rise 2.2s steps(6) infinite; }
  .b2 { animation-delay: 0.6s; } .b3 { animation-delay: 1.1s; } .b4 { animation-delay: 1.6s; }
  @keyframes rise { 0% { transform: translateY(2px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-7px); opacity: 0; } }
  .surf { animation: shimmer 1.6s steps(2) infinite; }
  @keyframes shimmer { 50% { fill: #b6ff8e; } }
  .f1, .f2, .f3 { animation: flick 0.6s steps(2) infinite; }
  .f2 { animation-delay: 0.2s; } .f3 { animation-delay: 0.4s; }
  @keyframes flick { 50% { transform: translateY(-1px); fill: #fff1a8; } }
</style>
