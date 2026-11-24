<script lang="ts">
  let { size = 44 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0cf7a" />
      <stop offset="1" stop-color="#a8822f" />
    </linearGradient>
  </defs>
  <rect x="10" y="6" width="44" height="52" rx="4" fill="#3a2a1d" stroke="url(#g)" stroke-width="3" />
  <line x1="17" y1="6" x2="17" y2="58" stroke="url(#g)" stroke-width="2" />
  <path d="M36 15 L45 32 L36 49 L27 32 Z" fill="none" stroke="url(#g)" stroke-width="2.5" />
  <circle cx="36" cy="32" r="4" fill="url(#g)" />
</svg>
