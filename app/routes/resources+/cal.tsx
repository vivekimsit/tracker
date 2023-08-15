import type { LoaderArgs } from '@remix-run/node'

import { urlWithParams } from '~/utils/misc.tsx'
import { prisma } from '~/utils/db.server.ts'
import { checkRequiredEnvironmentVariables } from '~/utils/envCheck.ts'

checkRequiredEnvironmentVariables()

export async function loader({ params }: LoaderArgs) {
	return getCalendarState()
}

interface ErrorResponse {
	error: string
	error_description: string
}

export interface CalendarState {
	eventName: string | null
	isVideoMeeting: boolean
}

interface TokenGrant {
	access_token: string
	expires_in: number
	token_type: string
	refresh_token: string
}

interface EventItem {
	kind: string
	etag: string
	id: string
	status: string
	htmlLink: string
	created: string
	updated: string
	summary: string
	description: string
	location: string
	creator: {
		email: string
		self: boolean
	}
	organizer: {
		email: string
		self: boolean
	}
	start: {
		date: string
		timeZone: string
	}
	end: {
		date: string
		timeZone: string
	}
	iCalUID: string
	sequence: number
	reminders: {
		useDefault: boolean
	}
	eventType: string
	conferenceData?: {
		entryPoints: {
			entryPointType: string
			uri: string
			label: string
		}[]
		conferenceSolution: {
			name: string
			iconUri: string
		}
	}
}

const CALENDAR_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars'
const REFRESH_URL = 'https://oauth2.googleapis.com/token'

const getCalendarEvents = async ({
	calendarId,
	startTime,
	maxResults,
	accessToken,
}: {
	calendarId: string
	startTime: Date
	maxResults: number
	accessToken: string
}): Promise<EventItem[]> => {
	const res = await fetch(
		urlWithParams(
			`${CALENDAR_ENDPOINT}/${encodeURIComponent(calendarId)}/events`,
			{
				timeMin: startTime.toISOString(),
				maxResults,
				orderBy: 'startTime',
				singleEvents: true,
			},
		),
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	)
	if (!res.ok) {
		throw new Error('Failed to fetch calendar state')
	}

	const json = (await res.json()) as { items: EventItem[] }
	return json.items
}

/**
 * Fetch calendar state for multiple calendar IDs
 */
export const getCalendarState = async (): Promise<CalendarState> => {
	if (!process.env.CALENDAR_IDS) throw new Error('No calendar IDs specified')

	for (const calendarId of process.env.CALENDAR_IDS.split(',')) {
		let events

		try {
			const token = await getToken()
			events = await getCalendarEvents({
				calendarId,
				startTime: new Date(),
				maxResults: 1,
				accessToken: token,
			})
		} catch (err) {
			const newToken = await refreshAccessToken()
			events = await getCalendarEvents({
				calendarId,
				startTime: new Date(),
				maxResults: 1,
				accessToken: newToken,
			})
		}

		if (!isValidEvent(events[0])) continue

		return extractEventDetails(events[0])
	}

	return { eventName: null, isVideoMeeting: false }
}

/**
 * Check validity of an event
 */
const isValidEvent = (event: EventItem): boolean => {
	if (event?.status !== 'confirmed') return false

	const [start, end] = [event.start.date, event.end.date].map(Date.parse)
	const now = Date.now()

	return now >= start && now <= end
}

/**
 * Extract relevant event details
 */
const extractEventDetails = (event: EventItem): CalendarState => ({
	eventName: event.summary ?? '(No title)',
	isVideoMeeting: hasVideo(event),
})

/**
 * Check if an event is a video meeting
 */
const hasVideo = (event: EventItem): boolean => {
	return !!(
		event.conferenceData?.entryPoints?.some(
			entry => entry.entryPointType === 'video',
		) || event.location?.includes('zoom.us')
	)
}

/**
 * Fetch the OAuth token from the database
 */
const getToken = async (): Promise<string> => {
	const token = await prisma.oauthToken.findUnique({
		where: { refreshToken: process.env.CALENDAR_REFRESH_TOKEN },
	})
	if (!token) throw new Error('No calendar access token found')

	return token.accessToken
}

/**
 * Update the access token by refreshing it
 */
/**
 * Refresh the access token using a stored refresh token.
 */
const refreshAccessToken = async (): Promise<string> => {
	// Validate if environment variables are set
	if (
		!process.env.CALENDAR_CLIENT_ID ||
		!process.env.CALENDAR_CLIENT_SECRET ||
		!process.env.CALENDAR_REFRESH_TOKEN
	) {
		throw new Error('Required environment variables are not set.')
	}

	const response = await requestTokenRefresh()

	if (!response.ok) {
		const errorDetails = (await response.json()) as ErrorResponse
		throw new Error(
			`Failed to refresh token. Error: ${errorDetails.error_description}`,
		)
	}

	const grant = (await response.json()) as TokenGrant
	await storeUpdatedToken(grant)

	return grant.access_token
}

/**
 * Request to refresh the token from the Google OAuth2 endpoint.
 */
const requestTokenRefresh = async () => {
	return await fetch(REFRESH_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			client_id: process.env.CALENDAR_CLIENT_ID,
			client_secret: process.env.CALENDAR_CLIENT_SECRET,
			grant_type: 'refresh_token',
			refresh_token: process.env.CALENDAR_REFRESH_TOKEN,
		}),
	})
}

/**
 * Store the updated access token in the database.
 */
const storeUpdatedToken = async (grant: TokenGrant) => {
	const expiration = new Date(Date.now() + grant.expires_in * 1000 - 1000)
	await prisma.oauthToken.upsert({
		where: { refreshToken: process.env.CALENDAR_REFRESH_TOKEN },
		update: {
			accessToken: grant.access_token,
			expiration,
		},
		create: {
			refreshToken: process.env.CALENDAR_REFRESH_TOKEN!,
			accessToken: grant.access_token,
			expiration,
		},
	})
}
