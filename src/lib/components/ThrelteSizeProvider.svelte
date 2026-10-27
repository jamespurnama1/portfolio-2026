<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import { threlteSize } from '#lib/stores/threlteSize.js';
	const { size } = useThrelte();
	size.subscribe((v) => threlteSize.set(v));
</script>

<!-- This component does not render anything -->
