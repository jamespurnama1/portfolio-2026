import { error, json } from '@sveltejs/kit';
import OpenAI from 'openai';
import { OPENAI_API_KEY, GMAIL_SEND, GMAIL_PASSWORD, PROMPT_ID } from '$app/env/private';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import * as nodemailer from 'nodemailer';
import type {
	Response as ResponsesAPIResponse,
	ResponseFunctionToolCall,
	ResponseInput,
	ResponseInputItem
} from 'openai/resources/responses/responses';

const MODEL_ID = 'gpt-5-nano';

const rateLimiter = new RateLimiterMemory({
	points: 30,
	duration: 60
});

const client = new OpenAI({
	apiKey: OPENAI_API_KEY
});

const transporter = nodemailer.createTransport({
	port: 465,
	host: 'smtp.gmail.com',
	auth: {
		user: GMAIL_SEND,
		pass: GMAIL_PASSWORD
	},
	secure: true
});

const mailData = (name: string, contact: string, message: string) => ({
	from: {
		name,
		address: GMAIL_SEND
	},
	to: GMAIL_SEND,
	subject: `New Message on jameshenry.site - ${name}`,
	text: `${message}\nPlease reach at: ${contact}`,
	html: `${message}<br>Please reach at: ${contact}`
});

const emptyParamsSchema = {
	type: 'object',
	properties: {},
	required: [],
	additionalProperties: false
} as const;

const functionTools = [
	{
		type: 'function' as const,
		name: 'download_resume',
		description: 'Opens the PDF resume for James Henry so the visitor can download it.',
		parameters: emptyParamsSchema,
		strict: true
	},
	{
		type: 'function' as const,
		name: 'go_to_about',
		description: 'Navigates to the About page so the visitor can learn about James Henry.',
		parameters: emptyParamsSchema,
		strict: true
	},
	{
		type: 'function' as const,
		name: 'random_project',
		description: 'Opens a random featured project from the portfolio.',
		parameters: emptyParamsSchema,
		strict: true
	},
	{
		type: 'function' as const,
		name: 'to_project',
		description: 'Navigates directly to a specific project using its slug.',
		parameters: {
			type: 'object',
			properties: {
				slug: {
					type: 'string',
					description: 'The slug of the requested project, e.g. "immersive-installation".'
				}
			},
			required: ['slug'],
			additionalProperties: false
		},
		strict: true
	},
	{
		type: 'function' as const,
		name: 'send_a_message',
		description: 'Collects the visitor’s contact info and message so it can be emailed to James.',
		parameters: {
			type: 'object',
			properties: {
				name: {
					type: 'string',
					description: 'Visitor name so James knows who reached out.'
				},
				contact_information: {
					type: 'string',
					description: 'Preferred reply method such as email, phone, or social handle.'
				},
				user_message: {
					type: 'string',
					description: 'The message or project brief the visitor wants to send.'
				}
			},
			required: ['name', 'contact_information', 'user_message'],
			additionalProperties: false
		},
		strict: true
	}
];

const tools = [
	{
		type: 'web_search' as const,
		search_context_size: 'medium' as const
	},
	...functionTools
];

export async function GET(event) {
	const conversationId = event.url.searchParams.get('conversationId')?.trim();
	if (!conversationId) {
		throw error(400, 'Missing conversationId');
	}

	try {
		const messages = await fetchConversationHistory(conversationId);
		return json({ success: true, messages });
	} catch (err) {
		console.error('[API] Failed to fetch conversation history:', err);
		errorHandling(err);
		return json(
			{ success: false, message: 'Failed to fetch conversation history' },
			{ status: 500 }
		);
	}
}

