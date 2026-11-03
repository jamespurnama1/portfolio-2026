<script lang="ts">
	import Awards from '#lib/components/Awards.svelte';
	import type { Award } from '#lib/types/index.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import type { PageData } from './$types.js';

	type Skill = { _key: string; skill: string; type: string; percentage?: number | null };
	type Language = { _key: string; language: string; percentage?: number | null };
	type About = {
		title?: string;
		bio?: string;
		image?: { url?: string } | null;
		awards?: Award[] | null;
		languages?: Language[] | null;
		skills?: Skill[] | null;
	};

	let { data }: { data: PageData } = $props();
	const about = $derived(data.about as About | null);
	const theory = $derived((about?.skills ?? []).filter((skill) => skill.type === 'Theory'));
	const groups = $derived(
		Array.from(
			new Set(
				(about?.skills ?? []).filter((skill) => skill.type !== 'Theory').map((skill) => skill.type)
			)
		)
	);
	const percent = (value: number | null | undefined) => Math.min(100, Math.max(0, value ?? 0));
</script>

<svelte:head>
	<title>About | James Henry</title>
	<meta
		name="description"
		content="About James Henry, creative direction, design and development."
	/>
</svelte:head>

{#if about}
	<section class="about-page" class:light={!optionsStore.dark} aria-label="About James Henry">
		<div class="portrait-column">
			<h1>James Henry</h1>
			{#if about.image?.url}
				<img class="portrait" src={about.image.url} alt="James Henry" />
			{/if}
		</div>

		<div class="details">
			{#if about.bio}<p class="bio">{about.bio}</p>{/if}

			{#if about.awards?.length}
				<section class="detail-row" aria-labelledby="awards-heading">
					<h2 id="awards-heading">Awards</h2>
					<div class="awards"><Awards awards={about.awards} compact /></div>
				</section>
			{/if}

			{#if about.languages?.length}
				<section class="detail-row" aria-labelledby="languages-heading">
					<h2 id="languages-heading">Languages</h2>
					<div class="levels languages">
						{#each about.languages as language (language._key)}
							<div class="level">
								<span>{language.language}</span>
								{#if language.percentage != null}<span
										class="meter"
										role="meter"
										aria-label={language.language}
										aria-valuemin="0"
										aria-valuemax="100"
										aria-valuenow={percent(language.percentage)}
										><span style:width="{percent(language.percentage)}%"></span></span
									>{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if about.skills?.length}
				<section class="detail-row" aria-labelledby="skills-heading">
					<h2 id="skills-heading">Skills</h2>
					<div>
						{#if theory.length}<p class="theory">
								{theory.map((skill) => skill.skill).join(', ')}
							</p>{/if}
						{#each groups as group (group)}
							<div class="skill-group">
								<h3>&gt; {group} &gt;</h3>
								<div class="levels">
									{#each about.skills.filter((skill) => skill.type === group) as skill (skill._key)}
										<div class="level">
											<span>{skill.skill}</span>
											{#if skill.percentage != null}<span
													class="meter"
													role="meter"
													aria-label={skill.skill}
													aria-valuemin="0"
													aria-valuemax="100"
													aria-valuenow={percent(skill.percentage)}
													><span style:width="{percent(skill.percentage)}%"></span></span
												>{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</section>
{/if}

<style>
	.about-page {
		width: min(74%, 1100px);
		min-height: 100svh;
		padding: 5.5rem 0 7rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12%;
		align-items: start;
		color: white;
		font-size: 12px;
		line-height: 1.25;
	}
	.about-page.light {
		color: black;
	}
	.portrait-column h1 {
		margin: 0 0 0.6rem;
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
	}
	.portrait {
		display: block;
		width: min(100%, 24vw, 320px);
		height: auto;
	}
	.details {
		padding-top: 2.6rem;
	}
	.bio {
		max-width: 340px;
		white-space: pre-line;
	}
	.detail-row {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 1rem;
		margin-top: 2rem;
	}
	.detail-row h2 {
		font-weight: 700;
		text-align: right;
	}
	.awards {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.awards :global(.award-label.compact) {
		order: -1;
	}
	.light .awards :global(img) {
		filter: invert(1);
	}
	.levels {
		display: grid;
		gap: 0.15rem;
	}
	.level {
		display: grid;
		grid-template-columns: minmax(0, 150px) 110px;
		gap: 1rem;
		align-items: center;
	}
	.meter {
		display: block;
		height: 1px;
		background: color-mix(in srgb, currentColor 20%, transparent);
	}
	.meter span {
		display: block;
		height: 100%;
		background: currentColor;
	}
	.languages {
		font-family: var(--font-mono);
		text-transform: uppercase;
		font-size: 0.7rem;
	}
	.theory {
		max-width: 340px;
	}
	.skill-group {
		margin-top: 1.25rem;
	}
	.skill-group h3 {
		margin-bottom: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
	}
	@media (max-width: 767px) {
		.about-page {
			width: auto;
			margin: 0 3.5rem;
			padding: 6rem 0 8rem;
			grid-template-columns: minmax(0, 1fr);
			gap: 2.5rem;
		}
		.portrait-column h1 {
			font-size: 2rem;
		}
		.portrait {
			width: min(100%, 280px);
		}
		.details {
			padding-top: 0;
		}
		.detail-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.65rem;
		}
		.detail-row h2 {
			text-align: left;
		}
		.level {
			grid-template-columns: minmax(0, 1fr) minmax(60px, 110px);
		}
	}
</style>
