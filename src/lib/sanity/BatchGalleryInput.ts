import { createElement, useRef, useState } from 'react';
import { insert, setIfMissing, useClient, type ArrayOfObjectsInputProps } from 'sanity';
import { LibraryDialog, type LibraryAsset } from './LibraryDialog';

export function BatchGalleryInput(props: ArrayOfObjectsInputProps) {
	const client = useClient({ apiVersion: '2025-02-19' });
	const input = useRef<HTMLInputElement>(null);
	const [text, setText] = useState('');
	const [status, setStatus] = useState('');
	const [uploading, setUploading] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);

	function addFromLibrary(assets: LibraryAsset[]) {
		props.onChange([
			setIfMissing([]),
			insert(
				assets.map((asset) => ({
					_key: crypto.randomUUID(),
					_type: asset._type === 'sanity.imageAsset' ? 'mediaImage' : 'media',
					asset: { _type: 'reference', _ref: asset._id },
					...(text.trim() ? { alt: text.trim() } : {})
				})),
				'after',
				[-1]
			)
		]);
		setLibraryOpen(false);
	}

	async function upload(files: FileList | null) {
		if (!files?.length) return;
		setUploading(true);
		let uploaded = 0;
		try {
			for (const file of Array.from(files)) {
				setStatus(`Uploading ${uploaded + 1} of ${files.length}: ${file.name}`);
				const asset = await client.assets.upload('file', file, {
					filename: file.name,
					contentType: file.type
				});
				props.onChange([
					setIfMissing([]),
					insert(
						[
							{
								_key: crypto.randomUUID(),
								_type: 'media',
								asset: { _type: 'reference', _ref: asset._id },
								...(text.trim() ? { alt: text.trim() } : {})
							}
						],
						'after',
						[-1]
					)
				]);
				uploaded += 1;
			}
			setStatus(`Uploaded ${uploaded} ${uploaded === 1 ? 'file' : 'files'}.`);
		} catch (error) {
			setStatus(
				`Uploaded ${uploaded} of ${files.length}. ${error instanceof Error ? error.message : 'Upload failed.'}`
			);
		} finally {
			setUploading(false);
			if (input.current) input.current.value = '';
		}
	}

	return createElement(
		'div',
		null,
		createElement(
			'div',
			{ style: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' } },
			createElement('input', {
				type: 'text',
				placeholder: 'Text for this batch (optional)',
				value: text,
				onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
					setText(event.currentTarget.value),
				disabled: uploading || props.readOnly,
				style: { flex: '1 1 14rem', padding: '0.5rem' }
			}),
			createElement('input', {
				ref: input,
				type: 'file',
				accept: 'image/*,video/*',
				multiple: true,
				hidden: true,
				onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
					void upload(event.currentTarget.files)
			}),
			createElement(
				'button',
				{
					type: 'button',
					disabled: uploading || props.readOnly,
					onClick: () => input.current?.click(),
					style: { padding: '0.5rem 1rem' }
				},
				uploading ? 'Uploading...' : 'Upload media'
			),
			createElement(
				'button',
				{
					type: 'button',
					disabled: uploading || props.readOnly,
					onClick: () => setLibraryOpen(true),
					style: { padding: '0.5rem 1rem' }
				},
				'Add from library'
			)
		),
		libraryOpen &&
			createElement(LibraryDialog, {
				onClose: () => setLibraryOpen(false),
				onAdd: addFromLibrary
			}),
		status && createElement('p', { role: 'status' }, status),
		props.renderDefault(props)
	);
}