export async function POST(event) {
	const clientIP = event.getClientAddress();
	console.log('[API] POST request received from:', clientIP);

	try {
		await rateLimiter.consume(clientIP);
		console.log('[API] Rate limit check passed');
	} catch (err) {
		console.error('[API] Rate limit exceeded:', err);
		throw error(429, 'Too many requests, please try again later.');
	}

	try {
		const requestBody = await event.request.json();
		const userInput = typeof requestBody?.input === 'string' ? requestBody.input.trim() : '';
		const conversationId =
			typeof requestBody?.conversationId === 'string'
				? requestBody.conversationId.trim()
				: undefined;

		if (!userInput) {
			console.error('[API] No user input received');
			throw error(400, 'Error no user input');
		}

		console.log('[API] User input received:', userInput);

		const stream = new ReadableStream<string>({
			async start(controller) {
				try {
					await streamResponse({
						message: userInput,
						conversationId,
						controller
					});
					controller.close();
				} catch (err) {
					console.error('[API] Streaming error:', err);
					controller.error(err instanceof Error ? err : new Error('Unknown streaming error'));
				}
			}
		});

		return new Response(stream, {
			status: 200,
			headers: {
				'Content-Type': 'text/event-stream',
				Connection: 'keep-alive',
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		console.error('[API] Error occurred:', err);
		errorHandling(err);
		return json({ success: false, message: 'Internal Server Error' }, { status: 500 });
	}
}

async function streamResponse({
	message,
	conversationId,
	controller
}: {
	message: string;
	conversationId?: string;
	controller: ReadableStreamDefaultController<string>;
}) {
	let activeConversationId = conversationId ?? '';
	let announcedConversationId = conversationId ?? '';

	const ensureConversation = async () => {
		if (activeConversationId) return;
		try {
			const newConversation = await client.conversations.create();
			console.log('[API] Created new conversation:', newConversation.id);
			announceConversation(newConversation.id);
		} catch (err) {
			console.error('[API] Failed to create conversation:', err);
			throw err;
		}
	};

	const announceConversation = (id?: string | null) => {
		console.log(
			'[API] announceConversation called with:',
			id,
			'already announced:',
			announcedConversationId
		);
		if (!id || id === announcedConversationId) return;
		announcedConversationId = id;
		activeConversationId = id;
		console.log('[API] Conversation updated:', id);
		controller.enqueue(`conv_run ${id} end_conv`);
	};

	const runModel = async (input: ResponseInput) => {
		await ensureConversation();
		console.log(
			'[API] Dispatching Responses API call with conversation:',
			activeConversationId || '<new>'
		);
		console.log('[API] Using prompt:', PROMPT_ID);
		const conversationConfig = activeConversationId
			? { conversation: { id: activeConversationId } }
			: {};
		const responseStream = client.responses.stream({
			model: MODEL_ID,
			prompt: { id: PROMPT_ID },
			...conversationConfig,
			input,
			reasoning: { effort: 'medium' },
			tools,
			tool_choice: 'auto',
			parallel_tool_calls: false,
			stream: true
		});

		responseStream
			.on('response.output_text.delta', (event) => {
				controller.enqueue(event.delta);
			})
			.on('response.completed', (event) => {
				console.log('[API] response.completed conversation payload:', event.response.conversation);
				// Responses API may return conversation identifiers either as conversation objects or via conversation_id.
				announceConversation(
					event.response.conversation?.id ?? (event.response as any).conversation_id
				);
			})
			.on('response.failed', (event) => {
				console.error('[API] Responses API run failed:', event.response.error);
				controller.error(new Error(event.response.error?.message ?? 'Responses API run failed'));
			})
			.on('error', (err) => {
				console.error('[API] Stream error:', err);
				controller.error(err);
			});

		const finalResponse = await responseStream.finalResponse();
		console.log('[API] Final response conversation object:', finalResponse.conversation);
		console.log(
			'[API] Final response conversation_id (if any):',
			(finalResponse as any).conversation_id
		);
		announceConversation(finalResponse.conversation?.id ?? (finalResponse as any).conversation_id);
		return finalResponse;
	};

	let currentResponse = await runModel(buildUserInput(message));

	while (true) {
		const functionCalls = extractFunctionCalls(currentResponse);
		if (!functionCalls.length) {
			break;
		}

		const toolOutputs: ResponseInput = [];
		for (const call of functionCalls) {
			const args = parseFunctionArgs(call);
			controller.enqueue(`func_run ${call.name} ${JSON.stringify(args)} end_run`);
			await maybeSendEmail(call.name, args);
			toolOutputs.push(buildFunctionOutput(call, { status: 'success' }));
		}

		currentResponse = await runModel(toolOutputs);
	}
}

function extractFunctionCalls(response: ResponsesAPIResponse): ResponseFunctionToolCall[] {
	return response.output.filter(
		(item): item is ResponseFunctionToolCall => item.type === 'function_call'
	);
}

function buildUserInput(text: string): ResponseInput {
	return [
		{
			role: 'user',
			type: 'message',
			content: [
				{
					type: 'input_text',
					text
				}
			]
		}
	];
}

function parseFunctionArgs(call: ResponseFunctionToolCall): Record<string, unknown> {
	if (!call.arguments) return {};
	try {
		return JSON.parse(call.arguments);
	} catch (err) {
		console.error('[API] Failed to parse function arguments:', err);
		return {};
	}
}

function buildFunctionOutput(
	call: ResponseFunctionToolCall,
	payload: unknown
): ResponseInputItem.FunctionCallOutput {
	const callId = call.call_id ?? call.id;
	if (!callId) {
		throw new Error('Missing function call id for tool output');
	}
	return {
		type: 'function_call_output',
		call_id: callId,
		output: typeof payload === 'string' ? payload : JSON.stringify(payload)
	};
}

async function maybeSendEmail(name: string, args: Record<string, unknown>) {
	if (name !== 'send_a_message') return;
	const sender = typeof args.name === 'string' ? args.name : '';
	const contact = typeof args.contact_information === 'string' ? args.contact_information : '';
	const message = typeof args.user_message === 'string' ? args.user_message : '';

	if (!sender || !contact || !message) {
		console.warn('[API] Missing fields for send_a_message:', args);
		return;
	}

	try {
		await transporter.sendMail(mailData(sender, contact, message));
		console.log('[API] Email sent successfully');
	} catch (err) {
		console.error('[API] Email error:', err);
	}
}

async function fetchConversationHistory(conversationId: string) {
	const response = await fetch(`https://api.openai.com/v1/conversations/${conversationId}/items`, {
		headers: {
			Authorization: `Bearer ${OPENAI_API_KEY}`,
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw error(response.status, errorText || 'Unable to fetch conversation history');
	}

	const payload = (await response.json()) as ConversationListResponse;
	const items = Array.isArray(payload?.data)
		? payload.data
		: Array.isArray(payload?.items)
			? payload.items
			: [];
	return normalizeConversationItems(items);
}

function normalizeConversationItems(
	items: ConversationItem[]
): Array<{ speaker: string; message: string }> {
	return [...items]
		.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
		.filter((item) => item.type === 'message' && !!item.role && !!item.content)
		.map((item) => ({
			speaker: item.role === 'user' ? 'You' : 'James Henry',
			message: extractItemText(item.content)
		}))
		.filter((entry) => entry.message.length > 0);
}

function extractItemText(content: unknown): string {
	if (!Array.isArray(content)) return '';
	const segments = (content as Array<Record<string, unknown>>)
		.flatMap((part) => extractTextCandidates(part))
		.map((segment) => segment.trim())
		.filter(Boolean);
	return segments.join('\n\n');
}

function extractTextCandidates(part: Record<string, unknown>): string[] {
	const values: unknown[] = [];
	if ('text' in part) values.push(part.text);
	if ('input_text' in part) values.push(part.input_text);
	if ('output_text' in part) values.push(part.output_text);
	if ('content' in part) values.push(part.content);
	return values.flatMap((value) => flattenTextValue(value));
}

function flattenTextValue(value: unknown): string[] {
	if (!value) return [];
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap((entry) => flattenTextValue(entry));
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.value === 'string') return [record.value];
		if ('text' in record) return flattenTextValue(record.text);
		if ('input_text' in record) return flattenTextValue(record.input_text);
		if ('output_text' in record) return flattenTextValue(record.output_text);
		if ('content' in record) return flattenTextValue(record.content);
	}
	return [];
}

type ConversationItem = {
	id: string;
	object?: string;
	type: string;
	role?: string;
	content?: unknown;
	created_at?: number;
};

type ConversationListResponse = {
	object?: string;
	data?: ConversationItem[];
	items?: ConversationItem[];
};

function errorHandling(err: unknown) {
	console.error('[API] Error handler called with:', err);
	if (err instanceof OpenAI.APIError) {
		console.error('[API] OpenAI API Error:', err.status, err.message);
		throw error(err.status as number, err.message);
	} else if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
		console.error('[API] Error with status:', err.status, err.message);
		throw error(err.status as number, err.message as string);
	} else {
		const errMsg = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
		console.error('[API] Unknown error:', errMsg);
	}
}
