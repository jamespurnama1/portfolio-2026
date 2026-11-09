import { createElement, useEffect, useState } from 'react';
import { useClient } from 'sanity';
import { Box, Button, Card, Dialog, Flex, Text, TextInput } from '@sanity/ui';
import { thumbnailUrl } from './thumbnail';

export type LibraryAsset = {
	_id: string;
	_type: 'sanity.imageAsset' | 'sanity.fileAsset';
	url: string;
	mimeType?: string;
	originalFilename?: string;
};

const QUERY = `*[_type in ["sanity.imageAsset","sanity.fileAsset"]
  && (mimeType match "image/*" || mimeType match "video/*")
  && ($q == "" || originalFilename match $q)
] | order(_createdAt desc)[0...$limit]{_id, _type, url, mimeType, originalFilename}`;

export function LibraryDialog(props: {
	onClose: () => void;
	onAdd: (assets: LibraryAsset[]) => void;
}) {
	const client = useClient({ apiVersion: '2025-02-19' });
	const [text, setText] = useState('');
	const [limit, setLimit] = useState(120);
	const [items, setItems] = useState<LibraryAsset[]>([]);
	const [selected, setSelected] = useState<LibraryAsset[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const timer = setTimeout(() => {
			client
				.fetch<LibraryAsset[]>(QUERY, { q: text.trim() ? `*${text.trim()}*` : '', limit })
				.then((result) => !cancelled && setItems(result))
				.finally(() => !cancelled && setLoading(false));
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [client, text, limit]);

	const toggle = (asset: LibraryAsset) =>
		setSelected((current) =>
			current.some((item) => item._id === asset._id)
				? current.filter((item) => item._id !== asset._id)
				: [...current, asset]
		);

	const cell = (asset: LibraryAsset) => {
		const isSelected = selected.some((item) => item._id === asset._id);
		const src = thumbnailUrl(asset.url, asset.mimeType);
		return createElement(
			'button',
			{
				key: asset._id,
				type: 'button',
				onClick: () => toggle(asset),
				title: asset.originalFilename,
				style: {
					position: 'relative',
					aspectRatio: '1',
					padding: 0,
					overflow: 'hidden',
					cursor: 'pointer',
					background: 'var(--card-bg-color)',
					border: `3px solid ${isSelected ? 'var(--card-focus-ring-color, #2276fc)' : 'transparent'}`
				}
			},
			src
				? createElement('img', {
						src,
						alt: '',
						loading: 'lazy',
						decoding: 'async',
						style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
					})
				: createElement(
						'span',
						{ style: { fontSize: '0.75rem', padding: '0.25rem', wordBreak: 'break-all' } },
						asset.mimeType?.startsWith('video/') ? `VIDEO ${asset.originalFilename ?? ''}` : 'FILE'
					),
			isSelected &&
				createElement(
					'span',
					{
						style: {
							position: 'absolute',
							top: 4,
							right: 4,
							background: '#2276fc',
							color: '#fff',
							borderRadius: 999,
							padding: '0 0.4rem',
							fontSize: '0.75rem'
						}
					},
					selected.findIndex((item) => item._id === asset._id) + 1
				)
		);
	};

	return createElement(
		Dialog,
		{
			id: 'gallery-library',
			header: 'Add from library',
			onClose: props.onClose,
			width: 3,
			footer: createElement(
				Flex,
				{ padding: 3, gap: 2, justify: 'flex-end', align: 'center' },
				createElement(Text, { size: 1 }, `${selected.length} selected`),
				createElement(Button, {
					text: 'Cancel',
					mode: 'ghost',
					onClick: props.onClose
				}),
				createElement(Button, {
					text: `Add ${selected.length || ''}`.trim(),
					tone: 'primary',
					disabled: !selected.length,
					onClick: () => props.onAdd(selected)
				})
			)
		},
		createElement(
			Box,
			{ padding: 3 },
			createElement(TextInput, {
				placeholder: 'Search by filename',
				value: text,
				onChange: (event: React.ChangeEvent<HTMLInputElement>) => setText(event.currentTarget.value)
			}),
			createElement(
				Card,
				{ marginTop: 3 },
				createElement(
					'div',
					{
						style: {
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
							gap: 8
						}
					},
					items.map(cell)
				),
				loading && createElement(Text, { size: 1, muted: true }, 'Loading...'),
				!loading &&
					items.length >= limit &&
					createElement(
						Box,
						{ marginTop: 3 },
						createElement(Button, {
							text: 'Load more',
							mode: 'ghost',
							onClick: () => setLimit((value) => value + 120)
						})
					)
			)
		)
	);
}
