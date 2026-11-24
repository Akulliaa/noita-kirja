<script lang="ts">
  import { STATUS_COLOR, STATUS_ICON } from '../lib/noteMeta';
  import { t, type Key } from '../lib/i18n.svelte';
  import type { NoteStatus } from '../lib/types';
  let { status }: { status: NoteStatus } = $props();
</script>

<span class="badge" style:color={STATUS_COLOR[status]}>{STATUS_ICON[status]} {t(`status.${status}` as Key)}</span>
